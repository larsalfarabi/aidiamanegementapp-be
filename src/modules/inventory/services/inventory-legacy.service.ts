import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DailyInventory } from '../entity/daily-inventory.entity';
import {
  InventoryTransactions,
  TransactionType,
  TransactionStatus,
} from '../entity/inventory-transactions.entity';
import { ProductCodes } from '../../products/entity/product_codes.entity';
import BaseResponse from '../../../common/response/base.response';
import { ResponseSuccess } from '../../../common/interface/response.interface';

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

  // ==================== ACTIVE METHODS (PRODUCTION MODULE) ====================

  /**
   * Check if materials are available for production batch
   * Validates stock availability for all materials needed
   *
   * Used by: production-batch.service.ts (line 155)
   *
   * ✅ MIGRATED: Now uses daily_inventory.stokAkhir instead of legacy inventory table
   *
   * @param materials Array of { productCodeId, quantity }
   * @returns { available: boolean, insufficientMaterials: [] }
   */
  async checkMaterialAvailability(
    materials: Array<{ productCodeId: number; quantity: number }>,
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
    const businessDate = today.toISOString().split('T')[0];

    for (const material of materials) {
      // Get daily inventory for today
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
  ): Promise<ResponseSuccess> {
    const transactions = [];

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

      // 2. Check/create daily_inventory record
      const today = new Date();
      const businessDate = today.toISOString().split('T')[0];

      let dailyInventory = await this.dailyInventoryRepo.findOne({
        where: {
          productCodeId: material.productCodeId,
          businessDate: businessDate as any,
        },
      });

      // Auto-create if missing
      if (!dailyInventory) {
        this.logger.warn(
          `Creating missing daily inventory for product ${material.productCodeId} on ${businessDate}`,
        );

        dailyInventory = this.dailyInventoryRepo.create({
          productCodeId: material.productCodeId,
          businessDate: businessDate as any,
          stokAwal: 0,
          barangMasuk: 0,
          dipesan: 0,
          barangOutRepack: 0,
          barangOutSample: 0,
          barangOutProduksi: 0,
          minimumStock: 0,
          maximumStock: 0,
          isActive: true,
          createdBy: userId,
        });

        dailyInventory = await this.dailyInventoryRepo.save(dailyInventory);
      }

      // 3. Validate stock availability from daily_inventory
      const availableStock = Number(dailyInventory.stokAkhir || 0);

      if (availableStock < material.quantity) {
        throw new BadRequestException(
          `Stock tidak cukup untuk ${productCode.productCode}. Tersedia: ${availableStock}, Dibutuhkan: ${material.quantity}`,
        );
      }

      // 4. Create PRODUCTION_MATERIAL_OUT transaction
      const transaction = this.transactionRepo.create({
        transactionNumber: await this.generateTransactionNumber(),
        transactionDate: new Date(),
        businessDate: this.formatDate(new Date()), // Business date for daily inventory tracking
        transactionType: TransactionType.PRODUCTION_MATERIAL_OUT,
        productCodeId: material.productCodeId,
        quantity: -material.quantity, // Negative for OUT
        productionBatchNumber: batchNumber,
        notes: notes || `Material untuk batch ${batchNumber}`,
        performedBy: performedBy || undefined,
        balanceAfter: availableStock - material.quantity,
        status: TransactionStatus.COMPLETED,
        createdBy: { id: userId } as any,
      });

      await this.transactionRepo.save(transaction);
      transactions.push(transaction);

      // 5. Update daily_inventory (increment barangOutProduksi)
      const currentBarangOutProduksi = Number(
        dailyInventory.barangOutProduksi ?? 0,
      );
      dailyInventory.barangOutProduksi =
        currentBarangOutProduksi + material.quantity;
      dailyInventory.updatedBy = userId;

      await this.dailyInventoryRepo.save(dailyInventory);

      this.logger.log(
        `Material ${productCode.productCode} consumed: ${material.quantity} ${material.unit || ''} for batch ${batchNumber}`,
      );
    }

    return this._success('Material produksi berhasil dicatat', {
      batchNumber,
      transactionCount: transactions.length,
      transactions,
    });
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
  ): Promise<ResponseSuccess> {
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

    // Get/create daily inventory for today
    const today = new Date();
    const businessDate = today.toISOString().split('T')[0];

    let dailyInventory = await this.dailyInventoryRepo.findOne({
      where: {
        productCodeId,
        businessDate: businessDate as any,
      },
    });

    // Auto-create if missing
    if (!dailyInventory) {
      this.logger.warn(
        `Creating missing daily inventory for finished goods ${productCodeId} on ${businessDate}`,
      );

      dailyInventory = this.dailyInventoryRepo.create({
        productCodeId,
        businessDate: businessDate as any,
        stokAwal: 0,
        barangMasuk: 0,
        dipesan: 0,
        barangOutRepack: 0,
        barangOutSample: 0,
        barangOutProduksi: 0,
        minimumStock: 0,
        maximumStock: 0,
        isActive: true,
        createdBy: userId,
      });

      dailyInventory = await this.dailyInventoryRepo.save(dailyInventory);
    }

    const currentStokAkhir = Number(dailyInventory.stokAkhir || 0);

    // Create PRODUCTION_IN transaction
    const transaction = this.transactionRepo.create({
      transactionNumber: await this.generateTransactionNumber(),
      transactionDate: new Date(),
      businessDate: this.formatDate(new Date()), // Business date for daily inventory tracking
      transactionType: TransactionType.PRODUCTION_IN,
      productCodeId,
      quantity,
      productionBatchNumber: batchNumber,
      notes: notes || `Hasil produksi batch ${batchNumber} (QC PASS)`,
      performedBy: performedBy || undefined,
      balanceAfter: currentStokAkhir + quantity,
      status: TransactionStatus.COMPLETED,
      createdBy: { id: userId } as any,
    });

    const savedTransaction = await this.transactionRepo.save(transaction);

    // Update daily_inventory (increment barangMasuk)
    const currentBarangMasuk = Number(dailyInventory.barangMasuk ?? 0);
    dailyInventory.barangMasuk = currentBarangMasuk + quantity;
    dailyInventory.updatedBy = userId;

    const updatedDailyInventory =
      await this.dailyInventoryRepo.save(dailyInventory);

    this.logger.log(
      `Finished goods ${productCode.productCode} recorded: ${quantity} units from batch ${batchNumber}`,
    );

    return this._success('Barang jadi berhasil dicatat ke inventory', {
      transaction: savedTransaction,
      dailyInventory: updatedDailyInventory,
    });
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
