import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, Between } from 'typeorm';
import { Inventory } from './entity/inventory.entity';
import {
  InventoryTransactions,
  TransactionType,
} from './entity/inventory_transactions.entity';
import { ProductCodes } from '../products/entity/product_codes.entity';
import { Orders } from '../orders/entity/orders.entity';
import { OrderItems } from '../orders/entity/order_items.entity';
import BaseResponse from '../../common/response/base.response';
import {
  ResponsePagination,
  ResponseSuccess,
} from '../../common/interface/response.interface';
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  CreateInventoryDto,
  UpdateInventoryDto,
  FilterInventoryDto,
  FilterTransactionsDto,
  RecordProductionDto,
  RecordWasteDto,
  AdjustStockDto,
  FilterDailyInventoryDto,
} from './dto';

@Injectable()
export class InventoryService extends BaseResponse {
  constructor(
    @InjectRepository(Inventory)
    private readonly inventoryRepo: Repository<Inventory>,
    @InjectRepository(InventoryTransactions)
    private readonly transactionRepo: Repository<InventoryTransactions>,
    @InjectRepository(ProductCodes)
    private readonly productCodesRepo: Repository<ProductCodes>,
    @InjectRepository(Orders)
    private readonly ordersRepo: Repository<Orders>,
    @InjectRepository(OrderItems)
    private readonly orderItemsRepo: Repository<OrderItems>,
  ) {
    super();
  }

  /**
   * Generate unique transaction number in format: TRX-YYYYMMDD-XXX
   */
  private async generateTransactionNumber(): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');

    const lastTransaction = await this.transactionRepo
      .createQueryBuilder('trx')
      .where('trx.transactionNumber LIKE :pattern', {
        pattern: `TRX-${dateStr}-%`,
      })
      .orderBy('trx.transactionNumber', 'DESC')
      .getOne();

    let sequence = 1;
    if (lastTransaction) {
      const lastSequence = parseInt(
        lastTransaction.transactionNumber.split('-')[2],
      );
      sequence = lastSequence + 1;
    }

    return `TRX-${dateStr}-${sequence.toString().padStart(3, '0')}`;
  }

  // ==================== INVENTORY CRUD ====================

  /**
   * Get all inventory with filters and pagination
   */
  async findAll(query: FilterInventoryDto): Promise<ResponsePagination> {
    const {
      productCodeId,
      lowStock,
      isActive,
      page,
      pageSize,
      limit,
      stockStatus,
    } = query;

    const queryBuilder = this.inventoryRepo
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.productCode', 'pc')
      .leftJoinAndSelect('pc.product', 'product')
      .leftJoinAndSelect('pc.sizeId', 'size')
      .leftJoinAndSelect('pc.categoryId', 'category')
      .select([
        'inv.id',
        'inv.productCodeId',
        'inv.quantityOnHand',
        'inv.quantityReserved',
        'inv.quantityAvailable',
        'inv.minimumStock',
        'inv.maximumStock',
        'inv.lastTransactionDate',
        'inv.lastTransactionType',
        'pc.id',
        'pc.productCode',
        'product.id',
        'product.name',
        'product.productType',
        'size.id',
        'size.sizeValue',
        'category.id',
        'category.name',
      ]);

    if (productCodeId) {
      queryBuilder.andWhere('inv.productCodeId = :productCodeId', {
        productCodeId,
      });
    }

    if (isActive !== undefined) {
      queryBuilder.andWhere('inv.isActive = :isActive', { isActive });
    }

    if (stockStatus) {
      switch (stockStatus) {
        case 'OUT_OF_STOCK':
          queryBuilder.andWhere('inv.quantityAvailable <= 0');
          break;
        case 'LOW_STOCK':
          queryBuilder
            .andWhere('inv.quantityAvailable > 0')
            .andWhere('inv.quantityAvailable <= inv.minimumStock')
            .andWhere('inv.minimumStock IS NOT NULL');
          break;
        case 'OVERSTOCK':
          queryBuilder
            .andWhere('inv.quantityAvailable >= inv.maximumStock')
            .andWhere('inv.maximumStock IS NOT NULL');
          break;
        case 'AVAILABLE':
          queryBuilder
            .andWhere('inv.quantityAvailable > 0')
            .andWhere(
              '(inv.minimumStock IS NULL OR inv.quantityAvailable > inv.minimumStock)',
            )
            .andWhere(
              '(inv.maximumStock IS NULL OR inv.quantityAvailable < inv.maximumStock)',
            );
          break;
      }
    }

    const [result, count] = await queryBuilder
      .skip(limit)
      .take(pageSize)
      .orderBy('inv.lastTransactionDate', 'DESC')
      .getManyAndCount();
    // ✅ Manual mapping untuk include virtual properties
    const enrichedResult = result.map((item) => {
      // Create instance untuk akses getter
      const inventory = Object.assign(new Inventory(), item);

      return {
        ...item,
        stockStatus: inventory.stockStatus, // Virtual property
      };
    });

    return this._pagination(
      'Berhasil mengambil data inventory',
      enrichedResult,
      count,
      page!,
      pageSize!,
    );
  }

  /**
   * Get inventory by ID
   */
  async findById(id: number): Promise<ResponseSuccess> {
    const inventory = await this.inventoryRepo.findOne({
      where: { id },
      relations: ['productCode', 'productCode.product', 'productCode.sizeId'],
    });

    if (!inventory) {
      throw new NotFoundException(`Inventory dengan ID ${id} tidak ditemukan`);
    }

    return this._success('Berhasil mengambil data inventory', inventory);
  }

  /**
   * Get inventory by product code ID
   */
  async findByProductCode(productCodeId: number): Promise<Inventory | null> {
    return await this.inventoryRepo.findOne({
      where: { productCodeId },
      relations: ['productCode'],
    });
  }

  /**
   * Create new inventory record
   */
  async create(
    dto: CreateInventoryDto,
    userId: number,
  ): Promise<ResponseSuccess> {
    // Check if product code exists
    const productCode = await this.productCodesRepo.findOne({
      where: { id: dto.productCodeId },
    });

    if (!productCode) {
      throw new NotFoundException(
        `Product code dengan ID ${dto.productCodeId} tidak ditemukan`,
      );
    }

    // Check if inventory already exists for this product
    const existingInventory = await this.findByProductCode(dto.productCodeId);
    if (existingInventory) {
      throw new ConflictException(
        `Inventory untuk product code ${productCode.productCode} sudah ada`,
      );
    }

    const inventory = this.inventoryRepo.create({
      ...dto,
      quantityOnHand: dto.quantityOnHand || 0,
      quantityReserved: 0,
      quantityAvailable: dto.quantityOnHand || 0,
      createdBy: { id: userId } as any,
    });

    const saved = await this.inventoryRepo.save(inventory);

    return this._success('Inventory berhasil dibuat', saved);
  }

  /**
   * Update inventory settings (minimumStock, productionCost, etc.)
   */
  async update(
    id: number,
    dto: UpdateInventoryDto,
    userId: number,
  ): Promise<ResponseSuccess> {
    const inventory = await this.inventoryRepo.findOne({ where: { id } });

    if (!inventory) {
      throw new NotFoundException(`Inventory dengan ID ${id} tidak ditemukan`);
    }

    // Update fields
    if (dto.minimumStock !== undefined)
      inventory.minimumStock = dto.minimumStock;
    if (dto.maximumStock !== undefined)
      inventory.maximumStock = dto.maximumStock;
    if (dto.notes !== undefined) inventory.notes = dto.notes;

    inventory.updatedBy = { id: userId } as any;

    const updated = await this.inventoryRepo.save(inventory);

    return this._success('Inventory berhasil diupdate', updated);
  }

  /**
   * Get low stock products (quantityAvailable <= minimumStock)
   */
  async getLowStockProducts(): Promise<ResponseSuccess> {
    const lowStockItems = await this.inventoryRepo
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.productCode', 'pc')
      .leftJoinAndSelect('pc.product', 'product')
      .leftJoinAndSelect('pc.sizeId', 'size')
      .where('inv.quantityAvailable <= inv.minimumStock')
      .andWhere('inv.minimumStock IS NOT NULL')
      .andWhere('inv.isActive = :isActive', { isActive: true })
      .orderBy('(inv.minimumStock - inv.quantityAvailable)', 'DESC')
      .getMany();

    return this._success(
      `Ditemukan ${lowStockItems.length} produk dengan stock rendah`,
      lowStockItems,
    );
  }

  /**
   * Get stock balance summary
   */
  async getStockBalance(): Promise<ResponseSuccess> {
    const balance = await this.inventoryRepo
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.productCode', 'pc')
      .leftJoinAndSelect('pc.product', 'product')
      .select([
        'SUM(inv.quantityOnHand) as totalOnHand',
        'SUM(inv.quantityReserved) as totalReserved',
        'SUM(inv.quantityAvailable) as totalAvailable',
        'COUNT(inv.id) as totalProducts',
      ])
      .where('inv.isActive = :isActive', { isActive: true })
      .getRawOne();

    return this._success('Berhasil mengambil stock balance summary', balance);
  }

  // ==================== TRANSACTION OPERATIONS ====================

  /**
   * Record production receipt (PRODUCTION_IN)
   */
  async recordProduction(
    dto: RecordProductionDto,
    userId: number,
  ): Promise<ResponseSuccess> {
    // Validate product code
    const productCode = await this.productCodesRepo.findOne({
      where: { id: dto.productCodeId },
    });

    if (!productCode) {
      throw new NotFoundException(
        `Product code dengan ID ${dto.productCodeId} tidak ditemukan`,
      );
    }

    // Find or create inventory record
    let inventory = await this.findByProductCode(dto.productCodeId);

    if (!inventory) {
      // Create new inventory if not exists
      const createDto: CreateInventoryDto = {
        productCodeId: dto.productCodeId,
        quantityOnHand: 0,
      };
      const created = await this.create(createDto, userId);
      inventory = await this.findByProductCode(dto.productCodeId);
    }

    // Create PRODUCTION_IN transaction
    const transaction = this.transactionRepo.create({
      transactionNumber: await this.generateTransactionNumber(),
      transactionDate: new Date(),
      transactionType: TransactionType.PRODUCTION_IN,
      productCodeId: dto.productCodeId,
      inventoryId: inventory!.id,
      quantity: dto.quantity,
      productionBatchNumber: dto.productionBatchNumber,
      notes: dto.notes,
      performedBy: dto.performedBy,
      balanceAfter: inventory!.quantityOnHand + dto.quantity,
      createdBy: { id: userId } as any,
    });

    await this.transactionRepo.save(transaction);

    const newQuantity = inventory!.quantityOnHand + dto.quantity;

    inventory!.quantityOnHand = newQuantity;
    inventory!.quantityAvailable = newQuantity - inventory!.quantityReserved;
    inventory!.lastTransactionDate = new Date();
    inventory!.lastTransactionType = TransactionType.PRODUCTION_IN;
    inventory!.updatedBy = { id: userId } as any;

    await this.inventoryRepo.save(inventory!);

    return this._success('Produksi berhasil dicatat', {
      transaction,
      inventory,
    });
  }

  /**
   * Record waste/damaged products (WASTE)
   */
  async recordWaste(
    dto: RecordWasteDto,
    userId: number,
  ): Promise<ResponseSuccess> {
    const inventory = await this.findByProductCode(dto.productCodeId);

    if (!inventory) {
      throw new NotFoundException(
        `Inventory untuk product code ${dto.productCodeId} tidak ditemukan`,
      );
    }

    // Validate stock availability
    if (inventory.quantityOnHand < dto.quantity) {
      throw new BadRequestException(
        `Stock tidak cukup. Tersedia: ${inventory.quantityOnHand}, Diminta: ${dto.quantity}`,
      );
    }

    // Create WASTE transaction
    const transaction = this.transactionRepo.create({
      transactionNumber: await this.generateTransactionNumber(),
      transactionDate: new Date(),
      transactionType: TransactionType.WASTE,
      productCodeId: dto.productCodeId,
      inventoryId: inventory.id,
      quantity: -dto.quantity, // Negative for OUT
      reason: dto.reason,
      notes: dto.notes,
      performedBy: dto.performedBy,
      balanceAfter: inventory.quantityOnHand - dto.quantity,
      status: 'COMPLETED',
      createdBy: { id: userId } as any,
    });

    await this.transactionRepo.save(transaction);

    // Update inventory
    inventory.quantityOnHand -= dto.quantity;
    inventory.quantityAvailable -= dto.quantity;
    inventory.lastTransactionDate = new Date();
    inventory.lastTransactionType = TransactionType.WASTE;
    inventory.updatedBy = { id: userId } as any;

    await this.inventoryRepo.save(inventory);

    return this._success('Waste berhasil dicatat', {
      transaction,
      inventory,
    });
  }

  /**
   * Stock adjustment (stock opname)
   */
  async adjustStock(
    dto: AdjustStockDto,
    userId: number,
  ): Promise<ResponseSuccess> {
    const inventory = await this.findByProductCode(dto.productCodeId);

    if (!inventory) {
      throw new NotFoundException(
        `Inventory untuk product code ${dto.productCodeId} tidak ditemukan`,
      );
    }

    const systemStock = inventory.quantityOnHand;
    const physicalStock = dto.physicalCount;
    const difference = physicalStock - systemStock;

    if (difference === 0) {
      return this._success('Stock sudah sesuai, tidak perlu adjustment', {
        systemStock,
        physicalStock,
        difference: 0,
      });
    }

    // Determine transaction type
    const transactionType =
      difference > 0
        ? TransactionType.ADJUSTMENT_IN
        : TransactionType.ADJUSTMENT_OUT;

    // Create adjustment transaction
    const transaction = this.transactionRepo.create({
      transactionNumber: await this.generateTransactionNumber(),
      transactionDate: new Date(),
      transactionType,
      productCodeId: dto.productCodeId,
      inventoryId: inventory.id,
      quantity: difference, // Can be positive or negative
      reason: dto.reason,
      notes: `${dto.notes || ''} | System: ${systemStock}, Physical: ${physicalStock}, Diff: ${difference}`,
      performedBy: dto.performedBy,
      balanceAfter: physicalStock,
      status: 'COMPLETED',
      createdBy: { id: userId } as any,
    });

    await this.transactionRepo.save(transaction);

    // Update inventory to match physical count
    inventory.quantityOnHand = physicalStock;
    inventory.quantityAvailable = physicalStock - inventory.quantityReserved;
    inventory.lastTransactionDate = new Date();
    inventory.lastTransactionType = transactionType;
    inventory.updatedBy = { id: userId } as any;

    await this.inventoryRepo.save(inventory);

    return this._success('Stock adjustment berhasil', {
      transaction,
      inventory,
      difference,
      transactionType,
    });
  }

  /**
   * Get transaction history with filters
   */
  async getTransactionHistory(
    query: FilterTransactionsDto,
  ): Promise<ResponsePagination> {
    const {
      productCodeId,
      transactionType,
      startDate,
      endDate,
      orderId,
      productionBatchNumber,
      page = 1,
      limit = 10,
    } = query;

    const queryBuilder = this.transactionRepo
      .createQueryBuilder('trx')
      .leftJoinAndSelect('trx.productCode', 'pc')
      .leftJoinAndSelect('pc.product', 'product')
      .leftJoinAndSelect('trx.order', 'order')
      .orderBy('trx.transactionDate', 'DESC');

    if (productCodeId) {
      queryBuilder.andWhere('trx.productCodeId = :productCodeId', {
        productCodeId,
      });
    }

    if (transactionType) {
      queryBuilder.andWhere('trx.transactionType = :transactionType', {
        transactionType,
      });
    }

    if (startDate && endDate) {
      queryBuilder.andWhere(
        'trx.transactionDate BETWEEN :startDate AND :endDate',
        {
          startDate: new Date(startDate),
          endDate: new Date(endDate),
        },
      );
    }

    if (orderId) {
      queryBuilder.andWhere('trx.orderId = :orderId', { orderId });
    }

    if (productionBatchNumber) {
      queryBuilder.andWhere('trx.productionBatchNumber = :batchNumber', {
        batchNumber: productionBatchNumber,
      });
    }

    queryBuilder.skip((page - 1) * limit).take(limit);

    const [result, count] = await queryBuilder.getManyAndCount();

    return this._pagination(
      'Berhasil mengambil transaction history',
      result,
      count,
      page,
      limit,
    );
  }

  // ==================== ORDER INTEGRATION ====================

  /**
   * Reserve stock for order (when order is confirmed)
   */
  async reserveStockForOrder(orderId: number, userId: number): Promise<void> {
    const order = await this.ordersRepo.findOne({
      where: { id: orderId },
      relations: ['orderItems', 'orderItems.productCode'],
    });

    if (!order) {
      throw new NotFoundException(`Order dengan ID ${orderId} tidak ditemukan`);
    }

    for (const item of order.orderItems) {
      const inventory = await this.findByProductCode(item.productCodeId);

      if (!inventory) {
        throw new NotFoundException(
          `Inventory untuk product ${item.productCode.productCode} tidak ditemukan`,
        );
      }

      // Validate stock availability
      if (inventory.quantityAvailable < item.quantity) {
        throw new BadRequestException(
          `Stock tidak cukup untuk ${item.productCode.productCode}. Tersedia: ${inventory.quantityAvailable}, Diminta: ${item.quantity}`,
        );
      }

      // Reserve stock
      inventory.quantityReserved += item.quantity;
      inventory.quantityAvailable -= item.quantity;
      inventory.updatedBy = { id: userId } as any;

      await this.inventoryRepo.save(inventory);
    }
  }

  /**
   * Process order shipment (create SALE transactions and deduct stock)
   */
  async processOrderShipment(
    orderId: number,
    userId: number,
  ): Promise<ResponseSuccess> {
    const order = await this.ordersRepo.findOne({
      where: { id: orderId },
      relations: ['orderItems', 'orderItems.productCode'],
    });

    if (!order) {
      throw new NotFoundException(`Order dengan ID ${orderId} tidak ditemukan`);
    }

    const transactions = [];

    for (const item of order.orderItems) {
      const inventory = await this.findByProductCode(item.productCodeId);

      if (!inventory) {
        throw new NotFoundException(
          `Inventory untuk product ${item.productCode.productCode} tidak ditemukan`,
        );
      }

      // Create SALE transaction
      const transaction = this.transactionRepo.create({
        transactionNumber: await this.generateTransactionNumber(),
        transactionDate: new Date(),
        transactionType: TransactionType.SALE,
        productCodeId: item.productCodeId,
        inventoryId: inventory.id,
        quantity: -item.quantity, // Negative for OUT
        orderId: orderId,
        orderItemId: item.id,
        referenceNumber: order.orderNumber,
        balanceAfter: inventory.quantityOnHand - item.quantity,
        status: 'COMPLETED',
        createdBy: { id: userId } as any,
      });

      await this.transactionRepo.save(transaction);
      transactions.push(transaction);

      // Update inventory
      inventory.quantityOnHand -= item.quantity;
      inventory.quantityReserved -= item.quantity; // Release reservation
      inventory.quantityAvailable =
        inventory.quantityOnHand - inventory.quantityReserved;
      inventory.lastTransactionDate = new Date();
      inventory.lastTransactionType = TransactionType.SALE;
      inventory.updatedBy = { id: userId } as any;

      await this.inventoryRepo.save(inventory);
    }

    return this._success('Order shipment berhasil diproses', {
      orderId,
      orderNumber: order.orderNumber,
      transactions,
    });
  }

  /**
   * Release reserved stock (when order is cancelled)
   */
  async releaseReservedStock(orderId: number, userId: number): Promise<void> {
    const order = await this.ordersRepo.findOne({
      where: { id: orderId },
      relations: ['orderItems'],
    });

    if (!order) {
      throw new NotFoundException(`Order dengan ID ${orderId} tidak ditemukan`);
    }

    for (const item of order.orderItems) {
      const inventory = await this.findByProductCode(item.productCodeId);

      if (!inventory) {
        continue; // Skip if inventory not found
      }

      // Release reservation
      inventory.quantityReserved -= item.quantity;
      inventory.quantityAvailable += item.quantity;
      inventory.updatedBy = { id: userId } as any;

      await this.inventoryRepo.save(inventory);
    }
  }

  // ==================== DAILY INVENTORY VIEW ====================

  /**
   * Get daily inventory with real-time calculation
   *
   * Formula:
   * - Stok Awal (Opening Stock) = Current quantityOnHand at midnight (from Inventory table)
   * - Barang Masuk (Incoming) = SUM(PRODUCTION_IN + SALE_RETURN + ADJUSTMENT_IN) for specified date
   * - Dipesan (Ordered) = SUM(order items) WHERE order status IN (CONFIRMED, SHIPPED) AND created on specified date
   * - Tersedia (Available) = Stok Awal + Barang Masuk - Dipesan
   *
   * @param query FilterDailyInventoryDto with optional date (default: today WIB)
   * @returns Paginated daily inventory data with calculated fields
   */
  async getDailyInventory(
    query: FilterDailyInventoryDto,
  ): Promise<ResponsePagination> {
    const {
      businessDate,
      productCodeId,
      stockStatus,
      isActive = true,
      page,
      pageSize,
      limit,
    } = query;

    // Set target date (default: today in WIB timezone)
    const targetDate = businessDate ? new Date(businessDate) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Get all active inventory records
    const inventoryQuery = this.inventoryRepo
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.productCode', 'pc')
      .leftJoinAndSelect('pc.product', 'product')
      .leftJoinAndSelect('pc.sizeId', 'size')
      .leftJoinAndSelect('pc.categoryId', 'category')
      .select([
        'inv.id',
        'inv.productCodeId',
        'inv.quantityOnHand',
        'inv.quantityReserved',
        'inv.quantityAvailable',
        'inv.minimumStock',
        'inv.maximumStock',
        'inv.lastTransactionDate',
        'inv.lastTransactionType',
        'inv.isActive',
        'pc.id',
        'pc.productCode',
        'product.id',
        'product.name',
        'product.productType',
        'size.id',
        'size.sizeValue',
        'category.id',
        'category.name',
      ])
      .where('inv.isActive = :isActive', { isActive });

    if (productCodeId) {
      inventoryQuery.andWhere('inv.productCodeId = :productCodeId', {
        productCodeId,
      });
    }

    const inventories = await inventoryQuery.getMany();

    // Calculate daily metrics for each product
    const dailyData = await Promise.all(
      inventories.map(async (inv) => {
        // 1. Stok Awal = Current quantityOnHand (represents stock at start of day)
        const openingStock = Number(inv.quantityOnHand) || 0;

        // 2. Barang Masuk = SUM of IN transactions for the day
        const incomingTransactions = await this.transactionRepo
          .createQueryBuilder('trx')
          .select('SUM(trx.quantity)', 'total')
          .where('trx.productCodeId = :productCodeId', {
            productCodeId: inv.productCodeId,
          })
          .andWhere('trx.transactionDate BETWEEN :start AND :end', {
            start: startOfDay,
            end: endOfDay,
          })
          .andWhere('trx.transactionType IN (:...types)', {
            types: [
              TransactionType.PRODUCTION_IN,
              TransactionType.SALE_RETURN,
              TransactionType.ADJUSTMENT_IN,
            ],
          })
          .andWhere('trx.status = :status', { status: 'COMPLETED' })
          .getRawOne();

        const incomingStock = Number(incomingTransactions?.total) || 0;

        // 3. Dipesan = SUM of order items with CONFIRMED/SHIPPED status created today
        const orderedItems = await this.orderItemsRepo
          .createQueryBuilder('oi')
          .innerJoin('oi.order', 'order')
          .select('SUM(oi.quantity)', 'total')
          .where('oi.productCodeId = :productCodeId', {
            productCodeId: inv.productCodeId,
          })
          .andWhere('order.createdAt BETWEEN :start AND :end', {
            start: startOfDay,
            end: endOfDay,
          })
          // .andWhere('order.status IN (:...statuses)', {
          //   statuses: ['CONFIRMED', 'SHIPPED'],
          // })
          .getRawOne();

        const orderedStock = Number(orderedItems?.total) || 0;

        // 4. Tersedia = Stok Awal + Barang Masuk - Dipesan
        const availableStock = openingStock + incomingStock - orderedStock;

        // Determine stock status
        const minimumStock = Number(inv.minimumStock) || 0;
        const maximumStock = Number(inv.maximumStock) || 0;
        let calculatedStatus: string = 'AVAILABLE';

        if (availableStock <= 0) {
          calculatedStatus = 'OUT_OF_STOCK';
        } else if (minimumStock > 0 && availableStock <= minimumStock) {
          calculatedStatus = 'LOW_STOCK';
        } else if (maximumStock > 0 && availableStock >= maximumStock) {
          calculatedStatus = 'OVERSTOCK';
        }

        return {
          id: inv.id,
          productCodeId: inv.productCodeId,
          productCode: inv.productCode?.productCode || '',
          productName: inv.productCode?.product?.name || '',
          productType: inv.productCode?.product?.productType || '',
          categoryName: inv.productCode?.category?.name || '',
          sizeValue: inv.productCode?.size?.sizeValue || '',

          // Daily metrics
          openingStock, // Stok Awal
          incomingStock, // Barang Masuk
          orderedStock, // Dipesan
          availableStock, // Tersedia

          // Additional info
          minimumStock,
          maximumStock,
          stockStatus: calculatedStatus,
          lastTransactionDate: inv.lastTransactionDate,
          lastTransactionType: inv.lastTransactionType,
        };
      }),
    );

    // Filter by stock status if provided
    let filteredData = dailyData;
    if (stockStatus) {
      filteredData = dailyData.filter(
        (item) => item.stockStatus === stockStatus,
      );
    }

    // Sort by product code
    filteredData.sort((a, b) => a.productCode.localeCompare(b.productCode));

    // Apply pagination
    const total = filteredData.length;
    const paginatedData = filteredData.slice(limit, limit + (pageSize || 10));

    return this._pagination(
      'Berhasil mengambil data inventory harian',
      paginatedData,
      total,
      page!,
      pageSize!,
    );
  }
}
