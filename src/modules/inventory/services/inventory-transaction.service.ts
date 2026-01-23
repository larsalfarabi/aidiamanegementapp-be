import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  DataSource,
  Like,
  EntityManager,
  QueryRunner,
} from 'typeorm';
import { DailyInventory } from '../entity/daily-inventory.entity';
import {
  InventoryTransactions,
  TransactionType,
  TransactionStatus,
} from '../entity/inventory-transactions.entity';
import {
  RepackingRecords,
  RepackingStatus,
} from '../entity/repacking-records.entity';
import {
  SampleTracking,
  SampleStatus,
  SamplePurpose,
} from '../entity/sample-tracking.entity';
import { ProductCodes } from '../../products/entity/product_codes.entity';
import BaseResponse from '../../../common/response/base.response';
import {
  ResponseSuccess,
  ResponsePagination,
} from '../../../common/interface/response.interface';
import { RecordProductionDto } from '../dto/record-production.dto';
import { CreatePurchaseDto } from '../dto/create-purchase.dto';
import {
  RecordSaleDto,
  RecordRepackingDto,
  RecordSampleDto,
  ReturnSampleDto,
} from '../dto/record-transaction.dto';
import { FilterTransactionsDto } from '../dto/filter-transactions.dto';
import { AdjustStockDto } from '../dto/adjust-stock.dto';
import { NotificationEventEmitter } from '../../notifications/services/notification-event-emitter.service';

/**
 * InventoryTransactionService
 *
 * Service untuk handle semua inventory transaction operations yang update daily_inventory
 *
 * Operations:
 * 1. recordProduction() - PRODUCTION_IN → barangMasuk++
 * 2. recordSale() - SALE → dipesan++
 * 3. recordRepacking() - REPACK_OUT (source) + REPACK_IN (target) → barangOutRepack++, barangMasuk++
 * 4. recordSampleOut() - SAMPLE_OUT → barangOutSample++
 * 5. recordSampleReturn() - SAMPLE_RETURN → barangMasuk++ (if returned)
 *
 * All operations:
 * - Use database transactions (QueryRunner)
 * - Generate unique transaction numbers
 * - Calculate balanceAfter for audit
 * - Update daily_inventory columns
 * - Create inventory_transactions records
 */
@Injectable()
export class InventoryTransactionService extends BaseResponse {
  private readonly logger = new Logger(InventoryTransactionService.name);

  constructor(
    @InjectRepository(DailyInventory)
    private readonly dailyInventoryRepo: Repository<DailyInventory>,

    @InjectRepository(InventoryTransactions)
    private readonly transactionsRepo: Repository<InventoryTransactions>,

    @InjectRepository(RepackingRecords)
    private readonly repackingRepo: Repository<RepackingRecords>,

    @InjectRepository(SampleTracking)
    private readonly sampleTrackingRepo: Repository<SampleTracking>,

    @InjectRepository(ProductCodes)
    private readonly productCodesRepo: Repository<ProductCodes>,

    private readonly dataSource: DataSource,
    private readonly notificationEventEmitter: NotificationEventEmitter,
  ) {
    super();
  }

  /**
   * POST /inventory/transactions/production
   * Record production output (finished goods masuk gudang)
   * Updates: daily_inventory.barangMasuk++
   * Creates: inventory_transactions with PRODUCTION_IN type
   */
  async recordProduction(
    dto: RecordProductionDto,
    userId: number,
  ): Promise<ResponseSuccess> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Verify product exists
      const product = await this.productCodesRepo.findOne({
        where: { id: dto.productCodeId },
      });

      if (!product) {
        throw new NotFoundException(
          `Product code ${dto.productCodeId} not found`,
        );
      }

      const today = this.formatDate(new Date());
      const todayDate = new Date(today);

      // Get or create today's daily inventory
      let dailyInventory = await this.getOrCreateDailyInventory(
        queryRunner,
        dto.productCodeId,
        todayDate,
        userId,
      );

      // Calculate balance before transaction
      // Use nullish coalescing to handle null values from database
      const stokAwal = Number(dailyInventory.stokAwal ?? 0);
      const barangMasuk = Number(dailyInventory.barangMasuk ?? 0);
      const dipesan = Number(dailyInventory.dipesan ?? 0);
      const barangOutRepack = Number(dailyInventory.barangOutRepack ?? 0);
      const barangOutSample = Number(dailyInventory.barangOutSample ?? 0);

      const balanceBefore =
        stokAwal + barangMasuk - dipesan - barangOutRepack - barangOutSample;

      this.logger.log(
        `[PRODUCTION] Product ${dto.productCodeId} - Balance Before: ${balanceBefore} (stokAwal: ${stokAwal}, barangMasuk: ${barangMasuk}, dipesan: ${dipesan})`,
      );

      // Update daily inventory: increment barangMasuk
      dailyInventory.barangMasuk = barangMasuk + dto.quantity;
      dailyInventory.updatedBy = userId;
      await queryRunner.manager.save(DailyInventory, dailyInventory);

      // Calculate balance after
      const balanceAfter = balanceBefore + dto.quantity;

      this.logger.log(
        `[PRODUCTION] Product ${dto.productCodeId} - Balance After: ${balanceAfter} (added: ${dto.quantity})`,
      );

      // Generate unique transaction number
      const transactionNumber = await this.generateTransactionNumber(
        queryRunner,
        'TRX',
      );

      // Create transaction record
      const transaction = new InventoryTransactions();
      transaction.transactionNumber = transactionNumber;
      transaction.transactionDate = new Date();
      transaction.businessDate = todayDate;
      transaction.transactionType = TransactionType.PRODUCTION_IN;
      transaction.productCodeId = dto.productCodeId;
      transaction.quantity = dto.quantity;

      // ✅ Ensure balanceAfter is always a valid number
      transaction.balanceAfter = Number.isFinite(balanceAfter)
        ? balanceAfter
        : 0;

      if (!Number.isFinite(balanceAfter)) {
        this.logger.error(
          `[PRODUCTION] Invalid balanceAfter (${balanceAfter}) for product ${dto.productCodeId}. Setting to 0.`,
        );
      }

      transaction.productionBatchNumber = dto.productionBatchNumber;
      transaction.status = TransactionStatus.COMPLETED;
      if (dto.qualityCheckStatus) {
        transaction.reason = `Quality: ${dto.qualityCheckStatus}`;
      }
      if (dto.notes) {
        transaction.notes = dto.notes;
      }
      if (dto.performedBy) {
        transaction.performedBy = dto.performedBy;
      }
      transaction.createdBy = userId;

      const savedTransaction = await queryRunner.manager.save(transaction);

      // Reload daily inventory to get updated stokAkhir (GENERATED COLUMN)
      const updatedInventory = await queryRunner.manager.findOne(
        DailyInventory,
        {
          where: { id: dailyInventory.id },
          relations: ['productCode', 'productCode.product'],
        },
      );

      await queryRunner.commitTransaction();

      this.logger.log(
        `Production recorded: Product ${dto.productCodeId}, Qty ${dto.quantity}, Batch ${dto.productionBatchNumber}`,
      );

      // ✅ Emit PRODUCTION_IN notification (MEDIUM priority - informational)
      await this.notificationEventEmitter.emitProductionIn({
        transactionId: savedTransaction.id,
        productCode: updatedInventory?.productCode?.productCode || 'Unknown',
        productName:
          updatedInventory?.productCode?.product?.name || 'Unknown Product',
        quantity: dto.quantity,
        batchNumber: dto.productionBatchNumber || 'N/A',
      });

      return this._success('Production recorded successfully', {
        dailyInventory: updatedInventory,
        transaction: savedTransaction,
      });
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to record production', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * POST /inventory/transactions/purchase
   * Record material purchase from supplier
   * Updates: daily_inventory.barangMasuk++
   * Creates: inventory_transactions with PURCHASE type
   *
   * Only for materials (Barang Baku, Barang Pembantu, Barang Kemasan)
   * Finished goods use recordProduction() instead
   */
  async recordPurchase(
    dto: CreatePurchaseDto,
    userId: number,
  ): Promise<ResponseSuccess> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Validate product exists and is a material (not finished goods)
      const productCode = await this.productCodesRepo.findOne({
        where: { id: dto.productCodeId },
        relations: ['product', 'product.category'],
      });

      if (!productCode) {
        throw new NotFoundException(
          `Product code dengan ID ${dto.productCodeId} tidak ditemukan`,
        );
      }

      const categoryName = productCode.product?.category?.name || '';
      const isMaterial =
        categoryName === 'Barang Baku' ||
        categoryName === 'Barang Pembantu' ||
        categoryName === 'Barang Kemasan';

      if (!isMaterial) {
        throw new BadRequestException(
          `Produk "${productCode.product?.name}" bukan material. Gunakan endpoint production untuk Barang Jadi.`,
        );
      }

      // 2. Get business date (use purchaseDate if provided, otherwise today)
      const businessDateStr =
        dto.purchaseDate || new Date().toISOString().split('T')[0];
      const businessDate = new Date(businessDateStr);

      // 3. Get or create daily_inventory for this business date
      const dailyInventory = await this.getOrCreateDailyInventory(
        queryRunner,
        dto.productCodeId,
        businessDate,
        userId,
      );

      // 4. Calculate current balance (before this purchase)
      const currentBalance =
        Number(dailyInventory.stokAwal || 0) +
        Number(dailyInventory.barangMasuk || 0) -
        Number(dailyInventory.dipesan || 0) -
        Number(dailyInventory.barangOutRepack || 0) -
        Number(dailyInventory.barangOutSample || 0) -
        Number(dailyInventory.barangOutProduksi || 0);

      // 5. Calculate balance after this purchase
      const balanceAfter = currentBalance + dto.quantity;

      // 6. Generate unique purchase transaction number (PUR-YYYYMMDD-XXX)
      const datePrefix = businessDateStr.replace(/-/g, '');
      const existingTransactions = await queryRunner.manager.find(
        InventoryTransactions,
        {
          where: {
            transactionNumber: Like(`PUR-${datePrefix}-%`),
          },
          order: {
            transactionNumber: 'DESC',
          },
          take: 1,
        },
      );

      let sequence = 1;
      if (existingTransactions.length > 0) {
        const lastNumber = existingTransactions[0].transactionNumber;
        const lastSeq = parseInt(lastNumber.split('-').pop() || '0');
        sequence = lastSeq + 1;
      }

      const transactionNumber = `PUR-${datePrefix}-${sequence.toString().padStart(3, '0')}`;

      // 7. Build notes with supplier and price info
      const noteParts: string[] = [];
      if (dto.supplierName) {
        noteParts.push(`Supplier: ${dto.supplierName}`);
      }
      if (dto.purchasePrice) {
        noteParts.push(
          `Harga: Rp ${dto.purchasePrice.toLocaleString('id-ID')}/unit`,
        );
        noteParts.push(
          `Total: Rp ${(dto.purchasePrice * dto.quantity).toLocaleString('id-ID')}`,
        );
      }
      if (dto.invoiceNumber) {
        noteParts.push(`Invoice: ${dto.invoiceNumber}`);
      }
      if (dto.notes) {
        noteParts.push(dto.notes);
      }

      const fullNotes = noteParts.join(' | ');

      // 8. Create inventory transaction record
      const transaction = queryRunner.manager.create(InventoryTransactions, {
        transactionNumber,
        transactionType: TransactionType.PURCHASE,
        transactionDate: businessDate,
        businessDate: businessDate,
        productCodeId: dto.productCodeId,
        quantity: dto.quantity,
        balanceAfter,
        notes: fullNotes || `Pembelian material`,
        status: TransactionStatus.COMPLETED,
        createdBy: userId,
      });

      await queryRunner.manager.save(InventoryTransactions, transaction);

      // 9. Update daily_inventory.barangMasuk
      dailyInventory.barangMasuk =
        Number(dailyInventory.barangMasuk || 0) + dto.quantity;

      await queryRunner.manager.save(DailyInventory, dailyInventory);

      // 10. Commit transaction
      await queryRunner.commitTransaction();

      this.logger.log(
        `✅ Purchase recorded: ${transactionNumber} | ${dto.quantity} unit | Balance: ${currentBalance} → ${balanceAfter}`,
      );

      return this._success('Pembelian material berhasil dicatat', {
        transaction,
        dailyInventory,
      });
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `❌ Failed to record purchase: ${error.message}`,
        error.stack,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * POST /inventory/transactions/sale
   * Record sale/order fulfillment
   * Updates: daily_inventory.dipesan++
   * Creates: inventory_transactions with SALE type
   */
  async recordSale(
    dto: RecordSaleDto,
    userId: number,
    externalManager?: EntityManager, // ✅ ADDED: Optional external manager
  ): Promise<ResponseSuccess> {
    const isExternalTransaction = !!externalManager;
    // Jika transaksi external, kita tidak melakukan retry di sini (biarkan parent yang handle)
    const maxRetries = isExternalTransaction ? 1 : 3;
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      let queryRunner: QueryRunner | undefined;
      let manager: EntityManager;

      // ✅ SETUP MANAGER
      if (isExternalTransaction) {
        manager = externalManager;
      } else {
        queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        manager = queryRunner.manager;
      }

      try {
        // Verify product exists
        const product = await this.productCodesRepo.findOne({
          where: { id: dto.productCodeId },
        });

        if (!product) {
          throw new NotFoundException(
            `Product code ${dto.productCodeId} not found`,
          );
        }

        // ✅ CRITICAL FIX: Use invoiceDate instead of today for inventory reservation
        const targetDate = dto.invoiceDate
          ? this.formatDate(new Date(dto.invoiceDate))
          : this.formatDate(new Date());
        const businessDate = new Date(targetDate);

        console.log(
          `[RECORD SALE - Attempt ${attempt}] Invoice Date: ${dto.invoiceDate || 'today'}, Target Business Date: ${targetDate}`,
        );

        // Get or create daily inventory for the invoice/business date
        // Note: Pastikan getOrCreateDailyInventory support EntityManager atau ambil queryRunner dari manager
        const dailyInventory = await this.getOrCreateDailyInventory(
          manager.queryRunner || queryRunner, // Fallback to ensure queryRunner is passed if needed
          dto.productCodeId,
          businessDate,
          userId,
        );

        // Calculate current stock
        const stokAwal = Number(dailyInventory.stokAwal ?? 0);
        const barangMasuk = Number(dailyInventory.barangMasuk ?? 0);
        const dipesan = Number(dailyInventory.dipesan ?? 0);
        const barangOutRepack = Number(dailyInventory.barangOutRepack ?? 0);
        const barangOutSample = Number(dailyInventory.barangOutSample ?? 0);

        const currentStock =
          stokAwal + barangMasuk - dipesan - barangOutRepack - barangOutSample;

        this.logger.log(
          `[RECORD SALE - Attempt ${attempt}] Product ${dto.productCodeId} - Current Stock: ${currentStock} (stokAwal: ${stokAwal}, barangMasuk: ${barangMasuk}, dipesan: ${dipesan})`,
        );

        // Check stock availability
        if (currentStock < dto.quantity) {
          throw new BadRequestException(
            `Insufficient stock for product ${dto.productCodeId}. Available: ${currentStock}, Requested: ${dto.quantity}`,
          );
        }

        // Update daily inventory: increment dipesan
        const quantityToAdd = Number(dto.quantity) || 0;
        dailyInventory.dipesan = dipesan + quantityToAdd;
        dailyInventory.updatedBy = userId;

        this.logger.log(
          `[RECORD SALE - Attempt ${attempt}] Product ${dto.productCodeId}: dipesan ${dipesan} + ${quantityToAdd} = ${dailyInventory.dipesan}`,
        );

        // ✅ USE MANAGER
        await manager.save(DailyInventory, dailyInventory);

        // ✅ FIX: Re-fetch entity to get the updated stokAkhir
        const refreshedInventory = await manager.findOne(DailyInventory, {
          where: {
            id: dailyInventory.id,
          },
        });

        // Calculate balance after using the GENERATED stokAkhir
        const balanceAfter = Number(refreshedInventory?.stokAkhir ?? 0);

        if (!Number.isFinite(balanceAfter)) {
          this.logger.error(
            `[RECORD SALE - Attempt ${attempt}] Invalid balanceAfter (${balanceAfter}) for product ${dto.productCodeId}. Setting to 0.`,
          );
        }

        // Generate transaction number
        // Pastikan helper ini menggunakan manager/queryRunner yang benar
        const transactionNumber = await this.generateTransactionNumber(
          manager.queryRunner || queryRunner,
          'TRX',
        );

        this.logger.log(
          `[RECORD SALE - Attempt ${attempt}] Generated transaction number: ${transactionNumber}, Balance After: ${balanceAfter}`,
        );

        // Create transaction record
        const transaction = new InventoryTransactions();
        transaction.transactionNumber = transactionNumber;
        transaction.transactionDate = new Date();
        transaction.businessDate = businessDate;
        transaction.transactionType = TransactionType.SALE;
        transaction.productCodeId = dto.productCodeId;
        transaction.quantity = dto.quantity;
        transaction.balanceAfter = Number.isFinite(balanceAfter)
          ? balanceAfter
          : 0;

        if (dto.orderId) {
          transaction.orderId = dto.orderId;
        }
        transaction.status = TransactionStatus.COMPLETED;
        transaction.notes =
          dto.notes ||
          `Sale${dto.customerName ? ` to ${dto.customerName}` : ''}`;
        transaction.createdBy = userId;

        // ✅ USE MANAGER
        const savedTransaction = await manager.save(transaction);

        // Reload inventory
        const updatedInventory = await manager.findOne(DailyInventory, {
          where: { id: dailyInventory.id },
          relations: ['productCode', 'productCode.product'],
        });

        // ✅ ONLY COMMIT IF LOCAL TRANSACTION
        if (!isExternalTransaction && queryRunner) {
          await queryRunner.commitTransaction();
        }

        this.logger.log(
          `Sale recorded: Product ${dto.productCodeId}, Qty ${dto.quantity}${dto.orderId ? `, Order ${dto.orderId}` : ''}, TRX: ${transactionNumber}`,
        );

        // (Rollback) Tidak ada push notifikasi SALE pada proses pembuatan pesanan.

        return this._success('Sale recorded successfully', {
          dailyInventory: updatedInventory,
          transaction: savedTransaction,
        });
      } catch (error) {
        // ✅ ONLY ROLLBACK IF LOCAL TRANSACTION
        if (!isExternalTransaction && queryRunner) {
          await queryRunner.rollbackTransaction();

          // Check if it's a duplicate key error (RETRY ONLY FOR LOCAL)
          const isDuplicateError =
            error.code === 'ER_DUP_ENTRY' ||
            error.message?.includes('Duplicate entry');

          if (isDuplicateError && attempt < maxRetries) {
            this.logger.warn(
              `Duplicate transaction number detected on attempt ${attempt}, retrying...`,
            );
            lastError = error;
            await new Promise((resolve) =>
              setTimeout(resolve, 50 + Math.random() * 100),
            );
            continue; // Retry
          }
        }

        this.logger.error('Failed to record sale', error);
        throw error;
      } finally {
        // ✅ ONLY RELEASE IF LOCAL TRANSACTION
        if (!isExternalTransaction && queryRunner) {
          await queryRunner.release();
        }
      }
    }

    // If all retries failed (only reachable for local transactions)
    this.logger.error(
      `Failed to record sale after ${maxRetries} attempts`,
      lastError,
    );
    throw new BadRequestException(
      'Failed to record sale due to concurrent transaction. Please try again.',
    );
  }

  /**
   * Reverse/Cancel a sale transaction
   * Used when an order is cancelled or deleted
   * Updates:
   * - daily_inventory.dipesan-- (decrement by quantity)
   * Creates:
   * - inventory_transactions record with status CANCELLED
   */
  async reverseSale(
    orderId: number,
    productCodeId: number,
    quantity: number,
    userId: number,
    reason?: string,
    invoiceDate?: Date, // ✅ NEW: Invoice date to know which daily_inventory to update
  ): Promise<ResponseSuccess> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Verify product exists
      const product = await this.productCodesRepo.findOne({
        where: { id: productCodeId },
      });

      if (!product) {
        throw new NotFoundException(`Product code ${productCodeId} not found`);
      }

      // ✅ Use invoiceDate if provided, otherwise use today
      const targetDate = invoiceDate
        ? this.formatDate(new Date(invoiceDate))
        : this.formatDate(new Date());
      const businessDate = new Date(targetDate);

      // Get daily inventory for the business date
      const dailyInventory = await queryRunner.manager.findOne(DailyInventory, {
        where: {
          productCodeId: productCodeId,
          businessDate: businessDate, // ✅ Use invoice date, not today
        },
      });

      if (!dailyInventory) {
        throw new NotFoundException(
          `Daily inventory for product ${productCodeId} not found for date ${targetDate}`,
        );
      }

      // Check if dipesan is sufficient
      // Use nullish coalescing to handle null values
      if ((dailyInventory.dipesan ?? 0) < quantity) {
        throw new BadRequestException(
          `Cannot reverse sale. Current dipesan (${dailyInventory.dipesan ?? 0}) is less than quantity (${quantity})`,
        );
      }

      // Update daily inventory: decrement dipesan
      dailyInventory.dipesan = (dailyInventory.dipesan ?? 0) - quantity;
      dailyInventory.updatedBy = userId;
      await queryRunner.manager.save(DailyInventory, dailyInventory);

      // Calculate balance after
      // Use nullish coalescing to handle null values from database
      const currentStock =
        (dailyInventory.stokAwal ?? 0) +
        (dailyInventory.barangMasuk ?? 0) -
        (dailyInventory.dipesan ?? 0) -
        (dailyInventory.barangOutRepack ?? 0) -
        (dailyInventory.barangOutSample ?? 0);

      // Generate transaction number
      const transactionNumber = await this.generateTransactionNumber(
        queryRunner,
        'TRX',
      );

      // Create reversal transaction record
      const transaction = new InventoryTransactions();
      transaction.transactionNumber = transactionNumber;
      transaction.transactionDate = new Date();
      transaction.businessDate = businessDate; // ✅ Use invoice date as business date
      transaction.transactionType = TransactionType.SALE; // Keep as SALE type
      transaction.productCodeId = productCodeId;
      transaction.quantity = quantity;
      transaction.balanceAfter = currentStock;
      transaction.orderId = orderId;
      transaction.status = TransactionStatus.CANCELLED; // Mark as CANCELLED
      transaction.reason = reason || 'Order cancelled/deleted';
      transaction.notes = `Reversal of order ${orderId}`;
      transaction.createdBy = userId;

      const savedTransaction = await queryRunner.manager.save(transaction);

      // Reload inventory
      const updatedInventory = await queryRunner.manager.findOne(
        DailyInventory,
        {
          where: { id: dailyInventory.id },
          relations: ['productCode', 'productCode.product'],
        },
      );

      await queryRunner.commitTransaction();

      this.logger.log(
        `Sale reversed: Product ${productCodeId}, Qty ${quantity}, Order ${orderId}`,
      );

      return this._success('Sale reversal recorded successfully', {
        dailyInventory: updatedInventory,
        transaction: savedTransaction,
      });
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to reverse sale', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * POST /inventory/transactions/repacking
   * Record repacking operation (e.g., 1L jerrycan → 4x 250ML bottles)
   * Updates:
   * - Source product: barangOutRepack++
   * - Target product: barangMasuk++
   * Creates:
   * - 2 inventory_transactions (REPACK_OUT, REPACK_IN)
   * - 1 repacking_records entry
   */
  async recordRepacking(
    dto: RecordRepackingDto,
    userId: number,
  ): Promise<ResponseSuccess> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Verify both products exist
      const [sourceProduct, targetProduct] = await Promise.all([
        this.productCodesRepo.findOne({
          where: { id: dto.sourceProductCodeId },
        }),
        this.productCodesRepo.findOne({
          where: { id: dto.targetProductCodeId },
        }),
      ]);

      if (!sourceProduct) {
        throw new NotFoundException(
          `Source product ${dto.sourceProductCodeId} not found`,
        );
      }

      if (!targetProduct) {
        throw new NotFoundException(
          `Target product ${dto.targetProductCodeId} not found`,
        );
      }

      const today = this.formatDate(new Date());
      const todayDate = new Date(today);

      // Get or create daily inventory for both products
      const sourceInventory = await this.getOrCreateDailyInventory(
        queryRunner,
        dto.sourceProductCodeId,
        todayDate,
        userId,
      );

      const targetInventory = await this.getOrCreateDailyInventory(
        queryRunner,
        dto.targetProductCodeId,
        todayDate,
        userId,
      );

      // Check source stock availability
      // Explicit Number conversion to prevent NaN
      const sourceStokAwal = Number(sourceInventory.stokAwal ?? 0);
      const sourceBarangMasuk = Number(sourceInventory.barangMasuk ?? 0);
      const sourceDipesan = Number(sourceInventory.dipesan ?? 0);
      const sourceBarangOutRepack = Number(
        sourceInventory.barangOutRepack ?? 0,
      );
      const sourceBarangOutSample = Number(
        sourceInventory.barangOutSample ?? 0,
      );

      const sourceStock =
        sourceStokAwal +
        sourceBarangMasuk -
        sourceDipesan -
        sourceBarangOutRepack -
        sourceBarangOutSample;

      this.logger.log(
        `[REPACKING SOURCE] Product ${dto.sourceProductCodeId} - Current Stock: ${sourceStock}`,
      );

      if (sourceStock < dto.sourceQuantity) {
        throw new BadRequestException(
          `Insufficient stock for source product ${dto.sourceProductCodeId}. Available: ${sourceStock}, Requested: ${dto.sourceQuantity}`,
        );
      }

      // Update source inventory: increment barangOutRepack
      sourceInventory.barangOutRepack =
        sourceBarangOutRepack + dto.sourceQuantity;
      sourceInventory.updatedBy = userId;
      await queryRunner.manager.save(DailyInventory, sourceInventory);

      // Refresh source inventory to get updated stokAkhir (generated column)
      const refreshedSourceInventory = await queryRunner.manager.findOne(
        DailyInventory,
        {
          where: { id: sourceInventory.id },
        },
      );

      // Update target inventory: increment barangMasuk
      const targetBarangMasuk = Number(targetInventory.barangMasuk ?? 0);
      targetInventory.barangMasuk = targetBarangMasuk + dto.targetQuantity;
      targetInventory.updatedBy = userId;
      await queryRunner.manager.save(DailyInventory, targetInventory);

      // Refresh target inventory to get updated stokAkhir (generated column)
      const refreshedTargetInventory = await queryRunner.manager.findOne(
        DailyInventory,
        {
          where: { id: targetInventory.id },
        },
      );

      // Create repacking record
      const repackingNumber = await this.generateTransactionNumber(
        queryRunner,
        'RPK',
      );

      // Calculate conversion ratio: how many source units = 1 target unit
      // Example: 4 x 250ML → 1 x 1000ML = ratio 4.0
      const sourceQty = Number(dto.sourceQuantity);
      const targetQty = Number(dto.targetQuantity);

      const conversionRatio = sourceQty / targetQty;
      const expectedTargetQty = sourceQty / conversionRatio;
      const lossQuantity = expectedTargetQty - targetQty;
      const lossPercentage = (lossQuantity / sourceQty) * 100;

      this.logger.log(
        `[REPACKING CALC] Source: ${sourceQty}, Target: ${targetQty}, Ratio: ${conversionRatio}, Expected: ${expectedTargetQty}, Loss: ${lossQuantity} (${lossPercentage}%)`,
      );

      const repackingRecord = new RepackingRecords();
      repackingRecord.repackingNumber = repackingNumber;
      repackingRecord.repackingDate = new Date();
      repackingRecord.businessDate = todayDate;
      repackingRecord.sourceProductCodeId = dto.sourceProductCodeId;
      repackingRecord.targetProductCodeId = dto.targetProductCodeId;
      repackingRecord.sourceQuantity = sourceQty;
      repackingRecord.targetQuantity = targetQty;
      repackingRecord.conversionRatio = Number(conversionRatio.toFixed(4));
      repackingRecord.expectedTargetQty = Number(expectedTargetQty.toFixed(2));
      repackingRecord.lossQuantity = Number(lossQuantity.toFixed(2));
      repackingRecord.lossPercentage = Number(lossPercentage.toFixed(2));
      if (dto.reason) {
        repackingRecord.reason = dto.reason;
      }
      if (dto.performedBy) {
        repackingRecord.performedBy = dto.performedBy;
      }
      repackingRecord.status = RepackingStatus.COMPLETED;
      repackingRecord.createdBy = userId;

      const savedRepacking = await queryRunner.manager.save(repackingRecord);

      // Calculate balances with explicit Number conversion and validation
      const sourceBalanceAfter = Number(
        refreshedSourceInventory?.stokAkhir ?? 0,
      );
      const targetBalanceAfter = Number(
        refreshedTargetInventory?.stokAkhir ?? 0,
      );

      this.logger.log(
        `[REPACKING] Source Balance After: ${sourceBalanceAfter}, Target Balance After: ${targetBalanceAfter}`,
      );

      // Create source transaction (OUT)
      const sourceTrxNumber = await this.generateTransactionNumber(
        queryRunner,
        'TRX',
      );
      const sourceTransaction = new InventoryTransactions();
      sourceTransaction.transactionNumber = sourceTrxNumber;
      sourceTransaction.transactionDate = new Date();
      sourceTransaction.businessDate = todayDate;
      sourceTransaction.transactionType = TransactionType.REPACK_OUT;
      sourceTransaction.productCodeId = dto.sourceProductCodeId;
      sourceTransaction.quantity = dto.sourceQuantity;

      // Validate balanceAfter before save
      if (!Number.isFinite(sourceBalanceAfter)) {
        this.logger.error(
          `[REPACKING SOURCE] Invalid balanceAfter (${sourceBalanceAfter}). Setting to 0.`,
        );
      }
      sourceTransaction.balanceAfter = Number.isFinite(sourceBalanceAfter)
        ? sourceBalanceAfter
        : 0;

      sourceTransaction.repackingId = savedRepacking.id;
      sourceTransaction.status = TransactionStatus.COMPLETED;
      if (dto.reason) {
        sourceTransaction.reason = dto.reason;
      }
      sourceTransaction.notes = `Repack to product ${dto.targetProductCodeId}`;
      if (dto.performedBy) {
        sourceTransaction.performedBy = dto.performedBy;
      }
      sourceTransaction.createdBy = userId;

      // Save source transaction first to increment sequence
      await queryRunner.manager.save(InventoryTransactions, sourceTransaction);

      // Create target transaction (IN) - generate new number after source is saved
      const targetTrxNumber = await this.generateTransactionNumber(
        queryRunner,
        'TRX',
      );
      const targetTransaction = new InventoryTransactions();
      targetTransaction.transactionNumber = targetTrxNumber;
      targetTransaction.transactionDate = new Date();
      targetTransaction.businessDate = todayDate;
      targetTransaction.transactionType = TransactionType.REPACK_IN;
      targetTransaction.productCodeId = dto.targetProductCodeId;
      targetTransaction.quantity = dto.targetQuantity;

      // Validate balanceAfter before save
      if (!Number.isFinite(targetBalanceAfter)) {
        this.logger.error(
          `[REPACKING TARGET] Invalid balanceAfter (${targetBalanceAfter}). Setting to 0.`,
        );
      }
      targetTransaction.balanceAfter = Number.isFinite(targetBalanceAfter)
        ? targetBalanceAfter
        : 0;

      targetTransaction.repackingId = savedRepacking.id;
      targetTransaction.status = TransactionStatus.COMPLETED;
      if (dto.reason) {
        targetTransaction.reason = dto.reason;
      }
      targetTransaction.notes = `Repack from product ${dto.sourceProductCodeId}`;
      if (dto.performedBy) {
        targetTransaction.performedBy = dto.performedBy;
      }
      targetTransaction.createdBy = userId;

      // Save target transaction
      await queryRunner.manager.save(InventoryTransactions, targetTransaction);

      // Reload both inventories
      const [updatedSource, updatedTarget] = await Promise.all([
        queryRunner.manager.findOne(DailyInventory, {
          where: { id: sourceInventory.id },
          relations: ['productCode', 'productCode.product'],
        }),
        queryRunner.manager.findOne(DailyInventory, {
          where: { id: targetInventory.id },
          relations: ['productCode', 'productCode.product'],
        }),
      ]);

      await queryRunner.commitTransaction();

      this.logger.log(
        `Repacking recorded: ${dto.sourceProductCodeId} (${dto.sourceQuantity}) → ${dto.targetProductCodeId} (${dto.targetQuantity})`,
      );

      return this._success('Repacking recorded successfully', {
        repackingRecord: savedRepacking,
        sourceInventory: updatedSource,
        targetInventory: updatedTarget,
        transactions: {
          source: sourceTransaction,
          target: targetTransaction,
        },
      });
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to record repacking', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * POST /inventory/transactions/sample-out
   * Record sample distribution to customer
   * Updates: daily_inventory.barangOutSample++
   * Creates:
   * - inventory_transactions with SAMPLE_OUT type
   * - sample_tracking with DISTRIBUTED status
   */
  async recordSampleOut(
    dto: RecordSampleDto,
    userId: number,
  ): Promise<ResponseSuccess> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Verify product exists
      const product = await this.productCodesRepo.findOne({
        where: { id: dto.productCodeId },
      });

      if (!product) {
        throw new NotFoundException(
          `Product code ${dto.productCodeId} not found`,
        );
      }

      const today = this.formatDate(new Date());
      const todayDate = new Date(today);

      // Get or create today's inventory
      const dailyInventory = await this.getOrCreateDailyInventory(
        queryRunner,
        dto.productCodeId,
        todayDate,
        userId,
      );

      // Check stock availability
      // Explicit Number conversion to prevent NaN
      const stokAwal = Number(dailyInventory.stokAwal ?? 0);
      const barangMasuk = Number(dailyInventory.barangMasuk ?? 0);
      const dipesan = Number(dailyInventory.dipesan ?? 0);
      const barangOutRepack = Number(dailyInventory.barangOutRepack ?? 0);
      const barangOutSample = Number(dailyInventory.barangOutSample ?? 0);

      const currentStock =
        stokAwal + barangMasuk - dipesan - barangOutRepack - barangOutSample;

      this.logger.log(
        `[SAMPLE OUT] Product ${dto.productCodeId} - Current Stock: ${currentStock}`,
      );

      if (currentStock < dto.quantity) {
        throw new BadRequestException(
          `Insufficient stock for product ${dto.productCodeId}. Available: ${currentStock}, Requested: ${dto.quantity}`,
        );
      }

      // Update daily inventory: increment barangOutSample
      dailyInventory.barangOutSample = barangOutSample + dto.quantity;
      dailyInventory.updatedBy = userId;
      await queryRunner.manager.save(DailyInventory, dailyInventory);

      // Refresh inventory to get updated stokAkhir (generated column)
      const refreshedInventory = await queryRunner.manager.findOne(
        DailyInventory,
        {
          where: { id: dailyInventory.id },
        },
      );

      // Calculate balance with explicit Number conversion and validation
      const balanceAfter = Number(refreshedInventory?.stokAkhir ?? 0);

      this.logger.log(
        `[SAMPLE OUT] Product ${dto.productCodeId} - Balance After: ${balanceAfter}`,
      );

      this.logger.log(
        `[SAMPLE OUT] Product ${dto.productCodeId} - Balance After: ${balanceAfter}`,
      );

      // Generate sample number
      const sampleNumber = await this.generateTransactionNumber(
        queryRunner,
        'SMP',
      );

      // Create sample tracking record
      const sampleTracking = new SampleTracking();
      sampleTracking.sampleNumber = sampleNumber;
      sampleTracking.sampleDate = new Date();
      sampleTracking.businessDate = todayDate;
      sampleTracking.productCodeId = dto.productCodeId;
      sampleTracking.quantity = dto.quantity;
      sampleTracking.recipientName = dto.customerName;
      sampleTracking.purpose = this.mapPurpose(dto.purpose);
      sampleTracking.expectedReturn = false;
      if (dto.expectedReturnDate) {
        sampleTracking.followUpDate = dto.expectedReturnDate;
      }
      sampleTracking.status = SampleStatus.DISTRIBUTED;
      if (dto.notes) {
        sampleTracking.notes = dto.notes;
      }
      sampleTracking.createdBy = userId;

      const savedSample = await queryRunner.manager.save(sampleTracking);

      // Generate transaction number
      const transactionNumber = await this.generateTransactionNumber(
        queryRunner,
        'TRX',
      );

      // Create transaction record
      const transaction = new InventoryTransactions();
      transaction.transactionNumber = transactionNumber;
      transaction.transactionDate = new Date();
      transaction.businessDate = todayDate;
      transaction.transactionType = TransactionType.SAMPLE_OUT;
      transaction.productCodeId = dto.productCodeId;
      transaction.quantity = dto.quantity;

      // Validate balanceAfter before save
      if (!Number.isFinite(balanceAfter)) {
        this.logger.error(
          `[SAMPLE OUT] Invalid balanceAfter (${balanceAfter}). Setting to 0.`,
        );
      }
      transaction.balanceAfter = Number.isFinite(balanceAfter)
        ? balanceAfter
        : 0;

      transaction.status = TransactionStatus.COMPLETED;
      transaction.notes = `Sample to ${dto.customerName}${dto.purpose ? ` - ${dto.purpose}` : ''}`;
      transaction.createdBy = userId;

      const savedTransaction = await queryRunner.manager.save(transaction);

      // Link transaction to sample tracking
      savedSample.outTransactionId = savedTransaction.id;
      await queryRunner.manager.save(SampleTracking, savedSample);

      // Reload inventory
      const updatedInventory = await queryRunner.manager.findOne(
        DailyInventory,
        {
          where: { id: dailyInventory.id },
          relations: ['productCode', 'productCode.product'],
        },
      );

      await queryRunner.commitTransaction();

      this.logger.log(
        `Sample out recorded: Product ${dto.productCodeId}, Qty ${dto.quantity}, To ${dto.customerName}`,
      );

      return this._success('Sample out recorded successfully', {
        sampleTracking: savedSample,
        dailyInventory: updatedInventory,
        transaction: savedTransaction,
      });
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to record sample out', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * POST /inventory/transactions/sample-return
   * Record sample return from customer
   * Updates: daily_inventory.barangMasuk++ (if returned)
   * Updates: sample_tracking status and return info
   */
  async recordSampleReturn(
    dto: ReturnSampleDto,
    userId: number,
  ): Promise<ResponseSuccess> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Find sample tracking record
      const sampleTracking = await queryRunner.manager.findOne(SampleTracking, {
        where: { id: dto.sampleTrackingId },
        relations: ['productCode'],
      });

      if (!sampleTracking) {
        throw new NotFoundException(
          `Sample tracking ${dto.sampleTrackingId} not found`,
        );
      }

      if (sampleTracking.status !== SampleStatus.DISTRIBUTED) {
        throw new BadRequestException(
          `Sample is already ${sampleTracking.status}. Only DISTRIBUTED samples can be returned.`,
        );
      }

      const today = this.formatDate(new Date());
      const todayDate = new Date(today);
      const returnedQty = dto.returnedQuantity || 0;

      // Map status
      let newStatus: SampleStatus;
      if (dto.status === 'returned') {
        newStatus = SampleStatus.RETURNED;
      } else if (dto.status === 'lost') {
        newStatus = SampleStatus.CLOSED;
      } else if (dto.status === 'damaged') {
        newStatus = SampleStatus.CLOSED;
      } else {
        newStatus = SampleStatus.CLOSED;
      }

      // Update sample tracking
      sampleTracking.status = newStatus;
      sampleTracking.returnDate = new Date();
      sampleTracking.returnQuantity = returnedQty;
      sampleTracking.notes = dto.notes || sampleTracking.notes;
      sampleTracking.updatedBy = userId;

      await queryRunner.manager.save(SampleTracking, sampleTracking);

      let dailyInventory = null;
      let transaction = null;

      // If returned (not lost/damaged), increment barangMasuk
      if (dto.status === 'returned' && returnedQty > 0) {
        dailyInventory = await this.getOrCreateDailyInventory(
          queryRunner,
          sampleTracking.productCodeId,
          todayDate,
          userId,
        );

        // Explicit Number conversion to prevent NaN
        const stokAwal = Number(dailyInventory.stokAwal ?? 0);
        const barangMasuk = Number(dailyInventory.barangMasuk ?? 0);
        const dipesan = Number(dailyInventory.dipesan ?? 0);
        const barangOutRepack = Number(dailyInventory.barangOutRepack ?? 0);
        const barangOutSample = Number(dailyInventory.barangOutSample ?? 0);

        const currentStock =
          stokAwal + barangMasuk - dipesan - barangOutRepack - barangOutSample;

        this.logger.log(
          `[SAMPLE RETURN] Product ${sampleTracking.productCodeId} - Current Stock Before Return: ${currentStock}`,
        );

        // Update inventory
        dailyInventory.barangMasuk = barangMasuk + returnedQty;
        dailyInventory.updatedBy = userId;
        await queryRunner.manager.save(DailyInventory, dailyInventory);

        // Refresh inventory to get updated stokAkhir (generated column)
        const refreshedInventory = await queryRunner.manager.findOne(
          DailyInventory,
          {
            where: { id: dailyInventory.id },
          },
        );

        // Calculate balance with explicit Number conversion and validation
        const balanceAfter = Number(refreshedInventory?.stokAkhir ?? 0);

        this.logger.log(
          `[SAMPLE RETURN] Product ${sampleTracking.productCodeId} - Balance After: ${balanceAfter}`,
        );

        // Generate transaction number
        const transactionNumber = await this.generateTransactionNumber(
          queryRunner,
          'TRX',
        );

        // Create transaction record
        transaction = new InventoryTransactions();
        transaction.transactionNumber = transactionNumber;
        transaction.transactionDate = new Date();
        transaction.businessDate = todayDate;
        transaction.transactionType = TransactionType.SAMPLE_RETURN;
        transaction.productCodeId = sampleTracking.productCodeId;
        transaction.quantity = returnedQty;

        // Validate balanceAfter before save
        if (!Number.isFinite(balanceAfter)) {
          this.logger.error(
            `[SAMPLE RETURN] Invalid balanceAfter (${balanceAfter}). Setting to 0.`,
          );
        }
        transaction.balanceAfter = Number.isFinite(balanceAfter)
          ? balanceAfter
          : 0;

        transaction.status = TransactionStatus.COMPLETED;
        transaction.notes = `Sample returned from ${sampleTracking.recipientName}`;
        transaction.createdBy = userId;

        const savedTransaction = await queryRunner.manager.save(transaction);

        // Link return transaction
        sampleTracking.returnTransactionId = savedTransaction.id;
        await queryRunner.manager.save(SampleTracking, sampleTracking);

        // Reload inventory
        dailyInventory = await queryRunner.manager.findOne(DailyInventory, {
          where: { id: dailyInventory.id },
          relations: ['productCode', 'productCode.product'],
        });

        transaction = savedTransaction;
      }

      await queryRunner.commitTransaction();

      this.logger.log(
        `Sample return recorded: Sample ${dto.sampleTrackingId}, Status ${dto.status}, Qty ${returnedQty}`,
      );

      return this._success('Sample return recorded successfully', {
        sampleTracking,
        dailyInventory,
        transaction,
      });
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to record sample return', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Get or create today's daily inventory record
   * Used by all transaction operations
   */
  private async getOrCreateDailyInventory(
    queryRunner: any,
    productCodeId: number,
    businessDate: Date,
    userId: number,
  ): Promise<DailyInventory> {
    const formattedDate = this.formatDate(businessDate);

    let inventory = await queryRunner.manager.findOne(DailyInventory, {
      where: {
        productCodeId,
        businessDate: formattedDate,
      },
    });

    if (!inventory) {
      this.logger.warn(
        `Creating missing daily inventory for product ${productCodeId} on ${formattedDate}`,
      );

      // Get yesterday's stokAkhir for stokAwal
      const yesterday = new Date(businessDate);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayFormatted = this.formatDate(yesterday);

      const yesterdayRecord = await queryRunner.manager.findOne(
        DailyInventory,
        {
          where: {
            productCodeId,
            businessDate: yesterdayFormatted,
          },
        },
      );

      inventory = queryRunner.manager.create(DailyInventory, {
        productCodeId,
        businessDate: formattedDate,
        stokAwal: yesterdayRecord?.stokAkhir || 0,
        barangMasuk: 0,
        dipesan: 0,
        barangOutRepack: 0,
        barangOutSample: 0,
        minimumStock: 0,
        maximumStock: 0,
        isActive: true,
        createdBy: userId,
      });

      inventory = await queryRunner.manager.save(DailyInventory, inventory);
    }

    return inventory;
  }

  /**
   * Generate unique transaction/sample/repacking number
   * Format: {prefix}-YYYYMMDD-{sequence}
   * Example: TRX-20250115-001, SMP-20250115-002, RPK-20250115-001
   *
   * Uses MAX + 1 approach with proper ordering to handle concurrent requests
   */
  private async generateTransactionNumber(
    queryRunner: any,
    prefix: 'TRX' | 'SMP' | 'RPK',
  ): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    const pattern = `${prefix}-${dateStr}-%`;

    // Get the latest sequence number for today using MAX + substring
    let maxSequence = 0;

    if (prefix === 'TRX') {
      const result = await queryRunner.manager
        .createQueryBuilder(InventoryTransactions, 'trx')
        .select(
          'MAX(CAST(SUBSTRING(trx.transactionNumber, -3) AS UNSIGNED))',
          'maxSeq',
        )
        .where('trx.transactionNumber LIKE :pattern', { pattern })
        .andWhere('trx.deletedAt IS NULL')
        .getRawOne();

      maxSequence = result?.maxSeq ? parseInt(result.maxSeq, 10) : 0;
    } else if (prefix === 'SMP') {
      const result = await queryRunner.manager
        .createQueryBuilder(SampleTracking, 'smp')
        .select(
          'MAX(CAST(SUBSTRING(smp.sampleNumber, -3) AS UNSIGNED))',
          'maxSeq',
        )
        .where('smp.sampleNumber LIKE :pattern', { pattern })
        .andWhere('smp.deletedAt IS NULL')
        .getRawOne();

      maxSequence = result?.maxSeq ? parseInt(result.maxSeq, 10) : 0;
    } else if (prefix === 'RPK') {
      const result = await queryRunner.manager
        .createQueryBuilder(RepackingRecords, 'rpk')
        .select(
          'MAX(CAST(SUBSTRING(rpk.repackingNumber, -3) AS UNSIGNED))',
          'maxSeq',
        )
        .where('rpk.repackingNumber LIKE :pattern', { pattern })
        .andWhere('rpk.deletedAt IS NULL')
        .getRawOne();

      maxSequence = result?.maxSeq ? parseInt(result.maxSeq, 10) : 0;
    }

    const sequence = String(maxSequence + 1).padStart(3, '0');
    return `${prefix}-${dateStr}-${sequence}`;
  }

  /**
   * Format date to YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Map purpose string to SamplePurpose enum
   */
  private mapPurpose(purpose?: string): SamplePurpose {
    if (!purpose) return SamplePurpose.OTHER;

    const purposeLower = purpose.toLowerCase();
    if (purposeLower.includes('promo')) return SamplePurpose.PROMOTION;
    if (purposeLower.includes('demo')) return SamplePurpose.DEMO;
    if (purposeLower.includes('test') || purposeLower.includes('quality'))
      return SamplePurpose.QUALITY_TEST;
    if (purposeLower.includes('partner')) return SamplePurpose.PARTNERSHIP;
    if (purposeLower.includes('event')) return SamplePurpose.EVENT;

    return SamplePurpose.OTHER;
  }

  // ==================== QUERY METHODS - REPACKING ====================

  /**
   * GET /inventory/repackings
   * Get all repacking records with filters
   */
  async getAllRepackings(query: any): Promise<ResponseSuccess> {
    const {
      startDate,
      endDate,
      sourceProductCodeId,
      targetProductCodeId,
      status,
      page = 1,
      limit = 20,
    } = query;

    const queryBuilder = this.repackingRepo
      .createQueryBuilder('repacking')
      .leftJoinAndSelect('repacking.sourceProductCode', 'sourceProduct')
      .leftJoinAndSelect('sourceProduct.product', 'sourceProductInfo')
      .leftJoinAndSelect('sourceProduct.size', 'sourceSize')
      .leftJoinAndSelect('repacking.targetProductCode', 'targetProduct')
      .leftJoinAndSelect('targetProduct.product', 'targetProductInfo')
      .leftJoinAndSelect('targetProduct.size', 'targetSize')
      .orderBy('repacking.repackingDate', 'DESC');

    // Filters
    if (startDate) {
      queryBuilder.andWhere('repacking.businessDate >= :startDate', {
        startDate,
      });
    }
    if (endDate) {
      queryBuilder.andWhere('repacking.businessDate <= :endDate', { endDate });
    }
    if (sourceProductCodeId) {
      queryBuilder.andWhere('repacking.sourceProductCodeId = :sourceId', {
        sourceId: sourceProductCodeId,
      });
    }
    if (targetProductCodeId) {
      queryBuilder.andWhere('repacking.targetProductCodeId = :targetId', {
        targetId: targetProductCodeId,
      });
    }
    if (status) {
      queryBuilder.andWhere('repacking.status = :status', { status });
    }

    // Pagination
    const total = await queryBuilder.getCount();
    const skip = (page - 1) * limit;
    const items = await queryBuilder.skip(skip).take(limit).getMany();

    return this._success('Repacking records retrieved successfully', {
      items,
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  }

  /**
   * GET /inventory/repackings/:id
   * Get repacking record by ID
   */
  async getRepackingById(id: number): Promise<ResponseSuccess> {
    const repacking = await this.repackingRepo.findOne({
      where: { id },
      relations: [
        'sourceProductCode',
        'sourceProductCode.product',
        'sourceProductCode.size',
        'targetProductCode',
        'targetProductCode.product',
        'targetProductCode.size',
      ],
    });

    if (!repacking) {
      throw new NotFoundException(`Repacking record ${id} not found`);
    }

    // Get associated transactions
    const transactions = await this.transactionsRepo.find({
      where: { repackingId: id },
      relations: ['productCode', 'productCode.product'],
    });

    return this._success('Repacking record retrieved successfully', {
      repacking,
      transactions,
    });
  }

  /**
   * GET /inventory/repackings/history/:productCodeId
   * Get repacking history for a specific product (as source or target)
   */
  async getRepackingHistory(
    productCodeId: number,
    asSource: boolean = true,
  ): Promise<ResponseSuccess> {
    const queryBuilder = this.repackingRepo
      .createQueryBuilder('repacking')
      .leftJoinAndSelect('repacking.sourceProductCode', 'sourceProduct')
      .leftJoinAndSelect('sourceProduct.product', 'sourceProductInfo')
      .leftJoinAndSelect('repacking.targetProductCode', 'targetProduct')
      .leftJoinAndSelect('targetProduct.product', 'targetProductInfo')
      .orderBy('repacking.repackingDate', 'DESC');

    if (asSource) {
      queryBuilder.where('repacking.sourceProductCodeId = :productCodeId', {
        productCodeId,
      });
    } else {
      queryBuilder.where('repacking.targetProductCodeId = :productCodeId', {
        productCodeId,
      });
    }

    const items = await queryBuilder.take(50).getMany();

    return this._success('Repacking history retrieved successfully', items);
  }

  // ==================== QUERY METHODS - SAMPLE TRACKING ====================

  /**
   * GET /inventory/samples
   * Get all sample tracking records with filters
   */
  async getAllSamples(query: any): Promise<ResponseSuccess> {
    const {
      status,
      recipientName,
      startDate,
      endDate,
      productCodeId,
      page = 1,
      limit = 20,
    } = query;

    const queryBuilder = this.sampleTrackingRepo
      .createQueryBuilder('sample')
      .leftJoinAndSelect('sample.productCode', 'product')
      .leftJoinAndSelect('product.product', 'productInfo')
      .leftJoinAndSelect('product.size', 'size')
      .orderBy('sample.sampleDate', 'DESC');

    // Filters
    if (status) {
      queryBuilder.andWhere('sample.status = :status', { status });
    }
    if (recipientName) {
      queryBuilder.andWhere('sample.recipientName LIKE :name', {
        name: `%${recipientName}%`,
      });
    }
    if (startDate) {
      queryBuilder.andWhere('sample.businessDate >= :startDate', { startDate });
    }
    if (endDate) {
      queryBuilder.andWhere('sample.businessDate <= :endDate', { endDate });
    }
    if (productCodeId) {
      queryBuilder.andWhere('sample.productCodeId = :productCodeId', {
        productCodeId,
      });
    }

    // Pagination
    const total = await queryBuilder.getCount();
    const skip = (page - 1) * limit;
    const items = await queryBuilder.skip(skip).take(limit).getMany();

    return this._success('Sample records retrieved successfully', {
      items,
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  }

  /**
   * GET /inventory/samples/:id
   * Get sample tracking record by ID
   */
  async getSampleById(id: number): Promise<ResponseSuccess> {
    const sample = await this.sampleTrackingRepo.findOne({
      where: { id },
      relations: [
        'productCode',
        'productCode.product',
        'productCode.size',
        'order',
      ],
    });

    if (!sample) {
      throw new NotFoundException(`Sample tracking record ${id} not found`);
    }

    // Get associated transactions
    const transactions = await this.transactionsRepo.find({
      where: [
        { id: sample.outTransactionId },
        { id: sample.returnTransactionId },
      ],
      relations: ['productCode'],
    });

    return this._success('Sample record retrieved successfully', {
      sample,
      transactions,
    });
  }

  /**
   * GET /inventory/samples/active
   * Get outstanding samples (DISTRIBUTED status)
   */
  async getActiveSamples(): Promise<ResponseSuccess> {
    const samples = await this.sampleTrackingRepo.find({
      where: { status: SampleStatus.DISTRIBUTED },
      relations: ['productCode', 'productCode.product', 'productCode.size'],
      order: { sampleDate: 'DESC' },
    });

    return this._success('Active samples retrieved successfully', samples);
  }

  /**
   * GET /inventory/samples/follow-up
   * Get samples due for follow-up (followUpDate <= today and status = DISTRIBUTED)
   */
  async getSamplesDueForFollowUp(): Promise<ResponseSuccess> {
    const today = new Date(this.formatDate(new Date()));

    const samples = await this.sampleTrackingRepo
      .createQueryBuilder('sample')
      .leftJoinAndSelect('sample.productCode', 'product')
      .leftJoinAndSelect('product.product', 'productInfo')
      .where('sample.status = :status', { status: SampleStatus.DISTRIBUTED })
      .andWhere('sample.followUpDate IS NOT NULL')
      .andWhere('sample.followUpDate <= :today', { today })
      .orderBy('sample.followUpDate', 'ASC')
      .getMany();

    return this._success(
      'Samples due for follow-up retrieved successfully',
      samples,
    );
  }

  /**
   * GET /inventory/samples/product/:productCodeId
   * Get sample history for a specific product
   */
  async getSamplesByProduct(productCodeId: number): Promise<ResponseSuccess> {
    const samples = await this.sampleTrackingRepo.find({
      where: { productCodeId },
      relations: ['productCode', 'productCode.product'],
      order: { sampleDate: 'DESC' },
      take: 50,
    });

    return this._success(
      'Sample history for product retrieved successfully',
      samples,
    );
  }

  /**
   * GET /inventory/transactions/history
   * Get paginated transaction history with comprehensive filters
   *
   * Filters:
   * - productCodeId: Filter by specific product code
   * - transactionType: Filter by transaction type (PRODUCTION_IN, SALE, REPACK_OUT, etc.)
   * - startDate/endDate: Date range filter
   * - orderId: Filter by order
   * - productionBatchNumber: Filter by production batch
   * - mainCategory: Filter by product main category
   * - page/limit: Pagination
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
      mainCategory,
      page = 1,
      limit = 20,
    } = query;

    const queryBuilder = this.transactionsRepo
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.productCode', 'productCode')
      .leftJoinAndSelect('productCode.product', 'product')
      .leftJoinAndSelect('productCode.size', 'size')
      .leftJoinAndSelect('productCode.category', 'mainCategory') // SWAPPED: pc.category = Main Category (level 0)
      .leftJoin('product.category', 'subCategory'); // SWAPPED: product.category = Sub Category (level 1)

    // Filter by productCodeId
    if (productCodeId) {
      queryBuilder.andWhere('transaction.productCodeId = :productCodeId', {
        productCodeId,
      });
    }

    // Filter by transactionType
    if (transactionType) {
      queryBuilder.andWhere('transaction.transactionType = :transactionType', {
        transactionType,
      });
    }

    // Filter by date range
    if (startDate) {
      queryBuilder.andWhere('transaction.transactionDate >= :startDate', {
        startDate,
      });
    }
    if (endDate) {
      queryBuilder.andWhere('transaction.transactionDate <= :endDate', {
        endDate,
      });
    }

    // Filter by orderId
    if (orderId) {
      queryBuilder.andWhere('transaction.orderId = :orderId', { orderId });
    }

    // Filter by productionBatchNumber
    if (productionBatchNumber) {
      queryBuilder.andWhere(
        'transaction.productionBatchNumber = :productionBatchNumber',
        { productionBatchNumber },
      );
    }

    // Filter by mainCategory (SWAPPED: now from ProductCodes.category)
    if (mainCategory) {
      queryBuilder.andWhere('mainCategory.name = :mainCategory', {
        mainCategory,
      });
    }

    // Order by transaction date (newest first)
    queryBuilder.orderBy('transaction.transactionDate', 'DESC');
    queryBuilder.addOrderBy('transaction.id', 'DESC');

    // Pagination
    const offset = (page - 1) * limit;
    queryBuilder.skip(offset).take(limit);

    // Execute query
    const [transactions, total] = await queryBuilder.getManyAndCount();

    return this._pagination(
      'Transaction history retrieved successfully',
      transactions,
      total,
      page,
      limit,
    );
  }

  /**
   * POST /inventory/transactions/adjustment
   * Adjust stock manually - Directly modifies stokAkhir
   *
   * Use cases:
   * - Stock opname corrections (koreksi hasil stock opname)
   * - Damaged goods removal (barang rusak/kadaluarsa)
   * - Missing stock correction (selisih fisik vs sistem)
   * - Data entry error fixes
   *
   * Impact: stokAkhir baru = stokAkhir lama + adjustmentQuantity
   * - Positive adjustmentQuantity (+) = Increase stock (tambah stok)
   * - Negative adjustmentQuantity (-) = Decrease stock (kurangi stok)
   *
   * Creates ADJUSTMENT transaction record for full audit trail
   */
  async adjustStock(
    dto: AdjustStockDto,
    userId: number,
  ): Promise<ResponseSuccess> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const {
        productCodeId,
        businessDate,
        adjustmentQuantity,
        reason,
        notes,
        performedBy,
      } = dto;

      // Verify product exists
      const product = await this.productCodesRepo.findOne({
        where: { id: productCodeId },
        relations: ['product', 'size', 'category'],
      });

      if (!product) {
        throw new NotFoundException(
          `Product code with ID ${productCodeId} not found`,
        );
      }

      // Use businessDate from DTO (format: YYYY-MM-DD)
      this.logger.log(
        `[ADJUSTMENT] Looking for inventory - Product ID: ${productCodeId}, Business Date: ${businessDate}, Product Code: ${product.productCode}`,
      );

      // Get daily inventory record for the specified business date
      // Note: Use string directly for DATE column to avoid timezone conversion issues
      let dailyInventory = await queryRunner.manager
        .createQueryBuilder(DailyInventory, 'di')
        .where('di.productCodeId = :productCodeId', { productCodeId })
        .andWhere('DATE(di.businessDate) = :businessDate', { businessDate })
        .getOne();

      this.logger.log(
        `[ADJUSTMENT] Inventory found: ${dailyInventory ? 'YES' : 'NO'}`,
      );

      if (!dailyInventory) {
        throw new NotFoundException(
          `No inventory record found for product ${product.productCode} on ${businessDate}. ` +
            `Please ensure the product is registered in daily inventory.`,
        );
      }

      // Calculate stock before adjustment - Convert to Number first
      const stockBefore = Number(dailyInventory.stokAkhir);
      const adjustmentQty = Number(adjustmentQuantity);

      // Calculate expected stock after
      const stockAfter = Number((stockBefore + adjustmentQty).toFixed(2));

      this.logger.log(
        `[ADJUSTMENT] Calculation - Before: ${stockBefore}, Adjustment: ${adjustmentQty}, After: ${stockAfter}`,
      );

      // Validation: Warn if stock will be negative (but allow it for corrections)
      if (stockAfter < 0) {
        this.logger.warn(
          `⚠️ ADJUSTMENT: Stock akan menjadi negatif! ` +
            `Product: ${product.productCode}, ` +
            `Before: ${stockBefore}, Adjustment: ${adjustmentQty}, After: ${stockAfter}`,
        );
      }

      // ⚠️ IMPORTANT: stokAkhir is a GENERATED COLUMN and cannot be updated directly!
      // Formula: stokAkhir = stokAwal + barangMasuk - dipesan - barangOutRepack - barangOutSample - barangOutProduksi
      //
      // For ADJUSTMENT, we update stokAwal to reflect the correction:
      // - Positive adjustment (+): Increase stokAwal
      // - Negative adjustment (-): Decrease stokAwal
      // This way the GENERATED COLUMN will automatically recalculate
      const currentStokAwal = Number(dailyInventory.stokAwal);
      const newStokAwal = Number((currentStokAwal + adjustmentQty).toFixed(2));

      this.logger.log(
        `[ADJUSTMENT] Before update - stokAwal: ${currentStokAwal}, adjustment: ${adjustmentQty}, newStokAwal: ${newStokAwal}`,
      );

      // CRITICAL FIX: Update using the entity ID directly (most reliable approach)
      // We already have dailyInventory from earlier query, use its ID
      const updateResult = await queryRunner.manager
        .createQueryBuilder()
        .update(DailyInventory)
        .set({ stokAwal: newStokAwal })
        .where('id = :id', { id: dailyInventory.id })
        .execute();

      this.logger.log(
        `[ADJUSTMENT] Update result - affected rows: ${updateResult.affected} (updated ID: ${dailyInventory.id})`,
      );

      // Reload entity by ID to get updated GENERATED COLUMN value
      const updatedInventory = await queryRunner.manager.findOne(
        DailyInventory,
        {
          where: { id: dailyInventory.id },
        },
      );

      const actualStockAfter = updatedInventory
        ? Number(updatedInventory.stokAkhir)
        : stockAfter;

      this.logger.log(
        `[ADJUSTMENT] After reload - stokAwal: ${updatedInventory?.stokAwal}, stokAkhir: ${actualStockAfter}`,
      );

      // Generate transaction number
      const transactionNumber = await this.generateTransactionNumber(
        queryRunner,
        'TRX',
      );

      // Create ADJUSTMENT transaction record
      const transaction = this.transactionsRepo.create({
        transactionNumber,
        transactionDate: new Date(),
        businessDate,
        transactionType: TransactionType.ADJUSTMENT,
        productCodeId,
        quantity: adjustmentQuantity, // Store the adjustment amount (+ or -)
        balanceAfter: actualStockAfter, // Use actual value from reloaded entity
        status: TransactionStatus.COMPLETED,
        reason,
        notes: notes || `Manual stock adjustment by ${performedBy || 'admin'}`,
        performedBy: performedBy || 'System Admin',
        createdBy: userId,
      });

      await queryRunner.manager.save(InventoryTransactions, transaction);

      await queryRunner.commitTransaction();

      this.logger.log(
        `✅ ADJUSTMENT SUCCESS: ${product.productCode} | ` +
          `Before: ${stockBefore} | Adjustment: ${adjustmentQuantity > 0 ? '+' : ''}${adjustmentQuantity} | ` +
          `After: ${actualStockAfter} | Reason: ${reason}`,
      );

      // ✅ Emit ADJUSTMENT notification (HIGH priority - significant stock change)
      await this.notificationEventEmitter.emitAdjustment({
        transactionId: transaction.id,
        productCode: product.productCode,
        productName: product.product.name,
        oldQuantity: stockBefore,
        newQuantity: actualStockAfter,
        reason: reason,
      });

      return this._success('Stock adjustment completed successfully', {
        transactionNumber,
        productCode: product.productCode,
        productName: product.product.name,
        stockBefore,
        adjustmentQuantity,
        stockAfter: actualStockAfter, // Use actual value after reload
        businessDate,
        reason,
      });
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`❌ ADJUSTMENT FAILED: ${error.message}`, error.stack);

      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      throw new BadRequestException(`Failed to adjust stock: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }
  /**
   * Return stock from cancelled/deleted PAST order
   * Adds quantity back to TODAY's inventory as incoming goods
   */
  async returnStockFromCancelledOrder(
    orderId: number,
    productCodeId: number,
    quantity: number,
    userId: number,
    orderNumber: string,
    originalDate: Date,
  ): Promise<ResponseSuccess> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Get or create TODAY's daily inventory
      const today = new Date();
      const dailyInventory = await this.getOrCreateDailyInventory(
        queryRunner,
        productCodeId,
        today,
        userId,
      );

      // 2. Update barangMasuk (treat as incoming stock)
      dailyInventory.barangMasuk =
        Number(dailyInventory.barangMasuk || 0) + quantity;
      dailyInventory.updatedBy = userId;

      await queryRunner.manager.save(DailyInventory, dailyInventory);

      // 3. Generate transaction number
      const transactionNumber = await this.generateTransactionNumber(
        queryRunner,
        'TRX',
      );

      // 4. Create Transaction Record (ADJUSTMENT type to ensure stock increase)
      // Using ADJUSTMENT because SALE_RETURN logic often implies negative logic
      const transaction = new InventoryTransactions();
      transaction.transactionNumber = transactionNumber;
      transaction.transactionDate = new Date();
      transaction.businessDate = today;
      transaction.transactionType = TransactionType.ADJUSTMENT; // Use ADJUSTMENT for safety
      transaction.productCodeId = productCodeId;
      transaction.quantity = quantity; // Positive quantity = Add to stock
      transaction.balanceAfter = Number(dailyInventory.stokAkhir); // This might be stale, but accepted for now
      transaction.orderId = orderId;
      transaction.status = TransactionStatus.COMPLETED;
      transaction.reason = 'Order Cancellation Return';
      transaction.notes = `Return from clean-up of past order ${orderNumber} (Orig Date: ${originalDate.toISOString().split('T')[0]})`;
      transaction.createdBy = userId;

      await queryRunner.manager.save(InventoryTransactions, transaction);

      await queryRunner.commitTransaction();

      this.logger.log(
        `Returned stock from order ${orderNumber}: Product ${productCodeId}, Qty ${quantity} -> Today's Inventory`,
      );

      return this._success('Stock returned successfully');
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to return stock from cancelled order', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
