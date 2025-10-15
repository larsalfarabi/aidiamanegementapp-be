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
import {
  ResponsePagination,
  ResponseSuccess,
} from '../../../common/interface/response.interface';

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
   * GET /inventory/daily - Get daily inventory dengan filter
   *
   * Query params:
   * - businessDate: YYYY-MM-DD (default: today)
   * - productCodeId: Filter by product
   * - stockStatus: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'AVAILABLE' | 'OVERSTOCK'
   * - isActive: boolean
   * - page, pageSize: pagination
   */
  async findAll(query: any): Promise<ResponsePagination> {
    const {
      businessDate,
      productCodeId,
      stockStatus,
      isActive,
      page = 1,
      pageSize = 10,
    } = query;

    // Default to today if no date specified
    const targetDate = businessDate || this.formatDate(new Date());

    const queryBuilder = this.dailyInventoryRepo
      .createQueryBuilder('di')
      .leftJoinAndSelect('di.productCode', 'pc')
      .leftJoinAndSelect('pc.productId', 'product')
      .leftJoinAndSelect('pc.sizeId', 'size')
      .leftJoinAndSelect('pc.categoryId', 'category')
      .where('di.businessDate = :businessDate', { businessDate: targetDate })
      .andWhere('di.deletedAt IS NULL');

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

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply pagination
    const skip = (page - 1) * pageSize;
    queryBuilder.skip(skip).take(pageSize);

    // Order by product name
    queryBuilder.orderBy('product.productName', 'ASC');

    const items = await queryBuilder.getMany();

    // Filter by stock status (client-side filter since it's a virtual property)
    let filteredItems = items;
    if (stockStatus) {
      filteredItems = items.filter((item) => item.stockStatus === stockStatus);
    }

    return this._pagination(
      'Daily inventory retrieved successfully',
      filteredItems,
      total,
      page,
      pageSize,
    );
  }

  /**
   * GET /inventory/daily/:id - Get daily inventory by ID
   */
  async findById(id: number): Promise<ResponseSuccess> {
    const inventory = await this.dailyInventoryRepo.findOne({
      where: { id, deletedAt: IsNull() },
      relations: [
        'productCode',
        'productCode.productId',
        'productCode.sizeId',
        'productCode.categoryId',
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
    const today = new Date(this.formatDate(new Date()));

    const inventory = await this.dailyInventoryRepo.findOne({
      where: {
        productCodeId,
        businessDate: today,
        deletedAt: IsNull(),
      },
      relations: [
        'productCode',
        'productCode.productId',
        'productCode.sizeId',
        'productCode.categoryId',
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
        'productCode.productId',
        'productCode.sizeId',
        'productCode.categoryId',
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

    // Check if record already exists
    const existing = await this.dailyInventoryRepo.findOne({
      where: {
        productCodeId,
        businessDate,
        deletedAt: IsNull(),
      },
    });

    if (existing) {
      throw new ConflictException(
        `Daily inventory for product ${productCodeId} on ${businessDate} already exists`,
      );
    }

    // Create new record
    const inventory = this.dailyInventoryRepo.create({
      productCodeId,
      businessDate,
      stokAwal: stokAwal || 0,
      barangMasuk: 0,
      dipesan: 0,
      barangOutRepack: 0,
      barangOutSample: 0,
      // stokAkhir is GENERATED COLUMN (auto-calculated)
      minimumStock,
      maximumStock,
      isActive: true,
      notes,
      createdBy: userId,
      updatedBy: userId,
    });

    const saved = await this.dailyInventoryRepo.save(inventory);

    // Reload to get the generated stokAkhir value
    const result = await this.dailyInventoryRepo.findOne({
      where: { id: saved.id },
      relations: ['productCode'],
    });

    return this._success('Daily inventory created successfully', result);
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
      where: { id, deletedAt: IsNull() },
    });

    if (!inventory) {
      throw new NotFoundException(`Daily inventory with ID ${id} not found`);
    }

    await this.dailyInventoryRepo.softDelete(id);

    return this._success('Daily inventory deleted successfully', null);
  }

  /**
   * GET /inventory/daily/low-stock - Get products with low stock
   * Returns products where stokAkhir <= minimumStock
   */
  async getLowStockProducts(businessDate?: string): Promise<ResponseSuccess> {
    const targetDate = businessDate || this.formatDate(new Date());

    const items = await this.dailyInventoryRepo
      .createQueryBuilder('di')
      .leftJoinAndSelect('di.productCode', 'pc')
      .leftJoinAndSelect('pc.productId', 'product')
      .leftJoinAndSelect('pc.sizeId', 'size')
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
    const targetDate = businessDate || this.formatDate(new Date());

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
      .leftJoinAndSelect('pc.productId', 'product');

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
    return date.toISOString().split('T')[0];
  }

  /**
   * Utility: Get or create today's inventory record
   * Digunakan oleh transaction operations untuk memastikan record hari ini ada
   */
  async getOrCreateTodayInventory(
    productCodeId: number,
    userId: number,
  ): Promise<DailyInventory> {
    const today = new Date(this.formatDate(new Date()));

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
}
