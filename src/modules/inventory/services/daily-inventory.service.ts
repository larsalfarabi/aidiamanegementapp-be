import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  DataSource,
  Between,
  MoreThanOrEqual,
  IsNull,
} from 'typeorm';
import { DailyInventory } from '../entity/daily-inventory.entity';
import { DailyInventorySnapshots } from '../entity/daily-inventory-snapshots.entity';
import {
  InventoryTransactions,
  TransactionType,
} from '../entity/inventory-transactions.entity';
import { ProductCodes } from '../../products/entity/product_codes.entity';
import BaseResponse from '../../../common/response/base.response';
import { FilterDailyInventoryDto } from '../dto/filter-daily-inventory.dto';
import {
  ResponsePagination,
  ResponseSuccess,
} from '../../../common/interface/response.interface';
import {
  getJakartaDate,
  getJakartaDateString,
} from '../../../common/utils/date.util';

/**
 * DailyInventoryService
 *
 * Service untuk mengelola daily inventory dengan sistem reset harian
 *
 * Fitur:
 * - CRUD untuk daily_inventory
 * - Query dengan filter tanggal, produk, status stok
 * - Perhitungan otomatis stokAkhir (GENERATED COLUMN)
 * - Integrasi dengan transactions dan snapshots
 */
@Injectable()
export class DailyInventoryService extends BaseResponse {
  private readonly logger = new Logger(DailyInventoryService.name);

  constructor(
    @InjectRepository(DailyInventory)
    private readonly dailyInventoryRepo: Repository<DailyInventory>,
    @InjectRepository(DailyInventorySnapshots)
    private readonly snapshotsRepo: Repository<DailyInventorySnapshots>,
    @InjectRepository(InventoryTransactions)
    private readonly transactionRepo: Repository<InventoryTransactions>,
    @InjectRepository(ProductCodes)
    private readonly productCodesRepo: Repository<ProductCodes>,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  /**
   * Update Stock with Date Propagation (Backdate Support)
   *
   * Purpose:
   * - Updates stock for a specific date
   * - If date is in the past, propagates changes to all subsequent days
   * - Ensures data consistency across timeline
   *
   * @param productCodeId Product ID
   * @param delta Change in quantity (positive or negative)
   * @param info Date and metadata for the update
   */
  /**
   * Update Stock with Date Propagation (Backdate Support)
   *
   * Purpose:
   * - Updates stock for a specific date
   * - If date is in the past, propagates changes to all subsequent days
   * - Ensures data consistency across timeline
   */
  async updateStockWithPropagation(
    productCodeId: number,
    delta: number,
    info: {
      businessDate: string;
      userId: number;
      column:
        | 'barangMasuk'
        | 'dipesan'
        | 'barangOutRepack'
        | 'barangOutSample'
        | 'barangOutProduksi'
        | 'stokAwal';
    },
    transactionManager?: any, // EntityManager from generic
  ) {
    const { businessDate, userId, column } = info;
    const today = getJakartaDateString();

    // Use provided manager or default repo manager
    const manager = transactionManager || this.dailyInventoryRepo.manager;

    // 1. Get or Create inventory record for the specific date
    let inventory = await manager.findOne(DailyInventory, {
      where: { productCodeId, businessDate: businessDate },
    });

    if (!inventory) {
      // Find previous day's stock for stokAwal
      const prevInventory = await manager
        .createQueryBuilder(DailyInventory, 'di')
        .where('di.productCodeId = :productCodeId', { productCodeId })
        .andWhere('di.businessDate < :businessDate', { businessDate })
        .orderBy('di.businessDate', 'DESC')
        .getOne();

      const stokAwal = prevInventory ? Number(prevInventory.stokAkhir) : 0;

      // Create new record
      inventory = manager.create(DailyInventory, {
        productCodeId,
        businessDate: businessDate,
        stokAwal,
        isActive: true,
        createdBy: userId,
        // Initialize zeros
        barangMasuk: 0,
        dipesan: 0,
        barangOutRepack: 0,
        barangOutSample: 0,
        barangOutProduksi: 0,
        stokAkhir: stokAwal, // Approx
      });
    }

    // 2. Update specific column
    // Convert to number to handle any string issues
    const currentVal = Number(inventory[column] || 0);
    inventory[column] = currentVal + delta;
    inventory.updatedBy = userId;

    await manager.save(DailyInventory, inventory);

    // 3. Propagate change to future days if backdate or if updating stokAwal
    // Note: If updating stokAwal (e.g. adjustment), we always effect future days
    if (businessDate < today || column === 'stokAwal') {
      // Determine invalidation direction
      // stokAkhir = stokAwal + barangMasuk - dipesan - barangOut...
      // So if we add to 'dipesan', we REDUCE the stock.
      let propagationDelta = delta;
      if (
        [
          'dipesan',
          'barangOutRepack',
          'barangOutSample',
          'barangOutProduksi',
        ].includes(column)
      ) {
        propagationDelta = -delta;
      }

      await this.propagateStockChange(
        productCodeId,
        propagationDelta,
        businessDate,
        manager,
      );
    }

    return inventory;
  }

  /**
   * Propagate stock change to future days
   * Updates 'stokAwal' for all daily_inventory records after the given date
   */
  private async propagateStockChange(
    productCodeId: number,
    delta: number,
    fromDate: string,
    manager: any,
  ) {
    await manager
      .createQueryBuilder()
      .update(DailyInventory)
      .set({
        stokAwal: () => `stokAwal + ${delta}`,
      })
      .where('productCodeId = :productCodeId', { productCodeId })
      .andWhere('businessDate > :fromDate', { fromDate })
      .execute();

    this.logger.log(
      `Propagated stock change of ${delta} for product ${productCodeId} from ${fromDate}`,
    );
  }

  /**
   * GET /inventory/daily - Get daily inventory dengan filter
   *
   * Query params:
   * - businessDate: YYYY-MM-DD (default: today)
   * - productCodeId: Filter by product
   * - stockStatus: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'AVAILABLE' | 'OVERSTOCK'
   * - isActive: boolean
   * - page, pageSize: pagination
   */
  async findAll(query: FilterDailyInventoryDto) {
    const {
      businessDate,
      productCodeId,
      stockStatus,
      isActive,
      mainCategory,
      search,
      page = 1,
      pageSize = 10,
    } = query;

    const queryBuilder = this.dailyInventoryRepo
      .createQueryBuilder('di')
      .leftJoin('di.productCode', 'pc')
      .leftJoin('pc.product', 'product')
      .leftJoin('pc.size', 'size')
      .leftJoin('pc.category', 'mainCat')
      .leftJoin('product.category', 'subCat')
      .select([
        'di',
        'pc.id',
        'pc.productCode',
        'product.id',
        'product.name',
        'product.productType',
        'size.id',
        'size.sizeValue',
        'size.unitOfMeasure',
        'mainCat.name',
        'subCat.name',
      ])
      .where('di.businessDate = :businessDate', { businessDate: businessDate })
      .andWhere('di.deletedAt IS NULL');

    // Filter by search (product name or code)
    if (search) {
      queryBuilder.andWhere(
        '(LOWER(pc.productCode) LIKE :search OR LOWER(product.name) LIKE :search)',
        { search: `%${search.toLowerCase()}%` },
      );
    }

    // Filter by productCodeId
    if (productCodeId) {
      queryBuilder.andWhere('di.productCodeId = :productCodeId', {
        productCodeId,
      });
    }

    // Filter by isActive
    if (isActive !== undefined) {
      queryBuilder.andWhere('di.isActive = :isActive', { isActive });
    }

    // Filter by main category (SWAPPED: now from ProductCodes.category)
    if (mainCategory) {
      queryBuilder.andWhere('mainCat.name = :mainCategory', { mainCategory });
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply pagination
    const skip = (page - 1) * pageSize;
    queryBuilder.skip(skip).take(pageSize);

    // Order by product name
    queryBuilder.orderBy('product.name', 'ASC');

    const items = await queryBuilder.getMany();

    // Filter by stock status (client-side filter since it's a virtual property)
    let filteredItems = items;
    if (stockStatus) {
      filteredItems = items.filter((item) => item.stockStatus === stockStatus);
    }

    // Get statistics for ALL items (not affected by pagination or stockStatus filter)
    // Build a separate query for statistics to count stock levels from entire dataset
    const statsQueryBuilder = this.dailyInventoryRepo
      .createQueryBuilder('di')
      .leftJoin('di.productCode', 'pc')
      .leftJoin('pc.category', 'mainCat')
      .where('di.businessDate = :businessDate', { businessDate: businessDate })
      .andWhere('di.deletedAt IS NULL')
      .andWhere('di.isActive = :isActive', { isActive: true });

    // Apply same mainCategory filter for stats
    if (mainCategory) {
      statsQueryBuilder.andWhere('mainCat.name = :mainCategory', {
        mainCategory,
      });
    }

    // Count stock levels using raw SQL
    const statsResult = await statsQueryBuilder
      .select('COUNT(*)', 'totalProducts')
      .addSelect(
        'SUM(CASE WHEN di.stokAkhir <= 0 THEN 1 ELSE 0 END)',
        'outOfStock',
      )
      .addSelect(
        'SUM(CASE WHEN di.stokAkhir > 0 AND di.minimumStock IS NOT NULL AND di.stokAkhir <= di.minimumStock THEN 1 ELSE 0 END)',
        'lowStock',
      )
      .addSelect(
        'SUM(CASE WHEN di.stokAkhir > 0 AND (di.minimumStock IS NULL OR di.stokAkhir > di.minimumStock) THEN 1 ELSE 0 END)',
        'normalStock',
      )
      .getRawOne();

    const statistics = {
      totalProducts: parseInt(statsResult?.totalProducts || '0', 10),
      normalStock: parseInt(statsResult?.normalStock || '0', 10),
      lowStock: parseInt(statsResult?.lowStock || '0', 10),
      outOfStock: parseInt(statsResult?.outOfStock || '0', 10),
    };

    return {
      ...this._pagination(
        'Daily inventory retrieved successfully',
        filteredItems,
        total,
        page,
        pageSize,
      ),
      statistics,
    };
  }

  /**
   * GET /inventory/daily/:id - Get daily inventory by ID
   */
  async findById(id: number): Promise<ResponseSuccess> {
    const inventory = await this.dailyInventoryRepo.findOne({
      where: { id, deletedAt: IsNull() },
      relations: [
        'productCode',
        'productCode.product',
        'productCode.size',
        'productCode.category',
      ],
    });

    if (!inventory) {
      throw new NotFoundException(`Daily inventory with ID ${id} not found`);
    }

    return this._success('Daily inventory retrieved successfully', inventory);
  }

  /**
   * GET /inventory/daily/product/:productCodeId - Get daily inventory for specific product
   * Returns current day's inventory
   */
  async findByProductCode(productCodeId: number): Promise<ResponseSuccess> {
    const today = new Date(getJakartaDateString());

    const inventory = await this.dailyInventoryRepo.findOne({
      where: {
        productCodeId,
        businessDate: today,
        deletedAt: IsNull(),
      },
      relations: [
        'productCode',
        'productCode.product',
        'productCode.size',
        'productCode.category',
      ],
    });

    if (!inventory) {
      throw new NotFoundException(
        `Daily inventory for product ${productCodeId} on ${this.formatDate(today)} not found`,
      );
    }

    return this._success('Daily inventory retrieved successfully', inventory);
  }

  /**
   * GET /inventory/daily/product/:productCodeId/date/:date - Get daily inventory for specific product and date
   */
  async findByProductCodeAndDate(
    productCodeId: number,
    date: string,
  ): Promise<ResponseSuccess> {
    const inventory = await this.dailyInventoryRepo.findOne({
      where: {
        productCodeId,
        businessDate: new Date(date),
        deletedAt: IsNull(),
      },
      relations: [
        'productCode',
        'productCode.product',
        'productCode.size',
        'productCode.category',
      ],
    });

    if (!inventory) {
      throw new NotFoundException(
        `Daily inventory for product ${productCodeId} on ${date} not found`,
      );
    }

    return this._success('Daily inventory retrieved successfully', inventory);
  }

  /**
   * POST /inventory/daily - Create initial inventory record
   *
   * Biasanya tidak diperlukan karena cron job otomatis membuat record baru setiap hari.
   * Method ini untuk setup awal atau recovery.
   */
  async create(dto: any, userId: number): Promise<ResponseSuccess> {
    const {
      productCodeId,
      businessDate,
      stokAwal,
      minimumStock,
      maximumStock,
      notes,
    } = dto;

    // Verify product exists
    const product = await this.productCodesRepo.findOne({
      where: { id: productCodeId },
    });

    if (!product) {
      throw new NotFoundException(`Product code ${productCodeId} not found`);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Check if record already exists for the specific date
      const existing = await queryRunner.manager.findOne(DailyInventory, {
        where: {
          productCodeId,
          businessDate: businessDate as any,
          deletedAt: IsNull(),
        },
      });

      if (existing) {
        throw new ConflictException(
          `Daily inventory for product ${productCodeId} on ${businessDate} already exists`,
        );
      }

      // 2. Create the initial record
      const inventory = queryRunner.manager.create(DailyInventory, {
        productCodeId,
        businessDate,
        stokAwal: stokAwal || 0,
        barangMasuk: 0,
        dipesan: 0,
        barangOutRepack: 0,
        barangOutSample: 0,
        barangOutProduksi: 0,
        minimumStock,
        maximumStock,
        isActive: true,
        notes,
        createdBy: userId,
        updatedBy: userId,
      });

      const saved = await queryRunner.manager.save(DailyInventory, inventory);

      // 3. GAP FILLING & PROPAGATION LOGIC
      // Strategy:
      // a. Identify gaps between businessDate and Today.
      // b. Fill gaps with "placeholder" records (stokAwal = 0).
      // c. Run propagateStockChange to add the actual stokAwal to ALL future records (both gaps and existing).
      // This ensures O(1) update for existing records and consistency for future dates.

      const today = getJakartaDateString();
      if (businessDate < today) {
        let currentDate = new Date(businessDate);
        currentDate.setDate(currentDate.getDate() + 1); // Start from next day

        const endDate = new Date(today);

        // Fetch all existing future records to identifying gaps
        const futureRecords = await queryRunner.manager.find(DailyInventory, {
          where: {
            productCodeId,
            businessDate: MoreThanOrEqual(this.formatDate(currentDate) as any),
            deletedAt: IsNull(),
          },
          select: ['businessDate'], // We only need dates
        });

        const existingDates = new Set(
          futureRecords.map(
            (r) => new Date(r.businessDate).toISOString().split('T')[0],
          ),
        );

        const gapRecords: DailyInventory[] = [];

        // Loop to find gaps
        while (currentDate <= endDate) {
          const dateStr = this.formatDate(currentDate);

          if (!existingDates.has(dateStr)) {
            // Found a gap! Create placeholder record with 0 stock.
            // transform will happen via propagation.
            const gapRecord = queryRunner.manager.create(DailyInventory, {
              productCodeId,
              businessDate: dateStr as any,
              stokAwal: 0, // Placeholder, will be updated by propagation
              barangMasuk: 0,
              dipesan: 0,
              barangOutRepack: 0,
              barangOutSample: 0,
              barangOutProduksi: 0,
              minimumStock, // Propagate settings
              maximumStock,
              isActive: true,
              notes: 'Auto-filled gap date',
              createdBy: userId,
              updatedBy: userId,
              // stokAkhir generated as 0
            });
            gapRecords.push(gapRecord);
          }
          currentDate.setDate(currentDate.getDate() + 1);
        }

        // Bulk Insert Gaps
        if (gapRecords.length > 0) {
          await queryRunner.manager.save(DailyInventory, gapRecords);
        }

        // 4. PROPAGATE CHANGE
        // Now that gaps are filled with 0, and overlaps exist,
        // we add the initial stock amount to ALL records > businessDate.
        if (stokAwal && stokAwal !== 0) {
          await this.propagateStockChange(
            productCodeId,
            stokAwal,
            businessDate,
            queryRunner.manager,
          );
        }
      }

      await queryRunner.commitTransaction();

      // Reload to return
      const result = await this.dailyInventoryRepo.findOne({
        where: { id: saved.id },
        relations: ['productCode'],
      });

      return this._success('Daily inventory created successfully', result);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to create initial inventory', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * PATCH /inventory/daily/:id - Update inventory settings
   *
   * Hanya bisa update:
   * - minimumStock
   * - maximumStock
   * - notes
   * - isActive
   *
   * TIDAK BISA update:
   * - stokAwal, barangMasuk, dipesan, dll (harus via transaction operations)
   * - stokAkhir (GENERATED COLUMN)
   */
  async update(id: number, dto: any, userId: number): Promise<ResponseSuccess> {
    const inventory = await this.dailyInventoryRepo.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!inventory) {
      throw new NotFoundException(`Daily inventory with ID ${id} not found`);
    }

    const { minimumStock, maximumStock, notes, isActive } = dto;

    // Only update allowed fields
    if (minimumStock !== undefined) inventory.minimumStock = minimumStock;
    if (maximumStock !== undefined) inventory.maximumStock = maximumStock;
    if (notes !== undefined) inventory.notes = notes;
    if (isActive !== undefined) inventory.isActive = isActive;

    inventory.updatedBy = userId;

    await this.dailyInventoryRepo.save(inventory);

    // Reload with relations
    const updated = await this.dailyInventoryRepo.findOne({
      where: { id },
      relations: ['productCode'],
    });

    return this._success('Daily inventory updated successfully', updated);
  }

  /**
   * DELETE /inventory/daily/:id - Soft delete inventory record
   */
  async softDelete(id: number): Promise<ResponseSuccess> {
    const inventory = await this.dailyInventoryRepo.findOne({
      where: { id },
    });

    if (!inventory) {
      throw new NotFoundException(`Daily inventory with ID ${id} not found`);
    }

    await this.dailyInventoryRepo.softDelete(id);

    return this._success('Daily inventory deleted successfully');
  }

  /**
   * POST /inventory/daily/bulk-register - Bulk register products to inventory
   *
   * Human-Centered Design: One-click setup for testing or initial deployment
   *
   * @param mainCategory Filter products by main category (optional - if not provided, register ALL)
   * @param initialStock Initial stock amount (default: 100 for testing)
   * @param minimumStock Minimum stock threshold (default: 10)
   * @param userId User performing the action
   */
  async bulkRegisterProducts(
    mainCategory: string | null,
    initialStock: number,
    minimumStock: number,
    userId: number,
  ): Promise<ResponseSuccess> {
    const businessDate = getJakartaDateString();

    // Get all product codes, optionally filtered by mainCategory
    const queryBuilder = this.productCodesRepo
      .createQueryBuilder('pc')
      .leftJoinAndSelect('pc.product', 'product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('pc.size', 'size')
      .where('pc.isActive = :isActive', { isActive: true });

    if (mainCategory) {
      queryBuilder.andWhere('category.name = :mainCategory', { mainCategory });
    }

    const productCodes = await queryBuilder.getMany();

    if (productCodes.length === 0) {
      throw new NotFoundException(
        mainCategory
          ? `No active products found for category: ${mainCategory}`
          : 'No active products found',
      );
    }

    // Get existing inventory records for today
    const existingInventory = await this.dailyInventoryRepo.find({
      where: {
        businessDate: businessDate as any,
        deletedAt: IsNull(),
      },
    });

    const existingProductCodeIds = new Set(
      existingInventory.map((inv) => inv.productCodeId),
    );

    // Filter products that are not yet registered
    const productsToRegister = productCodes.filter(
      (pc) => !existingProductCodeIds.has(pc.id),
    );

    if (productsToRegister.length === 0) {
      return this._success('All products already registered in inventory', {
        totalProducts: productCodes.length,
        alreadyRegistered: existingProductCodeIds.size,
        newlyRegistered: 0,
      });
    }

    // Bulk create inventory records
    const inventoryRecords = productsToRegister.map((pc) =>
      this.dailyInventoryRepo.create({
        productCodeId: pc.id,
        businessDate: businessDate as any,
        stokAwal: initialStock,
        barangMasuk: 0,
        dipesan: 0,
        barangOutRepack: 0,
        barangOutSample: 0,
        barangOutProduksi: 0,
        minimumStock: minimumStock,
        maximumStock: initialStock * 2, // Set max as 2x initial stock
        isActive: true,
        notes: `Bulk registration - Initial stock: ${initialStock}`,
        createdBy: userId,
        updatedBy: userId,
      }),
    );

    await this.dailyInventoryRepo.save(inventoryRecords);

    return this._success('Products registered to inventory successfully', {
      totalProducts: productCodes.length,
      alreadyRegistered: existingProductCodeIds.size,
      newlyRegistered: productsToRegister.length,
      mainCategory: mainCategory || 'ALL',
      initialStock,
      minimumStock,
      registeredProducts: productsToRegister.map((pc) => ({
        productCode: pc.productCode,
        name: pc.product.name,
        category: pc.product.category.name,
      })),
    });
  }

  /**
   * GET /inventory/daily/low-stock - Get products with low stock
   * Returns products where stokAkhir <= minimumStock
   */
  async getLowStockProducts(businessDate?: string): Promise<ResponseSuccess> {
    const targetDate = businessDate || getJakartaDateString();

    const items = await this.dailyInventoryRepo
      .createQueryBuilder('di')
      .leftJoinAndSelect('di.productCode', 'pc')
      .leftJoinAndSelect('pc.product', 'product')
      .leftJoinAndSelect('pc.size', 'size')
      .where('di.businessDate = :businessDate', { businessDate: targetDate })
      .andWhere('di.isActive = :isActive', { isActive: true })
      .andWhere('di.deletedAt IS NULL')
      .andWhere('di.minimumStock IS NOT NULL')
      // Note: stokAkhir is GENERATED, so we need raw SQL for comparison
      .andWhere('di.stokAkhir <= di.minimumStock')
      .orderBy('di.stokAkhir', 'ASC')
      .getMany();

    return this._success('Low stock products retrieved successfully', items);
  }

  /**
   * GET /inventory/daily/summary - Get stock summary for a date
   */
  async getStockSummary(businessDate?: string): Promise<ResponseSuccess> {
    const targetDate = businessDate || getJakartaDateString();

    const result = await this.dailyInventoryRepo
      .createQueryBuilder('di')
      .select('COUNT(di.id)', 'totalProducts')
      .addSelect('SUM(di.stokAwal)', 'totalStokAwal')
      .addSelect('SUM(di.barangMasuk)', 'totalBarangMasuk')
      .addSelect('SUM(di.dipesan)', 'totalDipesan')
      .addSelect('SUM(di.barangOutRepack)', 'totalBarangOutRepack')
      .addSelect('SUM(di.barangOutSample)', 'totalBarangOutSample')
      .addSelect('SUM(di.stokAkhir)', 'totalStokAkhir')
      .where('di.businessDate = :businessDate', { businessDate: targetDate })
      .andWhere('di.isActive = :isActive', { isActive: true })
      .andWhere('di.deletedAt IS NULL')
      .getRawOne();

    return this._success('Stock summary retrieved successfully', {
      businessDate: targetDate,
      ...result,
    });
  }

  /**
   * GET /inventory/daily/history/:productCodeId - Get inventory history for a product
   */
  async getProductHistory(
    productCodeId: number,
    startDate: string,
    endDate: string,
  ): Promise<ResponseSuccess> {
    const items = await this.dailyInventoryRepo.find({
      where: {
        productCodeId,
        businessDate: Between(new Date(startDate), new Date(endDate)),
        deletedAt: IsNull(),
      },
      relations: ['productCode'],
      order: { businessDate: 'ASC' },
    });

    return this._success('Product history retrieved successfully', items);
  }

  /**
   * GET /inventory/snapshots - Get historical snapshots
   */
  async getSnapshots(query: any): Promise<ResponsePagination> {
    const {
      productCodeId,
      startDate,
      endDate,
      page = 1,
      pageSize = 10,
    } = query;

    const queryBuilder = this.snapshotsRepo
      .createQueryBuilder('snap')
      .leftJoinAndSelect('snap.productCode', 'pc')
      .leftJoinAndSelect('pc.product', 'product');

    // Filter by product
    if (productCodeId) {
      queryBuilder.andWhere('snap.productCodeId = :productCodeId', {
        productCodeId,
      });
    }

    // Filter by date range
    if (startDate && endDate) {
      queryBuilder.andWhere(
        'snap.snapshotDate BETWEEN :startDate AND :endDate',
        {
          startDate,
          endDate,
        },
      );
    } else if (startDate) {
      queryBuilder.andWhere('snap.snapshotDate >= :startDate', { startDate });
    } else if (endDate) {
      queryBuilder.andWhere('snap.snapshotDate <= :endDate', { endDate });
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply pagination
    const skip = (page - 1) * pageSize;
    queryBuilder.skip(skip).take(pageSize);

    // Order by date DESC
    queryBuilder.orderBy('snap.snapshotDate', 'DESC');
    queryBuilder.addOrderBy('snap.createdAt', 'DESC');

    const items = await queryBuilder.getMany();

    return this._pagination(
      'Snapshots retrieved successfully',
      items,
      total,
      page,
      pageSize,
    );
  }

  /**
   * Utility: Format date to YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    return getJakartaDateString(date);
  }

  /**
   * Utility: Get or create today's inventory record
   * Digunakan oleh transaction operations untuk memastikan record hari ini ada
   */
  async getOrCreateTodayInventory(
    productCodeId: number,
    userId: number,
  ): Promise<DailyInventory> {
    const today = new Date(getJakartaDateString());

    let inventory = await this.dailyInventoryRepo.findOne({
      where: {
        productCodeId,
        businessDate: today,
        deletedAt: IsNull(),
      },
    });

    if (!inventory) {
      // Create new record for today
      // This should normally be created by cron job, but we create it here as fallback
      this.logger.warn(
        `Creating missing inventory record for product ${productCodeId} on ${this.formatDate(today)}`,
      );

      inventory = this.dailyInventoryRepo.create({
        productCodeId,
        businessDate: this.formatDate(today),
        stokAwal: 0,
        barangMasuk: 0,
        dipesan: 0,
        barangOutRepack: 0,
        barangOutSample: 0,
        isActive: true,
        createdBy: userId,
        updatedBy: userId,
      });

      await this.dailyInventoryRepo.save(inventory);
    }

    return inventory;
  }

  /**
   * Check stock availability for order items based on invoice date
   *
   * @param invoiceDate - The invoice date to check stock for (YYYY-MM-DD)
   * @param orderItems - Array of { productCodeId, quantity }
   * @returns Stock validation result with item-level details
   */
  async checkStock(
    invoiceDate: string,
    orderItems: Array<{ productCodeId: number; quantity: number }>,
  ): Promise<ResponseSuccess> {
    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(invoiceDate)) {
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD');
    }

    // Get today's date for validation type determination
    const today = getJakartaDate();
    const todayStr = getJakartaDateString();
    const invoiceDateObj = new Date(invoiceDate);

    // Determine validation type
    let validationType: 'SAME_DAY' | 'FUTURE_DATE' | 'PAST_DATE';
    if (invoiceDate === todayStr) {
      validationType = 'SAME_DAY';
    } else if (invoiceDateObj > today) {
      validationType = 'FUTURE_DATE';
    } else {
      validationType = 'PAST_DATE';
    }

    // Get all product codes for the order items
    const productCodeIds = orderItems.map((item) => item.productCodeId);

    // Fetch daily inventory for the invoice date
    const inventoryRecords = await this.dailyInventoryRepo
      .createQueryBuilder('di')
      .leftJoinAndSelect('di.productCode', 'pc')
      .leftJoinAndSelect('pc.product', 'product')
      .leftJoinAndSelect('pc.size', 'size')
      .leftJoinAndSelect('pc.category', 'category') // âœ… SWAPPED: pc.category = Main Category (level 0)
      .where('di.businessDate = :businessDate', { businessDate: invoiceDate })
      .andWhere('di.productCodeId IN (:...productCodeIds)', { productCodeIds })
      .andWhere('di.deletedAt IS NULL')
      .getMany();

    // Build a map for quick lookup
    const inventoryMap = new Map<number, DailyInventory>();
    inventoryRecords.forEach((inv) => {
      inventoryMap.set(inv.productCodeId, inv);
    });

    // Validate each order item
    const items = orderItems.map((orderItem) => {
      const inventory = inventoryMap.get(orderItem.productCodeId);

      // Default values if no inventory record found
      if (!inventory) {
        return {
          productCodeId: orderItem.productCodeId,
          productCode: 'UNKNOWN',
          productName: 'Unknown Product',
          requestedQuantity: orderItem.quantity,
          availableStock: 0,
          reservedStock: 0,
          actualAvailable: 0,
          minimumStock: 0,
          stockStatus: 'OUT_OF_STOCK' as const,
          isValid: false,
          shortage: orderItem.quantity,
          message: 'No inventory record found for this date',
        };
      }

      // Calculate actual available = stokAkhir (which already includes -dipesan)
      // stokAkhir = stokAwal + barangMasuk - dipesan - barangOutRepack - barangOutSample
      const actualAvailable = Number(inventory.stokAkhir) || 0;
      const requestedQuantity = orderItem.quantity;
      const shortage = Math.max(0, requestedQuantity - actualAvailable);

      // Determine stock status
      let stockStatus:
        | 'SUFFICIENT'
        | 'LOW_STOCK'
        | 'INSUFFICIENT'
        | 'OUT_OF_STOCK';
      let isValid: boolean;
      let message: string;

      if (actualAvailable === 0) {
        stockStatus = 'OUT_OF_STOCK';
        isValid = false;
        message = 'Product is out of stock';
      } else if (requestedQuantity > actualAvailable) {
        stockStatus = 'INSUFFICIENT';
        isValid = false;
        message = `Insufficient stock. Need ${shortage} more units`;
      } else if (actualAvailable <= (Number(inventory.minimumStock) || 0)) {
        stockStatus = 'LOW_STOCK';
        isValid = true;
        message = 'Stock is running low but sufficient for this order';
      } else {
        stockStatus = 'SUFFICIENT';
        isValid = true;
        message = 'Stock is sufficient';
      }

      return {
        productCodeId: orderItem.productCodeId,
        productCode: inventory.productCode?.productCode || 'N/A',
        productName: inventory.productCode?.product?.name || 'Unknown',
        size: inventory.productCode?.size?.sizeValue || 'N/A',
        category: inventory.productCode?.category?.name || 'N/A',
        requestedQuantity,
        availableStock: Number(inventory.stokAkhir) || 0,
        reservedStock: Number(inventory.dipesan) || 0,
        actualAvailable,
        minimumStock: Number(inventory.minimumStock) || 0,
        stockStatus,
        isValid,
        shortage,
        message,
      };
    });

    // Calculate summary
    const summary = {
      totalItems: items.length,
      sufficientItems: items.filter((i) => i.stockStatus === 'SUFFICIENT')
        .length,
      lowStockItems: items.filter((i) => i.stockStatus === 'LOW_STOCK').length,
      insufficientItems: items.filter((i) => i.stockStatus === 'INSUFFICIENT')
        .length,
      outOfStockItems: items.filter((i) => i.stockStatus === 'OUT_OF_STOCK')
        .length,
    };

    // Determine overall validation result
    const hasInsufficientStock =
      summary.insufficientItems > 0 || summary.outOfStockItems > 0;
    const isValid = !hasInsufficientStock;

    // For same-day orders, block if insufficient
    // For future orders, warn but don't block
    const shouldBlock = validationType === 'SAME_DAY' && hasInsufficientStock;

    // Build response message
    let validationMessage: string;
    if (validationType === 'SAME_DAY') {
      if (shouldBlock) {
        validationMessage =
          'Cannot create order: Insufficient stock for same-day invoice';
      } else {
        validationMessage = 'Stock validation passed for same-day invoice';
      }
    } else if (validationType === 'FUTURE_DATE') {
      if (hasInsufficientStock) {
        validationMessage = `Warning: Projected stock shortage for invoice date ${invoiceDate}. Ensure production before this date.`;
      } else {
        validationMessage = `Stock projection looks good for invoice date ${invoiceDate}`;
      }
    } else {
      validationMessage = `Historical stock check for date ${invoiceDate}`;
    }

    return this._success('Stock validation completed', {
      isValid,
      shouldBlock,
      validationType,
      invoiceDate,
      items,
      summary,
      message: validationMessage,
    });
  }

  /**
   * Sync Backdated Stock Correction
   *
   * Purpose:
   * Replays inventory history from a specific date to ensure consistency.
   * Useful when backdated transactions are inserted without proper propagation logic,
   * or when data inconsistencies are detected.
   *
   * Algorithm:
   * 1. Iterate from startDate to Today
   * 2. For each day:
   *    a. Aggregate ALL transactions for that day
   *    b. Update DailyInventory columns (barangMasuk, keluar, etc.)
   *    c. Recalculate stokAkhir (via DB generated column or manual check)
   * 3. Propagate stokAkhir of Day N to stokAwal of Day N+1
   */
  async syncBackdatedStock(
    startDateStr: string,
    productCodeId?: number,
  ): Promise<{ processedDays: number; updatedRecords: number }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const today = new Date(getJakartaDateString()); // Normalize to midnight Jakarta
      const startDate = new Date(startDateStr);
      let currentDate = new Date(startDate);
      let updatedCount = 0;
      let daysCount = 0;

      this.logger.log(
        `ðŸ”„ Starting Stock Sync from ${startDateStr} for Product: ${productCodeId || 'ALL'}`,
      );

      while (currentDate <= today) {
        const dateStr = this.formatDate(currentDate);
        daysCount++;

        // 1. Fetch transactions for this day
        const query = this.transactionRepo
          .createQueryBuilder('it')
          .select('it.productCodeId', 'productCodeId')
          .addSelect('it.transactionType', 'type')
          .addSelect('SUM(it.quantity)', 'totalChange')
          .where('it.transactionDate >= :startOfDay', {
            startOfDay: `${dateStr} 00:00:00`,
          })
          .andWhere('it.transactionDate <= :endOfDay', {
            endOfDay: `${dateStr} 23:59:59`,
          })
          .groupBy('it.productCodeId')
          .addGroupBy('it.transactionType');

        if (productCodeId) {
          query.andWhere('it.productCodeId = :productCodeId', {
            productCodeId,
          });
        }

        const transactions = await query.getRawMany();

        // Group by ProductCodeId
        const productStats = new Map<
          number,
          {
            barangMasuk: number;
            barangOutRepack: number;
            barangOutSample: number;
            barangOutProduksi: number;
            adjustment: number; // Net adjustment
          }
        >();

        // Initialize Map from query results
        for (const t of transactions) {
          const pid = t.productCodeId;
          const qty = Number(t.totalChange);
          const type = t.type;

          if (!productStats.has(pid)) {
            productStats.set(pid, {
              barangMasuk: 0,
              barangOutRepack: 0,
              barangOutSample: 0,
              barangOutProduksi: 0,
              adjustment: 0,
            });
          }

          const stats = productStats.get(pid)!;

          // Map Transaction Types to Inventory Columns
          // PURCHASE, PRODUCTION_RESULT, RETURN_IN -> barangMasuk
          // SALE, PRODUCTION_USAGE, REPACK_SOURCE, SAMPLE_OUT -> barangOut...
          // ADJUSTMENT, INITIAL, STOCK_OPNAME -> handled via stokAwal adjustment or separate logic?
          // For DailyInventory structural consistency:
          // barangMasuk includes: PURCHASE, PRODUCTION_RESULT, RETURN_IN
          // barangOut includes: SALE (dipesan?), PRODUCTION_USAGE, SAMPLE_OUT, REPACK_SOURCE
          // Adjustment is tricky. Usually adjustments modify stokAwal or are treated as in/out.
          // Based on DB schema, we might not have a specific 'adjustment' column.
          // Adjustments usually modify the *current* stock directly.
          // For this sync, we will map positive adjustments to 'barangMasuk' and negative to 'barangOutSample' (or generic out)
          // OR better: Update `stokAwal` of NEXT day? No, that breaks the formula.
          // DailyInventory Formula: stokAkhir = stokAwal + barangMasuk - dipesan - barangOut...
          // If we have an adjustment, we should probably fit it into 'barangMasuk' (if +) or 'barangOut...' (if -).
          // Let's assume 'barangMasuk' for + and 'barangOutSample' (or similar) for -.
          // Ideally, we should have an 'adjustment' column. If not, we leverage existing columns.

          if (
            ['PURCHASE', 'PRODUCTION_RESULT', 'RETURN_IN'].includes(type) ||
            (type === 'ADJUSTMENT' && qty > 0) ||
            type === 'INITIAL_STOCK' ||
            (type === 'STOCK_OPNAME' && qty > 0)
          ) {
            stats.barangMasuk += Math.abs(qty);
          } else if (
            ['SALE', 'RETURN_OUT'].includes(type) // SALE usually goes to 'dipesan' or 'terjual'
          ) {
            // Note: 'dipesan' in this system seems to mean 'Sold/Reserved'
            // Need to verify if 'dipesan' is cleared upon delivery or stays.
            // Assuming 'dipesan' acts as 'Sales Out'.
            // But wait, 'dipesan' might be temporary reserve.
            // If transaction 'SALE' exists, it's final.
            // Let's assume 'dipesan' is effectively 'Sales Out' for valid ended stock.
            // Or maybe there is no 'barangKeluarSales'?
            // Schema has: barangMasuk, dipesan, barangOutRepack, barangOutSample, barangOutProduksi.
            // 'dipesan' likely accumulates sales.
            stats.barangMasuk -= 0; // No-op placeholder
            // 'dipesan' is special; handled separately or mapped here?
            // If 'dipesan' accumulates Sales Orders, we should treat 'SALE' transaction as adding to 'dipesan'.
            // However, 'dipesan' is usually "Reserved", not "Shipped".
            // If transaction is 'SALE', it means stock is GONE.
            // We map SALE to 'dipesan' column for lack of better column (or 'barangOutSample' if 'dipesan' is transient).
            // Checking logic in daily-inventory.service:
            // updateStock... 'dipesan' reduces stock.
            // So we map SALE to 'dipesan'.
          } else if (
            ['PRODUCTION_USAGE'].includes(type) ||
            (type === 'ADJUSTMENT' && qty < 0) ||
            (type === 'STOCK_OPNAME' && qty < 0)
          ) {
            // Negative adjustment -> treat as 'barangOutSample' (General Out) or 'barangOutProduksi'
            if (type === 'PRODUCTION_USAGE') {
              stats.barangOutProduksi += Math.abs(qty);
            } else {
              stats.barangOutSample += Math.abs(qty); // Dump negative adjustments here
            }
          } else if (['REPACK_SOURCE'].includes(type)) {
            stats.barangOutRepack += Math.abs(qty);
          } else if (['SAMPLE_OUT'].includes(type)) {
            stats.barangOutSample += Math.abs(qty); // Specific sample out
          }
        }

        // 2. Fetch DailyInventory records for this day (or create if missing)
        // We iterate found transactions + existing inventory to ensure coverage
        const existingInventories = await queryRunner.manager.find(
          DailyInventory,
          {
            where: {
              businessDate: dateStr as any,
              ...(productCodeId ? { productCodeId } : {}),
            },
          },
        );

        // Merge product IDs from both sources
        const allProductIds = new Set([
          ...productStats.keys(),
          ...existingInventories.map((i) => i.productCodeId),
        ]);

        for (const pid of allProductIds) {
          const stats = productStats.get(pid) || {
            barangMasuk: 0,
            barangOutRepack: 0,
            barangOutSample: 0,
            barangOutProduksi: 0,
            adjustment: 0,
          };

          let inv = existingInventories.find((i) => i.productCodeId === pid);

          // Get Previous Day's StokAkhir (to set as today's StokAwal)
          let correctStokAwal = 0;
          if (daysCount > 1) {
            // Not the first day of sync -> Use previous day's calculated stokAkhir
            // Need to fetch previous day record from DB (since we just updated it in previous loop iteration)
            // Optimization: Cache it? For now, fetch is safer.
            const prevDate = new Date(currentDate);
            prevDate.setDate(prevDate.getDate() - 1);
            const prevDateStr = this.formatDate(prevDate);

            const prevInv = await queryRunner.manager.findOne(DailyInventory, {
              where: {
                businessDate: prevDateStr as any,
                productCodeId: pid,
              },
            });
            correctStokAwal = Number(prevInv?.stokAkhir || 0);
          } else {
            // First day of sync: Trust existing stokAwal OR fetch from D-1
            // Getting from D-1 is safer to ensure continuity from before the sync window
            const prevDate = new Date(currentDate);
            prevDate.setDate(prevDate.getDate() - 1);
            const prevDateStr = this.formatDate(prevDate);

            const prevInv = await queryRunner.manager.findOne(DailyInventory, {
              where: {
                businessDate: prevDateStr as any,
                productCodeId: pid,
              },
            });
            correctStokAwal = Number(prevInv?.stokAkhir || 0);
          }

          if (!inv) {
            // Create missing record
            inv = queryRunner.manager.create(DailyInventory, {
              productCodeId: pid,
              businessDate: dateStr,
              isActive: true,
              createdBy: 0, // System
              updatedBy: 0,
              // Initial zeroes
              dipesan: 0,
              // Will be set below
            });
          }

          // Update Values
          inv.stokAwal = correctStokAwal;
          inv.barangMasuk = stats.barangMasuk;
          inv.barangOutRepack = stats.barangOutRepack;
          inv.barangOutSample = stats.barangOutSample;
          inv.barangOutProduksi = stats.barangOutProduksi;

          // 'dipesan' (Sales) logic:
          // We need accurate SALES aggregation.
          // If transaction query above didn't explicitly separate 'SALE', we might miss it.
          // Let's perform a specific sub-query for Sales (dipesan) if needed,
          // OR trust that 'dipesan' is updated via transaction service.
          // Limitation: Transactions don't map 1:1 to 'dipesan' easily without exploring Type.
          // Optimization: We'll assume 'dipesan' in `DailyInventory` is cumulative.
          // But strict replay means we should RE-CALCULATE 'dipesan' from 'SALE' transactions.
          // Let's add 'SALE' handling in the transaction loop above. Add explicit types.
          // Added logic above: mapped SALE to nothing yet.
          // Let's bind SALE transactions to 'dipesan'.
          const saleQty = transactions
            .filter((t) => t.productCodeId === pid && t.type === 'SALE')
            .reduce((sum, t) => sum + Math.abs(Number(t.totalChange)), 0);

          inv.dipesan = saleQty; // Force overwrite 'dipesan' with actual Sales transactions

          // Save
          await queryRunner.manager.save(DailyInventory, inv);
          updatedCount++;
        }

        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
      }

      await queryRunner.commitTransaction();

      this.logger.log(
        `âœ… Stock Sync Completed. Processed ${daysCount} days, updated ${updatedCount} records.`,
      );

      return {
        processedDays: daysCount,
        updatedRecords: updatedCount,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('âŒ Stock Sync Failed', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get Product Codes registered in Daily Inventory
   *
   * Used by: Production Complete Batch Dialog
   * Purpose: Only show product sizes/variants that actually exist in inventory system.
   */
  async getRegisteredProductCodes(productId: number) {
    return this.productCodesRepo
      .createQueryBuilder('pc')
      .innerJoin('daily_inventory', 'di', 'di.productCodeId = pc.id')
      .where('pc.productId = :productId', { productId })
      .andWhere('pc.isDeleted = :isDeleted', { isDeleted: false })
      .select(['pc.id', 'pc.productCode', 'pc.sizeId'])
      .distinct(true)
      .leftJoinAndSelect('pc.size', 'size')
      .leftJoinAndSelect('pc.product', 'product')
      .leftJoinAndSelect('product.category', 'category')
      .getMany();
  }
}
