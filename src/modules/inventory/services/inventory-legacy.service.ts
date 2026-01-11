import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner } from 'typeorm';
import { DailyInventory } from '../entity/daily-inventory.entity';
import {
  InventoryTransactions,
  TransactionType,
  TransactionStatus,
} from '../entity/inventory-transactions.entity';
import { ProductCodes } from '../../products/entity/product_codes.entity';
import BaseResponse from '../../../common/response/base.response';
import { ResponseSuccess } from '../../../common/interface/response.interface';
import { DailyInventoryService } from './daily-inventory.service';

/**
 * InventoryLegacyService
 *
 * Contains ONLY methods actively used by production-batch.service.ts:
 * 1. checkMaterialAvailability() - Pre-batch validation
 * 2. recordMaterialProduction() - Material consumption (batch start)
 * 3. recordFinishedGoodsProduction() - Record QC passed products
 *
 * ✅ FULLY MIGRATED: Now uses Daily Inventory System exclusively
 * - Removed dependency on legacy inventory table
 * - All operations use daily_inventory for stock tracking
 *
 * All other inventory operations should use:
 * - DailyInventoryService (for daily stock tracking)
 * - InventoryTransactionService (for transaction history)
 */
@Injectable()
export class InventoryLegacyService extends BaseResponse {
  private readonly logger = new Logger(InventoryLegacyService.name);

  constructor(
    @InjectRepository(DailyInventory)
    private readonly dailyInventoryRepo: Repository<DailyInventory>,
    @InjectRepository(InventoryTransactions)
    private readonly transactionRepo: Repository<InventoryTransactions>,
    @InjectRepository(ProductCodes)
    private readonly productCodesRepo: Repository<ProductCodes>,
    private readonly dailyInventoryService: DailyInventoryService,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  /**
   * Generate unique transaction number in format: TRX-YYYYMMDD-XXX
   * @param queryRunner - Active QueryRunner for transaction isolation (required for FOR UPDATE lock)
   * @param date - Optional date for the transaction number
   */
  private async generateTransactionNumber(
    queryRunner: QueryRunner,
    date?: Date,
  ): Promise<string> {
    const today = date || new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const pattern = `TRX-${dateStr}-%`;

    // Use raw SQL with FOR UPDATE to prevent duplicate transaction numbers
    const result = await queryRunner.query(
      `
      SELECT COALESCE(MAX(CAST(SUBSTRING(transactionNumber, -3) AS UNSIGNED)), 0) as maxSeq
      FROM inventory_transactions
      WHERE transactionNumber LIKE ?
        AND deletedAt IS NULL
      FOR UPDATE
      `,
      [pattern],
    );

    const maxSequence = result?.[0]?.maxSeq
      ? parseInt(result[0].maxSeq, 10)
      : 0;
    const sequence = maxSequence + 1;

    return `TRX-${dateStr}-${sequence.toString().padStart(3, '0')}`;
  }

  /**
   * Check if materials are available for production batch
   * Validates stock availability for all materials needed
   *
   * Used by: production-batch.service.ts (line 155)
   *
   * ✅ MIGRATED: Now uses daily_inventory.stokAkhir instead of legacy inventory table
   *
   * @param materials Array of { productCodeId, quantity }
   * @param date Optional date for backdate validation (YYYY-MM-DD)
   * @returns { available: boolean, insufficientMaterials: [] }
   */
  async checkMaterialAvailability(
    materials: Array<{ productCodeId: number; quantity: number }>,
    date?: string,
  ): Promise<{
    available: boolean;
    insufficientMaterials: Array<{
      productCodeId: number;
      productCode: string;
      productName: string;
      required: number;
      available: number;
      shortage: number;
    }>;
  }> {
    const insufficientMaterials = [];
    const today = new Date();
    const businessDate = date || today.toISOString().split('T')[0];

    for (const material of materials) {
      // Get daily inventory for target date
      const dailyInventory = await this.dailyInventoryRepo.findOne({
        where: {
          productCodeId: material.productCodeId,
          businessDate: businessDate as any,
        },
      });

      // Get product info for error messages
      const productCode = await this.productCodesRepo.findOne({
        where: { id: material.productCodeId },
        relations: ['product'],
      });

      if (!dailyInventory) {
        // No daily inventory record = out of stock
        insufficientMaterials.push({
          productCodeId: material.productCodeId,
          productCode: productCode?.productCode || 'Unknown',
          productName: productCode?.product?.name || 'Unknown',
          required: material.quantity,
          available: 0,
          shortage: material.quantity,
        });
        continue;
      }

      const available = Number(dailyInventory.stokAkhir || 0);
      const required = Number(material.quantity);

      if (available < required) {
        insufficientMaterials.push({
          productCodeId: material.productCodeId,
          productCode: productCode?.productCode || 'Unknown',
          productName: productCode?.product?.name || 'Unknown',
          required,
          available,
          shortage: required - available,
        });
      }
    }

    return {
      available: insufficientMaterials.length === 0,
      insufficientMaterials,
    };
  }

  /**
   * Record material consumption for production
   * Creates PRODUCTION_MATERIAL_OUT transactions for each material
   * Updates daily_inventory.barangOutProduksi
   *
   * Used by: production-batch.service.ts (line 348)
   *
   * ✅ MIGRATED: Fully uses Daily Inventory System
   * - Auto-creates daily_inventory record if missing
   * - Updates barangOutProduksi column
   * - Removed legacy inventory table dependency
   *
   * @param batchNumber Production batch number
   * @param materials Array of materials consumed
   * @param userId User performing the action
   * @param productionDate Date of production (backdate support)
   */
  async recordMaterialProduction(
    batchNumber: string,
    materials: Array<{
      productCodeId: number;
      quantity: number;
      unit?: string;
    }>,
    userId: number,
    performedBy?: string,
    notes?: string,
    productionDate?: Date,
  ): Promise<ResponseSuccess> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const transactions = [];
      const today = new Date();
      const dateObj = productionDate ? new Date(productionDate) : today;
      // Validate if date is valid
      if (isNaN(dateObj.getTime())) {
        throw new BadRequestException('Invalid production date');
      }
      const businessDate = dateObj.toISOString().split('T')[0];

      for (const material of materials) {
        // 1. Get product info first
        const productCode = await this.productCodesRepo.findOne({
          where: { id: material.productCodeId },
          relations: ['product', 'size'],
        });

        if (!productCode) {
          throw new NotFoundException(
            `Product code dengan ID ${material.productCodeId} tidak ditemukan`,
          );
        }

        // 2. Delegate to DailyInventoryService for update with propagation
        // Updates barangOutProduksi and correctly propagates negative stock change to future days
        const dailyInventory =
          await this.dailyInventoryService.updateStockWithPropagation(
            material.productCodeId,
            material.quantity, // Positive qty to increment barangOutProduksi
            {
              businessDate,
              userId,
              column: 'barangOutProduksi',
            },
            queryRunner.manager, // Pass manager for transaction context
          );

        // 3. Generate transaction number (using queryRunner for locking)
        const transactionNumber = await this.generateTransactionNumber(
          queryRunner,
          dateObj,
        );

        // 4. Create Transaction Record
        const transaction = queryRunner.manager.create(InventoryTransactions, {
          transactionNumber,
          transactionDate: dateObj,
          businessDate: businessDate,
          transactionType: TransactionType.PRODUCTION_MATERIAL_OUT,
          productCodeId: material.productCodeId,
          quantity: -material.quantity, // Negative for OUT
          productionBatchNumber: batchNumber,
          notes: notes || `Material untuk batch ${batchNumber}`,
          performedBy: performedBy || undefined,
          balanceAfter: Number(dailyInventory.stokAkhir) - material.quantity, // Approx
          status: TransactionStatus.COMPLETED,
          createdBy: { id: userId } as any,
        });

        await queryRunner.manager.save(InventoryTransactions, transaction);
        transactions.push(transaction);

        this.logger.log(
          `Material ${productCode.productCode} consumed: ${material.quantity} ${material.unit || ''} for batch ${batchNumber} on ${businessDate}`,
        );
      }

      await queryRunner.commitTransaction();

      return this._success('Material produksi berhasil dicatat', {
        batchNumber,
        transactionCount: transactions.length,
        transactions,
      });
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to record material production', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
  /**
   * Record finished goods from production (called after QC)
   * Creates PRODUCTION_IN transaction for passed QC quantity
   * Links to production batch
   *
   * Used by: production-batch.service.ts (line 564)
   *
   * ✅ MIGRATED: Now updates daily_inventory.barangMasuk instead of legacy inventory
   *
   * @param productCodeId Finished product code ID
   * @param quantity Quantity that passed QC
   * @param batchNumber Production batch number
   * @param userId User performing the action
   */
  async recordFinishedGoodsProduction(
    productCodeId: number,
    quantity: number,
    batchNumber: string,
    userId: number,
    performedBy?: string,
    notes?: string,
    productionDate?: Date,
  ): Promise<ResponseSuccess> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Validate product exists
      const productCode = await this.productCodesRepo.findOne({
        where: { id: productCodeId },
        relations: ['product'],
      });

      if (!productCode) {
        throw new NotFoundException(
          `Product code dengan ID ${productCodeId} tidak ditemukan`,
        );
      }

      // Get/create daily inventory for target date
      const today = new Date();
      const dateObj = productionDate ? new Date(productionDate) : today;
      if (isNaN(dateObj.getTime())) {
        throw new BadRequestException('Invalid production date');
      }
      const businessDate = dateObj.toISOString().split('T')[0];

      // 2. Delegate to DailyInventoryService for update with propagation
      // Updates barangMasuk and correctly propagates positive stock change
      const dailyInventory =
        await this.dailyInventoryService.updateStockWithPropagation(
          productCodeId,
          quantity,
          {
            businessDate,
            userId,
            column: 'barangMasuk',
          },
          queryRunner.manager, // Pass manager for transaction context
        );

      const currentStokAkhir = Number(dailyInventory.stokAkhir || 0);

      // Generate transaction number (using queryRunner for locking)
      const transactionNumber = await this.generateTransactionNumber(
        queryRunner,
        dateObj,
      );

      // Create PRODUCTION_IN transaction
      const transaction = queryRunner.manager.create(InventoryTransactions, {
        transactionNumber,
        transactionDate: dateObj,
        businessDate: businessDate, // Business date for daily inventory tracking
        transactionType: TransactionType.PRODUCTION_IN,
        productCodeId,
        quantity,
        productionBatchNumber: batchNumber,
        notes: notes || `Hasil produksi batch ${batchNumber} (QC PASS)`,
        performedBy: performedBy || undefined,
        balanceAfter: currentStokAkhir + quantity, // Approx
        status: TransactionStatus.COMPLETED,
        createdBy: { id: userId } as any,
      });

      const savedTransaction = await queryRunner.manager.save(
        InventoryTransactions,
        transaction,
      );

      // Refresh dailyInventory to get calculated stokAkhir
      const updatedDailyInventory = await queryRunner.manager.findOne(
        DailyInventory,
        {
          where: { id: dailyInventory.id },
        },
      );

      await queryRunner.commitTransaction();

      this.logger.log(
        `Finished goods ${productCode.productCode} recorded: ${quantity} units from batch ${batchNumber} on ${businessDate}`,
      );

      return this._success('Barang jadi berhasil dicatat ke inventory', {
        transaction: savedTransaction,
        dailyInventory: updatedDailyInventory,
      });
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to record finished goods production', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Format date to YYYY-MM-DD for business date
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
