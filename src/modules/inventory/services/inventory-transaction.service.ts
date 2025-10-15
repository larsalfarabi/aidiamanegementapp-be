import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
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
import {
  RecordSaleDto,
  RecordRepackingDto,
  RecordSampleDto,
  ReturnSampleDto,
} from '../dto/record-transaction.dto';

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
      const balanceBefore =
        dailyInventory.stokAwal +
        dailyInventory.barangMasuk -
        dailyInventory.dipesan -
        dailyInventory.barangOutRepack -
        dailyInventory.barangOutSample;

      // Update daily inventory: increment barangMasuk
      dailyInventory.barangMasuk += dto.quantity;
      dailyInventory.updatedBy = userId;
      await queryRunner.manager.save(DailyInventory, dailyInventory);

      // Calculate balance after
      const balanceAfter = balanceBefore + dto.quantity;

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
      transaction.balanceAfter = balanceAfter;
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
          relations: ['productCode', 'productCode.productId'],
        },
      );

      await queryRunner.commitTransaction();

      this.logger.log(
        `Production recorded: Product ${dto.productCodeId}, Qty ${dto.quantity}, Batch ${dto.productionBatchNumber}`,
      );

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
   * POST /inventory/transactions/sale
   * Record sale/order fulfillment
   * Updates: daily_inventory.dipesan++
   * Creates: inventory_transactions with SALE type
   */
  async recordSale(
    dto: RecordSaleDto,
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
      const dailyInventory = await this.getOrCreateDailyInventory(
        queryRunner,
        dto.productCodeId,
        todayDate,
        userId,
      );

      // Calculate current stock
      const currentStock =
        dailyInventory.stokAwal +
        dailyInventory.barangMasuk -
        dailyInventory.dipesan -
        dailyInventory.barangOutRepack -
        dailyInventory.barangOutSample;

      // Check stock availability
      if (currentStock < dto.quantity) {
        throw new BadRequestException(
          `Insufficient stock for product ${dto.productCodeId}. Available: ${currentStock}, Requested: ${dto.quantity}`,
        );
      }

      // Update daily inventory: increment dipesan
      dailyInventory.dipesan += dto.quantity;
      dailyInventory.updatedBy = userId;
      await queryRunner.manager.save(DailyInventory, dailyInventory);

      // Calculate balance after
      const balanceAfter = currentStock - dto.quantity;

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
      transaction.transactionType = TransactionType.SALE;
      transaction.productCodeId = dto.productCodeId;
      transaction.quantity = dto.quantity;
      transaction.balanceAfter = balanceAfter;
      if (dto.orderId) {
        transaction.orderId = dto.orderId;
      }
      transaction.status = TransactionStatus.COMPLETED;
      transaction.notes =
        dto.notes || `Sale${dto.customerName ? ` to ${dto.customerName}` : ''}`;
      transaction.createdBy = userId;

      const savedTransaction = await queryRunner.manager.save(transaction);

      // Reload inventory
      const updatedInventory = await queryRunner.manager.findOne(
        DailyInventory,
        {
          where: { id: dailyInventory.id },
          relations: ['productCode', 'productCode.productId'],
        },
      );

      await queryRunner.commitTransaction();

      this.logger.log(
        `Sale recorded: Product ${dto.productCodeId}, Qty ${dto.quantity}${dto.orderId ? `, Order ${dto.orderId}` : ''}`,
      );

      return this._success('Sale recorded successfully', {
        dailyInventory: updatedInventory,
        transaction: savedTransaction,
      });
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to record sale', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
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

      const today = this.formatDate(new Date());
      const todayDate = new Date(today);

      // Get today's daily inventory
      const dailyInventory = await queryRunner.manager.findOne(DailyInventory, {
        where: {
          productCodeId: productCodeId,
          businessDate: todayDate,
        },
      });

      if (!dailyInventory) {
        throw new NotFoundException(
          `Daily inventory for product ${productCodeId} not found for today`,
        );
      }

      // Check if dipesan is sufficient
      if (dailyInventory.dipesan < quantity) {
        throw new BadRequestException(
          `Cannot reverse sale. Current dipesan (${dailyInventory.dipesan}) is less than quantity (${quantity})`,
        );
      }

      // Update daily inventory: decrement dipesan
      dailyInventory.dipesan -= quantity;
      dailyInventory.updatedBy = userId;
      await queryRunner.manager.save(DailyInventory, dailyInventory);

      // Calculate balance after
      const currentStock =
        dailyInventory.stokAwal +
        dailyInventory.barangMasuk -
        dailyInventory.dipesan -
        dailyInventory.barangOutRepack -
        dailyInventory.barangOutSample;

      // Generate transaction number
      const transactionNumber = await this.generateTransactionNumber(
        queryRunner,
        'TRX',
      );

      // Create reversal transaction record
      const transaction = new InventoryTransactions();
      transaction.transactionNumber = transactionNumber;
      transaction.transactionDate = new Date();
      transaction.businessDate = todayDate;
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
          relations: ['productCode', 'productCode.productId'],
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
      const sourceStock =
        sourceInventory.stokAwal +
        sourceInventory.barangMasuk -
        sourceInventory.dipesan -
        sourceInventory.barangOutRepack -
        sourceInventory.barangOutSample;

      if (sourceStock < dto.sourceQuantity) {
        throw new BadRequestException(
          `Insufficient stock for source product ${dto.sourceProductCodeId}. Available: ${sourceStock}, Requested: ${dto.sourceQuantity}`,
        );
      }

      // Update source inventory: increment barangOutRepack
      sourceInventory.barangOutRepack += dto.sourceQuantity;
      sourceInventory.updatedBy = userId;
      await queryRunner.manager.save(DailyInventory, sourceInventory);

      // Update target inventory: increment barangMasuk
      targetInventory.barangMasuk += dto.targetQuantity;
      targetInventory.updatedBy = userId;
      await queryRunner.manager.save(DailyInventory, targetInventory);

      // Create repacking record
      const repackingNumber = await this.generateTransactionNumber(
        queryRunner,
        'RPK',
      );

      const repackingRecord = new RepackingRecords();
      repackingRecord.repackingNumber = repackingNumber;
      repackingRecord.repackingDate = new Date();
      repackingRecord.businessDate = todayDate;
      repackingRecord.sourceProductCodeId = dto.sourceProductCodeId;
      repackingRecord.targetProductCodeId = dto.targetProductCodeId;
      repackingRecord.sourceQuantity = dto.sourceQuantity;
      repackingRecord.targetQuantity = dto.targetQuantity;
      if (dto.reason) {
        repackingRecord.reason = dto.reason;
      }
      if (dto.performedBy) {
        repackingRecord.performedBy = dto.performedBy;
      }
      repackingRecord.status = RepackingStatus.COMPLETED;
      repackingRecord.createdBy = userId;

      const savedRepacking = await queryRunner.manager.save(repackingRecord);

      // Calculate balances
      const sourceBalanceAfter = sourceStock - dto.sourceQuantity;
      const targetStock =
        targetInventory.stokAwal +
        (targetInventory.barangMasuk - dto.targetQuantity) + // Subtract what we just added
        -targetInventory.dipesan -
        targetInventory.barangOutRepack -
        targetInventory.barangOutSample;
      const targetBalanceAfter = targetStock + dto.targetQuantity;

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
      sourceTransaction.balanceAfter = sourceBalanceAfter;
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

      // Create target transaction (IN)
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
      targetTransaction.balanceAfter = targetBalanceAfter;
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

      await queryRunner.manager.save([sourceTransaction, targetTransaction]);

      // Reload both inventories
      const [updatedSource, updatedTarget] = await Promise.all([
        queryRunner.manager.findOne(DailyInventory, {
          where: { id: sourceInventory.id },
          relations: ['productCode', 'productCode.productId'],
        }),
        queryRunner.manager.findOne(DailyInventory, {
          where: { id: targetInventory.id },
          relations: ['productCode', 'productCode.productId'],
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
      const currentStock =
        dailyInventory.stokAwal +
        dailyInventory.barangMasuk -
        dailyInventory.dipesan -
        dailyInventory.barangOutRepack -
        dailyInventory.barangOutSample;

      if (currentStock < dto.quantity) {
        throw new BadRequestException(
          `Insufficient stock for product ${dto.productCodeId}. Available: ${currentStock}, Requested: ${dto.quantity}`,
        );
      }

      // Update daily inventory: increment barangOutSample
      dailyInventory.barangOutSample += dto.quantity;
      dailyInventory.updatedBy = userId;
      await queryRunner.manager.save(DailyInventory, dailyInventory);

      // Calculate balance
      const balanceAfter = currentStock - dto.quantity;

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
      transaction.balanceAfter = balanceAfter;
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
          relations: ['productCode', 'productCode.productId'],
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

        const currentStock =
          dailyInventory.stokAwal +
          dailyInventory.barangMasuk -
          dailyInventory.dipesan -
          dailyInventory.barangOutRepack -
          dailyInventory.barangOutSample;

        // Update inventory
        dailyInventory.barangMasuk += returnedQty;
        dailyInventory.updatedBy = userId;
        await queryRunner.manager.save(DailyInventory, dailyInventory);

        const balanceAfter = currentStock + returnedQty;

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
        transaction.balanceAfter = balanceAfter;
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
          relations: ['productCode', 'productCode.productId'],
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
    let inventory = await queryRunner.manager.findOne(DailyInventory, {
      where: {
        productCodeId,
        businessDate,
      },
    });

    if (!inventory) {
      this.logger.warn(
        `Creating missing daily inventory for product ${productCodeId} on ${this.formatDate(businessDate)}`,
      );

      // Get yesterday's stokAkhir for stokAwal
      const yesterday = new Date(businessDate);
      yesterday.setDate(yesterday.getDate() - 1);

      const yesterdayRecord = await queryRunner.manager.findOne(
        DailyInventory,
        {
          where: {
            productCodeId,
            businessDate: yesterday,
          },
        },
      );

      inventory = queryRunner.manager.create(DailyInventory, {
        productCodeId,
        businessDate: this.formatDate(businessDate),
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
   */
  private async generateTransactionNumber(
    queryRunner: any,
    prefix: 'TRX' | 'SMP' | 'RPK',
  ): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');

    // Get count of transactions today with this prefix
    let count = 0;

    if (prefix === 'TRX') {
      count = await queryRunner.manager.count(InventoryTransactions, {
        where: {
          transactionDate: new Date(this.formatDate(today)),
        },
      });
    } else if (prefix === 'SMP') {
      count = await queryRunner.manager.count(SampleTracking, {
        where: {
          sampleDate: new Date(this.formatDate(today)),
        },
      });
    } else if (prefix === 'RPK') {
      count = await queryRunner.manager.count(RepackingRecords, {
        where: {
          repackDate: new Date(this.formatDate(today)),
        },
      });
    }

    const sequence = String(count + 1).padStart(3, '0');
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
      .leftJoinAndSelect('sourceProduct.productId', 'sourceProductInfo')
      .leftJoinAndSelect('sourceProduct.sizeId', 'sourceSize')
      .leftJoinAndSelect('repacking.targetProductCode', 'targetProduct')
      .leftJoinAndSelect('targetProduct.productId', 'targetProductInfo')
      .leftJoinAndSelect('targetProduct.sizeId', 'targetSize')
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
        'sourceProductCode.productId',
        'sourceProductCode.sizeId',
        'targetProductCode',
        'targetProductCode.productId',
        'targetProductCode.sizeId',
      ],
    });

    if (!repacking) {
      throw new NotFoundException(`Repacking record ${id} not found`);
    }

    // Get associated transactions
    const transactions = await this.transactionsRepo.find({
      where: { repackingId: id },
      relations: ['productCode', 'productCode.productId'],
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
      .leftJoinAndSelect('sourceProduct.productId', 'sourceProductInfo')
      .leftJoinAndSelect('repacking.targetProductCode', 'targetProduct')
      .leftJoinAndSelect('targetProduct.productId', 'targetProductInfo')
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
      .leftJoinAndSelect('product.productId', 'productInfo')
      .leftJoinAndSelect('product.sizeId', 'size')
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
        'productCode.productId',
        'productCode.sizeId',
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
      relations: ['productCode', 'productCode.productId', 'productCode.sizeId'],
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
      .leftJoinAndSelect('product.productId', 'productInfo')
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
      relations: ['productCode', 'productCode.productId'],
      order: { sampleDate: 'DESC' },
      take: 50,
    });

    return this._success(
      'Sample history for product retrieved successfully',
      samples,
    );
  }
}
