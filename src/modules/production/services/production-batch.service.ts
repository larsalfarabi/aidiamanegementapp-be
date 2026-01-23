import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Between, In } from 'typeorm';
import BaseResponse from '../../../common/response/base.response';
import {
  ProductionBatches,
  ProductionFormulas,
  ProductionStageTracking,
  ProductionMaterialUsage,
  ProductionBottlingOutput,
  BatchStatus,
  QCStatus,
  ProductionStage,
  StageStatus,
} from '../entities';
import {
  CreateBatchDto,
  RecordStageDto,
  FilterBatchDto,
  CompleteBatchDto,
  CheckMaterialStockDto,
} from '../dto';
import { ProductionFormulaService } from './production-formula.service';
import { InventoryLegacyService } from '../../inventory/services/inventory-legacy.service';
import { ProductCodes } from '../../products/entity/product_codes.entity';
import { NotificationEventEmitter } from '../../notifications/services/notification-event-emitter.service';
import { getJakartaDateString } from '../../../common/utils/date.util';

@Injectable()
export class ProductionBatchService extends BaseResponse {
  private readonly logger = new Logger(ProductionBatchService.name);

  constructor(
    @InjectRepository(ProductionBatches)
    private readonly batchRepository: Repository<ProductionBatches>,
    @InjectRepository(ProductionFormulas)
    private readonly formulaRepository: Repository<ProductionFormulas>,
    @InjectRepository(ProductionStageTracking)
    private readonly stageRepository: Repository<ProductionStageTracking>,
    @InjectRepository(ProductionMaterialUsage)
    private readonly materialUsageRepository: Repository<ProductionMaterialUsage>,
    @InjectRepository(ProductionBottlingOutput)
    private readonly bottlingOutputRepository: Repository<ProductionBottlingOutput>,
    @InjectRepository(ProductCodes)
    private readonly productCodeRepository: Repository<ProductCodes>,
    private readonly dataSource: DataSource,
    private readonly productionFormulaService: ProductionFormulaService,
    private readonly inventoryService: InventoryLegacyService,
    private readonly notificationEventEmitter: NotificationEventEmitter,
  ) {
    super();
  }

  /**
   * Generate Batch Number
   * Format: BATCH-YYYYMMDD-XXX
   * Example: BATCH-20250111-001
   *
   * Uses MAX(sequence) to find the highest existing number for the date,
   * preventing duplicates even after batch deletion.
   * ✅ Uses getJakartaDateString for consistent Jakarta timezone
   */
  private async generateBatchNumber(productionDate: Date): Promise<string> {
    const dateStr = getJakartaDateString(productionDate).replace(/-/g, '');

    // Get today's batches to find max sequence number
    const startOfDay = new Date(productionDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(productionDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Find all batch numbers for this date
    const todayBatches = await this.batchRepository.find({
      where: {
        productionDate: Between(startOfDay, endOfDay),
      },
      select: ['batchNumber'],
    });

    // Extract sequence numbers and find the maximum
    let maxSequence = 0;
    const prefix = `BATCH-${dateStr}-`;

    for (const batch of todayBatches) {
      if (batch.batchNumber.startsWith(prefix)) {
        const sequenceStr = batch.batchNumber.substring(prefix.length);
        const sequence = parseInt(sequenceStr, 10);
        if (!isNaN(sequence) && sequence > maxSequence) {
          maxSequence = sequence;
        }
      }
    }

    // Next sequence is max + 1
    const nextSequence = (maxSequence + 1).toString().padStart(3, '0');
    return `BATCH-${dateStr}-${nextSequence}`;
  }

  /**
   * Check Material Stock Availability
   * Human-Centered Design: Proactive validation with clear, actionable feedback
   *
   * Purpose:
   * - Validate material availability before batch creation
   * - Provide detailed shortage information
   * - Block batch creation if materials insufficient
   *
   * Returns:
   * - isValid: Can proceed with batch creation
   * - shouldBlock: Should disable submit button
   * - items: Detailed stock status per material
   * - summary: Aggregated statistics
   */
  async checkMaterialStock(dto: CheckMaterialStockDto) {
    try {
      const productionDate = new Date(dto.productionDate);
      const businessDate = productionDate.toISOString().split('T')[0];

      // 1. Collect all material IDs
      const materialIds = dto.materials.map((m) => m.materialProductCodeId);

      // 2. Batch Fetch ProductCodes (Single Query)
      const productCodes = await this.productCodeRepository.find({
        where: { id: In(materialIds) },
        relations: ['product', 'product.category', 'size', 'category'],
      });

      // Map for O(1) access
      const productCodeMap = new Map(productCodes.map((pc) => [pc.id, pc]));

      // 3. Batch Fetch DailyInventory (Single Query)
      const dailyInventories = await this.dataSource
        .getRepository('DailyInventory')
        .find({
          where: {
            productCodeId: In(materialIds),
            businessDate: businessDate as any,
          },
        });

      // Map for O(1) access (Key: productCodeId)
      const inventoryMap = new Map(
        dailyInventories.map((inv: any) => [inv.productCodeId, inv]),
      );

      // 4. Process loop in memory
      const materialDetails = dto.materials.map((material) => {
        const productCode = productCodeMap.get(material.materialProductCodeId);

        // ProductCode tidak ditemukan
        if (!productCode) {
          throw new NotFoundException(
            `Material dengan ProductCode ID ${material.materialProductCodeId} tidak ditemukan. Formula mungkin menggunakan material yang telah dihapus dari database.`,
          );
        }

        // ProductCode dihapus/inaktif
        if (productCode.isDeleted || !productCode.isActive) {
          const status = productCode.isDeleted ? 'dihapus' : 'dinonaktifkan';
          throw new NotFoundException(
            `Material "${productCode.productCode}" telah ${status}. Silakan update formula atau aktifkan kembali material ini untuk melanjutkan produksi.`,
          );
        }

        // Get stock from map
        const dailyInventory = inventoryMap.get(material.materialProductCodeId);
        const availableStock = Number(dailyInventory?.stokAkhir || 0);
        const reservedStock = 0;
        const actualAvailable = Math.max(0, availableStock - reservedStock);
        const shortage = Math.max(
          0,
          material.plannedQuantity - actualAvailable,
        );

        // Determine stock status
        let stockStatus = 'SUFFICIENT';
        let isValid = true;

        if (actualAvailable === 0) {
          stockStatus = 'OUT_OF_STOCK';
          isValid = false;
        } else if (actualAvailable < material.plannedQuantity) {
          stockStatus = 'INSUFFICIENT';
          isValid = false;
        }

        const unit = productCode.size?.sizeValue || 'KG';

        return {
          materialProductCodeId: material.materialProductCodeId,
          materialCode: productCode.productCode,
          materialName: productCode.product.name,
          category: productCode.category?.name || 'Unknown',
          unit: unit,
          requestedQuantity: material.plannedQuantity,
          availableStock,
          reservedStock,
          actualAvailable,
          minimumStock: 0, // Not implemented yet
          stockStatus,
          isValid,
          shortage,
          message: isValid
            ? 'Stock tersedia'
            : `Kurang ${shortage.toFixed(3)} ${unit}`,
        };
      });

      // Calculate summary
      const summary = {
        totalMaterials: materialDetails.length,
        sufficientMaterials: materialDetails.filter(
          (m) => m.stockStatus === 'SUFFICIENT',
        ).length,
        lowStockMaterials: materialDetails.filter(
          (m) => m.stockStatus === 'LOW_STOCK',
        ).length,
        insufficientMaterials: materialDetails.filter(
          (m) => m.stockStatus === 'INSUFFICIENT',
        ).length,
        outOfStockMaterials: materialDetails.filter(
          (m) => m.stockStatus === 'OUT_OF_STOCK',
        ).length,
      };

      const isValid = materialDetails.every((m) => m.isValid);
      const shouldBlock = !isValid;

      let message = 'Semua material tersedia';
      if (shouldBlock) {
        const insufficientCount =
          summary.insufficientMaterials + summary.outOfStockMaterials;
        message = `${insufficientCount} material tidak tersedia dalam jumlah yang cukup`;
      } else if (summary.lowStockMaterials > 0) {
        message = `${summary.lowStockMaterials} material mendekati minimum stock`;
      }

      return this._success('Stock validation completed', {
        isValid,
        shouldBlock,
        productionDate: dto.productionDate,
        items: materialDetails,
        summary,
        message,
      });
    } catch (error) {
      this.logger.error('Error checking material stock:', error);
      throw error;
    }
  }

  /**
   * Create Production Batch
   *
   * New Workflow (Batch Formula System + Inventory Integration):
   * 1. Validate formula exists and is active
   * 2. Calculate material requirements based on targetLiters
   * 3. Check material stock availability (HUMAN-CENTERED: Early validation)
   * 4. Generate batch number
   * 5. Create batch record with status PLANNED
   * 6. Auto-create ProductionMaterialUsage records with planned quantities
   * 7. Initialize 3 stages (PRODUCTION, BOTTLING, QC) with PENDING status
   */
  async createBatch(dto: CreateBatchDto, userId: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Validate formula exists and is active
      const formula = await this.formulaRepository.findOne({
        where: { id: dto.formulaId },
        relations: ['productCode', 'product'],
      });

      if (!formula) {
        throw new NotFoundException(
          `Formula with ID ${dto.formulaId} not found`,
        );
      }

      if (!formula.isActive) {
        throw new BadRequestException(
          `Formula ${formula.formulaCode} is not active`,
        );
      }

      // Check if formula is valid for production date
      const productionDate = new Date(dto.productionDate);
      productionDate.setHours(0, 0, 0, 0);

      const effectiveFrom = new Date(formula.effectiveFrom);
      effectiveFrom.setHours(0, 0, 0, 0);

      if (productionDate < effectiveFrom) {
        throw new BadRequestException(
          `Formula ${formula.formulaCode} is not effective yet. Effective from: ${formula.effectiveFrom}`,
        );
      }

      if (formula.effectiveTo) {
        const effectiveTo = new Date(formula.effectiveTo);
        effectiveTo.setHours(0, 0, 0, 0);

        if (productionDate > effectiveTo) {
          throw new BadRequestException(
            `Formula ${formula.formulaCode} has expired. Expired on: ${formula.effectiveTo}`,
          );
        }
      }

      // 2. Calculate material requirements using formula ratios × targetLiters
      this.logger.log(
        `Calculating material requirements for formula ${formula.formulaCode}, target: ${dto.targetLiters}L`,
      );

      const calculatedMaterials =
        await this.productionFormulaService.calculateMaterialRequirements(
          dto.formulaId,
          dto.targetLiters,
        );

      this.logger.log(
        `Calculated ${calculatedMaterials.length} materials for batch`,
      );

      // 3. HUMAN-CENTERED: Check material stock availability before creating batch
      // This prevents creating batch that cannot be executed
      const materialStockCheck = calculatedMaterials.map((m) => ({
        productCodeId: m.materialProductCodeId,
        quantity: m.plannedQuantity,
      }));

      const stockAvailability =
        await this.inventoryService.checkMaterialAvailability(
          materialStockCheck,
          dto.productionDate, // ✅ Backdate support
        );

      if (!stockAvailability.available) {
        const shortageDetails = stockAvailability.insufficientMaterials
          .map(
            (m) =>
              `${m.productCode} (${m.productName}): Dibutuhkan ${m.required}, Tersedia ${m.available}, Kurang ${m.shortage}`,
          )
          .join('; ');

        // [ROLLED BACK] Emit notification disabled

        throw new BadRequestException(
          `Stock material tidak mencukupi untuk batch ini. Detail: ${shortageDetails}`,
        );
      }

      this.logger.log(`Stock availability check passed for batch creation`);

      // 4. Generate batch number
      const batchNumber = await this.generateBatchNumber(productionDate);

      // 5. Create batch with targetLiters as plannedQuantity
      const batch = this.batchRepository.create({
        batchNumber,
        productionDate,
        formulaId: formula.id,
        productId: formula.productId, // ✅ FIX: Get productId from formula
        productCodeId: formula.productCodeId,
        plannedQuantity: dto.targetLiters, // This is the "40L" in template
        plannedConcentrate: dto.targetLiters, // Same as target for concentrate
        actualConcentrate: 0,
        actualQuantity: 0,
        qcPassedQuantity: 0,
        qcFailedQuantity: 0,
        wasteQuantity: 0,
        wastePercentage: 0,
        qcStatus: QCStatus.PENDING,
        totalMaterialCost: 0,
        costPerUnit: 0,
        status: BatchStatus.PLANNED,
        startedAt: new Date(), // ✅ FIX: Set startedAt saat batch dibuat (untuk tracking kolom "Mulai")
        performedBy: null, // Will be set when production starts
        notes: dto.notes || null,
        createdBy: userId,
      });

      const [savedBatch] = await queryRunner.manager.save(ProductionBatches, [
        batch,
      ]);

      this.logger.log(`Batch created: ${batchNumber} with ID ${savedBatch.id}`);

      // 5. Create ProductionMaterialUsage records with planned quantities
      const materialUsageRecords = calculatedMaterials.map((material) =>
        this.materialUsageRepository.create({
          batchId: savedBatch.id,
          materialProductCodeId: material.materialProductCodeId,
          plannedQuantity: material.plannedQuantity, // Auto-calculated: formulaRatio × targetLiters
          actualQuantity: 0, // Will be filled during production
          wasteQuantity: 0,
          unit: material.unit,
          unitCost: material.standardUnitCost || 0,
          totalCost: 0,
          createdBy: userId,
        }),
      );

      await queryRunner.manager.save(
        ProductionMaterialUsage,
        materialUsageRecords,
      );

      this.logger.log(
        `Created ${materialUsageRecords.length} material usage records for batch ${batchNumber}`,
      );

      // 6. Initialize 3 stages (PENDING status)
      const stages = [
        {
          stage: ProductionStage.PRODUCTION,
          sequence: 1,
          outputUnit: 'LITERS',
        },
        {
          stage: ProductionStage.BOTTLING,
          sequence: 2,
          outputUnit: 'BOTTLES', // Default unit for bottling
        },
        {
          stage: ProductionStage.QC,
          sequence: 3,
          outputUnit: 'BOTTLES', // Default unit for QC
        },
      ].map((stageData) =>
        this.stageRepository.create({
          batchId: savedBatch.id,
          stage: stageData.stage,
          stageSequence: stageData.sequence,
          status: StageStatus.PENDING,
          outputQuantity: 0,
          outputUnit: stageData.outputUnit,
          wasteQuantity: 0,
          wasteUnit: stageData.outputUnit,
          createdBy: userId,
        }),
      );

      await queryRunner.manager.save(ProductionStageTracking, stages);

      await queryRunner.commitTransaction();

      // 7. Fetch complete batch with all relations for response
      const completeBatch = await this.batchRepository.findOne({
        where: { id: savedBatch.id },
        relations: [
          'formula',
          'formula.materials',
          'formula.materials.materialProductCode',
          'productCode',
          'productCode.product',
          'stages',
          'materialUsages', // Include auto-created material usage records
          'materialUsages.materialProductCode',
          'materialUsages.materialProductCode.product',
          'materialUsages.materialProductCode.category',
        ],
      });

      await queryRunner.release();

      this.logger.log(
        `Batch created successfully: ${batchNumber} for formula ${formula.formulaCode} (${dto.targetLiters}L) by user ${userId}`,
      );

      // ✅ Emit BATCH_CREATED notification
      this.notificationEventEmitter.emitBatchCreated({
        batchId: savedBatch.id,
        batchNumber: batchNumber,
        productName: formula.product.name,
        plannedQuantity: dto.targetLiters,
      });

      return this._success(
        'Production batch created successfully',
        completeBatch,
      );
    } catch (error) {
      // Only rollback if transaction is still active
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      await queryRunner.release();
      this.logger.error('Failed to create batch', error.stack);
      throw error;
    }
  }

  /**
   * Start Production Batch
   * Changes status from PLANNED to IN_PROGRESS
   * HUMAN-CENTERED: Deducts materials from inventory when production starts
   */
  async startBatch(batchId: number, userId: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const batch = await this.batchRepository.findOne({
        where: { id: batchId },
        relations: [
          'formula',
          'productCode',
          'stages',
          'materialUsages',
          'materialUsages.materialProductCode',
        ],
      });

      if (!batch) {
        throw new NotFoundException(`Batch with ID ${batchId} not found`);
      }

      if (batch.status !== BatchStatus.PLANNED) {
        throw new BadRequestException(
          `Cannot start batch ${batch.batchNumber}. Current status: ${batch.status}`,
        );
      }

      // INVENTORY INTEGRATION: Deduct materials when batch starts
      // This ensures material stock is reserved and tracked
      const materialsToDeduct = batch.materialUsages.map((usage) => ({
        productCodeId: usage.materialProductCodeId,
        quantity: Number(usage.plannedQuantity),
        unit: usage.unit,
      }));

      this.logger.log(
        `Deducting ${materialsToDeduct.length} materials for batch ${batch.batchNumber}`,
      );

      // Record material consumption in inventory
      await this.inventoryService.recordMaterialProduction(
        batch.batchNumber,
        materialsToDeduct,
        userId,
        batch.performedBy || undefined,
        `Material untuk batch ${batch.batchNumber}`,
        batch.productionDate, // ✅ Backdate support
      );

      this.logger.log(
        `Materials deducted successfully for batch ${batch.batchNumber}`,
      );

      batch.status = BatchStatus.IN_PROGRESS;
      batch.startedAt = new Date();
      batch.updatedBy = userId;

      // Update Stage 1 (PRODUCTION) to IN_PROGRESS
      const productionStage = batch.stages.find(
        (s) => s.stage === ProductionStage.PRODUCTION,
      );

      if (productionStage) {
        productionStage.status = StageStatus.IN_PROGRESS;
        productionStage.startTime = new Date();
        productionStage.updatedBy = userId;
        await queryRunner.manager.save(productionStage);
      }

      await queryRunner.manager.save(batch);
      await queryRunner.commitTransaction();

      this.logger.log(`Batch ${batch.batchNumber} started by user ${userId}`);

      const updatedBatch = await this.batchRepository.findOne({
        where: { id: batchId },
        relations: ['formula', 'productCode', 'stages'],
      });

      await queryRunner.release();

      return this._success(
        'Production batch started successfully',
        updatedBatch,
      );
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      await queryRunner.release();
      this.logger.error(`Failed to start batch ${batchId}`, error.stack);
      throw error;
    }
  }

  /**
   * Record Production Stage
   * Enforces sequence: PRODUCTION → BOTTLING → QC
   */
  async recordStage(batchId: number, dto: RecordStageDto, userId: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const batch = await this.batchRepository.findOne({
        where: { id: batchId },
        relations: ['formula', 'stages'],
      });

      if (!batch) {
        throw new NotFoundException(`Batch with ID ${batchId} not found`);
      }

      // Human-Centered Validation: Different status requirements per stage
      // PRODUCTION & BOTTLING: Must be IN_PROGRESS
      // QC: Must be QC_PENDING (auto-set after BOTTLING completed)
      if (dto.stage === ProductionStage.QC) {
        if (batch.status !== BatchStatus.QC_PENDING) {
          throw new BadRequestException(
            `Cannot record QC for batch ${batch.batchNumber}. Batch must be QC_PENDING. Current status: ${batch.status}. Please complete BOTTLING stage first.`,
          );
        }
      } else {
        // For PRODUCTION and BOTTLING stages
        if (batch.status !== BatchStatus.IN_PROGRESS) {
          throw new BadRequestException(
            `Cannot record ${dto.stage} stage for batch ${batch.batchNumber}. Batch must be IN_PROGRESS. Current status: ${batch.status}`,
          );
        }
      }

      // Find the stage to record
      const stage = batch.stages.find((s) => s.stage === dto.stage);

      if (!stage) {
        throw new NotFoundException(
          `Stage ${dto.stage} not found for batch ${batch.batchNumber}`,
        );
      }

      if (stage.status === StageStatus.COMPLETED) {
        throw new BadRequestException(
          `Stage ${dto.stage} is already completed`,
        );
      }

      // Enforce sequence: Check if previous stage is completed
      if (dto.stage === ProductionStage.BOTTLING) {
        const productionStage = batch.stages.find(
          (s) => s.stage === ProductionStage.PRODUCTION,
        );
        if (productionStage?.status !== StageStatus.COMPLETED) {
          throw new BadRequestException(
            'PRODUCTION stage must be completed before BOTTLING',
          );
        }
      }

      if (dto.stage === ProductionStage.QC) {
        const bottlingStage = batch.stages.find(
          (s) => s.stage === ProductionStage.BOTTLING,
        );
        if (bottlingStage?.status !== StageStatus.COMPLETED) {
          throw new BadRequestException(
            'BOTTLING stage must be completed before QC',
          );
        }
      }

      // Update stage
      stage.status = StageStatus.COMPLETED;
      stage.outputQuantity = dto.outputQuantity;
      stage.outputUnit = dto.outputUnit || stage.outputUnit;
      stage.wasteQuantity = dto.wasteQuantity || 0;
      stage.wasteUnit = dto.wasteUnit || stage.wasteUnit;
      stage.performedBy = dto.performedBy || null;
      stage.notes = dto.notes || null;
      stage.endTime = new Date();
      stage.updatedBy = userId;

      // QC specific fields
      if (dto.stage === ProductionStage.QC) {
        stage.qcPassedQty = dto.qcPassedQty || 0;
        stage.qcFailedQty = dto.qcFailedQty || 0;
      }

      await queryRunner.manager.save(stage);

      // Update batch based on stage
      if (dto.stage === ProductionStage.PRODUCTION) {
        batch.actualConcentrate = dto.outputQuantity;

        // Start next stage (BOTTLING)
        const bottlingStage = batch.stages.find(
          (s) => s.stage === ProductionStage.BOTTLING,
        );
        if (bottlingStage) {
          bottlingStage.status = StageStatus.IN_PROGRESS;
          bottlingStage.startTime = new Date();
          bottlingStage.updatedBy = userId;
          await queryRunner.manager.save(bottlingStage);
        }
      }

      if (dto.stage === ProductionStage.BOTTLING) {
        batch.actualQuantity = dto.outputQuantity;

        // Start next stage (QC)
        const qcStage = batch.stages.find(
          (s) => s.stage === ProductionStage.QC,
        );
        if (qcStage) {
          qcStage.status = StageStatus.IN_PROGRESS;
          qcStage.startTime = new Date();
          qcStage.updatedBy = userId;
          await queryRunner.manager.save(qcStage);
        }

        // Update batch status to QC_PENDING
        batch.status = BatchStatus.QC_PENDING;

        // ✅ Emit QC_PENDING notification (batch ready for quality control)
        // [ROLLED BACK] Emit notification disabled
      }

      if (dto.stage === ProductionStage.QC) {
        batch.qcPassedQuantity = dto.qcPassedQty || 0;
        batch.qcFailedQuantity = dto.qcFailedQty || 0;
        batch.qcDate = new Date();
        batch.qcPerformedBy = userId;
        batch.qcNotes = dto.notes || null;

        // Determine QC status
        const totalQC = batch.qcPassedQuantity + batch.qcFailedQuantity;
        if (batch.qcPassedQuantity === totalQC && totalQC > 0) {
          batch.qcStatus = QCStatus.PASS;
        } else if (batch.qcPassedQuantity === 0 && totalQC > 0) {
          batch.qcStatus = QCStatus.FAIL;
        } else {
          batch.qcStatus = QCStatus.PARTIAL;
        }

        // Human-Centered: Update batch status based on QC result
        // PASS or PARTIAL → COMPLETED (production selesai, ada output yang bisa digunakan)
        // FAIL → REJECTED (semua output ditolak)
        if (
          batch.qcStatus === QCStatus.PASS ||
          batch.qcStatus === QCStatus.PARTIAL
        ) {
          batch.status = BatchStatus.COMPLETED;
          batch.completedAt = new Date();

          // INVENTORY INTEGRATION: Add finished goods to inventory (QC PASS only)
          // Only add the quantity that passed QC to finished goods inventory
          // NOTE: For multi-size batches (productCodeId = null), inventory handled via bottlingOutputs
          if (batch.qcPassedQuantity > 0 && batch.productCodeId) {
            this.logger.log(
              `Adding ${batch.qcPassedQuantity} finished goods to inventory for batch ${batch.batchNumber}`,
            );

            await this.inventoryService.recordFinishedGoodsProduction(
              batch.productCodeId,
              batch.qcPassedQuantity,
              batch.batchNumber,
              userId,
              dto.performedBy || undefined,
              `Hasil produksi batch ${batch.batchNumber} - QC ${batch.qcStatus}`,
            );

            this.logger.log(
              `Finished goods added to inventory successfully for batch ${batch.batchNumber}`,
            );
          } else if (!batch.productCodeId) {
            this.logger.log(
              `Batch ${batch.batchNumber} is multi-size batch (productCodeId = null). Inventory will be recorded via bottling outputs.`,
            );
          }
        } else if (batch.qcStatus === QCStatus.FAIL) {
          batch.status = BatchStatus.REJECTED;
          batch.completedAt = new Date();

          this.logger.log(
            `Batch ${batch.batchNumber} rejected - no finished goods added to inventory`,
          );

          // ✅ Emit QC_FAILED notification (CRITICAL - batch rejected)
          // [ROLLED BACK] Emit notification disabled
        }

        // ✅ Emit QC_PASSED notification for successful QC (PASS or PARTIAL)
        if (
          batch.qcStatus === QCStatus.PASS ||
          batch.qcStatus === QCStatus.PARTIAL
        ) {
          // [ROLLED BACK] Emit notification disabled
        }

        // Calculate yield and waste
        if (batch.plannedQuantity > 0) {
          batch.wastePercentage = batch.calculateWaste();
          batch.wasteQuantity =
            Number(batch.plannedQuantity) - Number(batch.actualQuantity);
        }
      }

      batch.updatedBy = userId;
      await queryRunner.manager.save(batch);

      await queryRunner.commitTransaction();

      // Fetch updated batch
      const updatedBatch = await this.batchRepository.findOne({
        where: { id: batchId },
        relations: ['formula', 'productCode', 'stages'],
      });

      await queryRunner.release();

      this.logger.log(
        `Stage ${dto.stage} recorded for batch ${batch.batchNumber} by user ${userId}`,
      );

      return this._success(
        `Stage ${dto.stage} recorded successfully`,
        updatedBatch,
      );
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      await queryRunner.release();
      this.logger.error(
        `Failed to record stage for batch ${batchId}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get Batches with Filters
   */
  async getBatches(filterDto: FilterBatchDto) {
    try {
      const {
        page = 1,
        pageSize = 10,
        status,
        productCodeId,
        startDate,
        endDate,
        search,
        qcStatus,
      } = filterDto;
      const skip = (page - 1) * pageSize;

      const queryBuilder = this.batchRepository
        .createQueryBuilder('batch')
        // Optimasi: Hanya select kolom yang dibutuhkan untuk list view
        .select([
          'batch.id',
          'batch.batchNumber',
          'batch.productionDate',
          'batch.plannedQuantity',
          'batch.actualQuantity',
          'batch.status',
          'batch.startedAt',
          'batch.completedAt',
          'batch.createdAt', // Fix: Required for orderBy pagination
          // 'batch.qcStatus', // Uncomment if needed in list
        ])
        .leftJoin('batch.formula', 'formula')
        .addSelect(['formula.id', 'formula.formulaName'])
        .leftJoin('batch.product', 'product')
        .addSelect(['product.name', 'product.productType']) // Added productType per column usage
        .leftJoin('product.category', 'category')
        .addSelect(['category.name'])
        .orderBy('batch.productionDate', 'DESC')
        .addOrderBy('batch.createdAt', 'DESC');

      // Apply filters
      if (status) {
        queryBuilder.andWhere('batch.status = :status', { status });
      }

      if (productCodeId) {
        queryBuilder.andWhere('batch.productCodeId = :productCodeId', {
          productCodeId,
        });
      }

      if (startDate) {
        queryBuilder.andWhere('batch.productionDate >= :startDate', {
          startDate,
        });
      }

      if (endDate) {
        queryBuilder.andWhere('batch.productionDate <= :endDate', {
          endDate,
        });
      }

      if (search) {
        queryBuilder.andWhere('batch.batchNumber LIKE :search', {
          search: `%${search}%`,
        });
      }

      if (qcStatus) {
        queryBuilder.andWhere('batch.qcStatus = :qcStatus', { qcStatus });
      }

      const [batches, total] = await queryBuilder
        .skip(skip)
        .take(pageSize)
        .getManyAndCount();

      // Get statistics for ALL batches (not affected by pagination)
      const statsQuery = this.batchRepository
        .createQueryBuilder('batch')
        .select('batch.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('batch.status');

      const statsResult = await statsQuery.getRawMany();

      const statistics = {
        total: 0,
        planned: 0,
        inProgress: 0,
        completed: 0,
        cancelled: 0,
        draft: 0,
        qcPending: 0,
        rejected: 0,
      };

      statsResult.forEach((row) => {
        const count = parseInt(row.count, 10);
        statistics.total += count;

        switch (row.status) {
          case 'PLANNED':
            statistics.planned = count;
            break;
          case 'IN_PROGRESS':
            statistics.inProgress = count;
            break;
          case 'COMPLETED':
            statistics.completed = count;
            break;
          case 'CANCELLED':
            statistics.cancelled = count;
            break;
          case 'DRAFT':
            statistics.draft = count;
            break;
          case 'QC_PENDING':
            statistics.qcPending = count;
            break;
          case 'REJECTED':
            statistics.rejected = count;
            break;
        }
      });

      return {
        ...this._pagination(
          'Batches retrieved successfully',
          batches,
          total,
          page,
          pageSize,
        ),
        statistics,
      };
    } catch (error) {
      this.logger.error('Failed to get batches', error.stack);
      throw error;
    }
  }

  /**
   * Get Batch by ID
   */
  async getBatchById(id: number) {
    try {
      const batch = await this.batchRepository.findOne({
        where: { id },
        relations: [
          'formula',
          'formula.materials',
          'formula.materials.materialProductCode',
          'productCode',
          'productCode.product',
          'product',
          'product.category',
          'stages',
          'materialUsages',
          'materialUsages.materialProductCode',
          'materialUsages.materialProductCode.product',
          'materialUsages.materialProductCode.product.category',
          'materialUsages.materialProductCode.category',
          'materialUsages.materialProductCode.size',
          'bottlingOutputs',
          'bottlingOutputs.productCode',
          'bottlingOutputs.productCode.size',
          'bottlingOutputs.productCode.product',
          'bottlingOutputs.productCode.product.category',
        ],
      });

      if (!batch) {
        throw new NotFoundException(`Batch with ID ${id} not found`);
      }

      // Fetch available product sizes (ProductCodes) for this product concept
      // Filter: Same product + Finished Goods category + Active
      if (batch.product) {
        const productCodes = await this.productCodeRepository.find({
          where: {
            product: { id: batch.product.id },
            isActive: true,
            isDeleted: false,
          },
          relations: ['product', 'category', 'size'],
        });

        // Filter only finished goods (main category level 0)
        const finishedGoodsCodes = productCodes.filter((pc) => {
          const categoryName = pc.category?.name?.toLowerCase() || '';
          return (
            categoryName.includes('jadi') ||
            categoryName.includes('finished') ||
            categoryName.includes('barang jadi')
          );
        });

        // Attach to batch for frontend use
        (batch as any).product.productCodes = finishedGoodsCodes;
      }

      return this._success('Batch retrieved successfully', batch);
    } catch (error) {
      this.logger.error(`Failed to get batch ${id}`, error.stack);
      throw error;
    }
  }

  /**
   * Cancel Batch
   */
  async cancelBatch(batchId: number, reason: string, userId: number) {
    try {
      const batch = await this.batchRepository.findOne({
        where: { id: batchId },
      });

      if (!batch) {
        throw new NotFoundException(`Batch with ID ${batchId} not found`);
      }

      if (batch.status === BatchStatus.COMPLETED) {
        throw new BadRequestException('Cannot cancel completed batch');
      }

      batch.status = BatchStatus.CANCELLED;
      batch.notes = `${batch.notes || ''}\n\nCANCELLED: ${reason}`;
      batch.updatedBy = userId;

      await this.batchRepository.save(batch);

      this.logger.log(
        `Batch ${batch.batchNumber} cancelled by user ${userId}. Reason: ${reason}`,
      );

      // ✅ Emit BATCH_CANCELLED notification
      // [ROLLED BACK] Emit notification disabled

      return this._success('Batch cancelled successfully', batch);
    } catch (error) {
      this.logger.error(`Failed to cancel batch ${batchId}`, error.stack);
      throw error;
    }
  }

  /**
   * Record Material Usage Adjustments
   * Human-Centered Design: Only update materials with hasAdjustment=true
   */
  async recordMaterialAdjustments(
    batchId: number,
    dto: {
      materialAdjustments: Array<{
        materialUsageId: number;
        actualQuantity: number;
        hasAdjustment: boolean;
      }>;
      notes?: string;
    },
    userId: number,
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const batch = await this.batchRepository.findOne({
        where: { id: batchId },
        relations: ['materialUsages'],
      });

      if (!batch) {
        throw new NotFoundException(`Batch with ID ${batchId} not found`);
      }

      if (batch.status !== BatchStatus.IN_PROGRESS) {
        throw new BadRequestException(
          `Cannot adjust materials for batch in ${batch.status} status`,
        );
      }

      let adjustedCount = 0;
      const adjustmentLog: string[] = [];

      // Process each material adjustment
      for (const adjustment of dto.materialAdjustments) {
        const materialUsage = batch.materialUsages.find(
          (m) => m.id === adjustment.materialUsageId,
        );

        if (!materialUsage) {
          this.logger.warn(
            `Material usage ${adjustment.materialUsageId} not found in batch ${batchId}`,
          );
          continue;
        }

        if (adjustment.hasAdjustment) {
          // User explicitly adjusted this material
          const plannedQty = Number(materialUsage.plannedQuantity);
          const actualQty = Number(adjustment.actualQuantity);
          const variance = actualQty - plannedQty;
          const variancePercent = (variance / plannedQty) * 100;

          materialUsage.actualQuantity = actualQty;
          materialUsage.wasteQuantity = Math.max(0, plannedQty - actualQty);
          materialUsage.totalCost = actualQty * Number(materialUsage.unitCost);
          materialUsage.updatedBy = userId;

          await queryRunner.manager.save(materialUsage);

          adjustedCount++;
          adjustmentLog.push(
            `${materialUsage.materialProductCode?.productCode || 'Unknown'}: ${plannedQty} → ${actualQty} (${variance > 0 ? '+' : ''}${variance.toFixed(3)} ${materialUsage.unit}, ${variancePercent.toFixed(1)}%)`,
          );

          this.logger.log(
            `Adjusted material ${materialUsage.id}: ${plannedQty} → ${actualQty} ${materialUsage.unit}`,
          );
        } else {
          // No adjustment - use planned quantity as actual
          materialUsage.actualQuantity = materialUsage.plannedQuantity;
          materialUsage.wasteQuantity = 0;
          materialUsage.totalCost =
            Number(materialUsage.plannedQuantity) *
            Number(materialUsage.unitCost);
          materialUsage.updatedBy = userId;

          await queryRunner.manager.save(materialUsage);
        }
      }

      // Update batch notes with adjustment summary
      if (adjustedCount > 0) {
        const adjustmentSummary = `\n\n=== Material Adjustments ===\n${adjustmentLog.join('\n')}\n${dto.notes ? `Notes: ${dto.notes}` : ''}`;
        batch.notes = (batch.notes || '') + adjustmentSummary;
        batch.updatedBy = userId;
        await queryRunner.manager.save(batch);
      }

      await queryRunner.commitTransaction();
      await queryRunner.release();

      this.logger.log(
        `Material adjustments recorded for batch ${batch.batchNumber}: ${adjustedCount} materials adjusted`,
      );

      return this._success(
        `Material adjustments recorded successfully (${adjustedCount} materials adjusted)`,
        {
          batchId,
          adjustedCount,
          adjustments: adjustmentLog,
        },
      );
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      await queryRunner.release();
      this.logger.error(
        `Failed to record material adjustments for batch ${batchId}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Complete Production Batch (REDESIGNED - Dec 2024)
   *
   * Purpose:
   * - Simplified single-endpoint workflow (replaces startProduction + recordStage)
   * - Support multi-size bottling from single concentrate batch
   * - Integrate material tracking with inventory transactions
   * - Enable draft mode for delayed data entry
   *
   * Business Flow:
   * 1. Validate batch exists and is PLANNED
   * 2. Validate bottling outputs match product concept (name, category, type)
   * 3. Save material usage records
   * 4. Create bottling output records
   * 5. If NOT draft:
   *    a. Create PRODUCTION_OUT transactions for materials
   *    b. Create PRODUCTION_IN transactions for each bottling output
   *    c. Update batch status to COMPLETED
   * 6. If draft: Save as DRAFT status for later finalization
   *
   * Example:
   * Batch: Jambu Merah 40L concentrate
   * - actualConcentrate: 40
   * - bottlingOutputs: [
   *     { productCodeId: 101, quantity: 60, wasteQuantity: 5 },  // JM-600ML
   *     { productCodeId: 102, quantity: 40, wasteQuantity: 2 }   // JM-1000ML
   *   ]
   * - Creates 2 PRODUCTION_IN transactions (one per size)
   * - Creates PRODUCTION_OUT for materials consumed
   */
  async completeBatch(batchId: number, dto: CompleteBatchDto, userId: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Load batch with relations
      const batch = await queryRunner.manager.findOne(ProductionBatches, {
        where: { id: batchId },
        relations: ['formula', 'product', 'productCode', 'materialUsages'],
      });

      if (!batch) {
        throw new NotFoundException(`Batch with ID ${batchId} not found`);
      }

      // 2. Validate batch status
      if (
        batch.status !== BatchStatus.PLANNED &&
        batch.status !== BatchStatus.DRAFT
      ) {
        throw new BadRequestException(
          `Cannot complete batch in ${batch.status} status. Only PLANNED or DRAFT batches can be completed.`,
        );
      }

      // 3. Validate bottling outputs match product concept
      await this.validateBottlingOutputs(
        batch.productId,
        dto.bottlingOutputs,
        queryRunner,
      );

      // 4. Update batch with concentrate and production info
      batch.actualConcentrate = dto.actualConcentrate;
      batch.notes = dto.notes || batch.notes;
      batch.productionNotes = dto.productionNotes || null;
      batch.performedBy = dto.performedBy || null;
      batch.completedAt = new Date();
      batch.updatedBy = userId;

      // Calculate total good quantity from all bottling outputs
      const totalGoodQuantity = dto.bottlingOutputs.reduce(
        (sum, output) => sum + Number(output.quantity),
        0,
      );
      const totalWasteQuantity = dto.bottlingOutputs.reduce(
        (sum, output) => sum + Number(output.wasteQuantity || 0),
        0,
      );

      batch.actualQuantity = totalGoodQuantity;
      batch.wasteQuantity = totalWasteQuantity;

      // Set draft or completed status
      if (dto.isDraft) {
        batch.status = BatchStatus.DRAFT;
      } else {
        batch.status = BatchStatus.COMPLETED;
      }

      await queryRunner.manager.save(batch);

      // 5. Save material usages
      const materialUsages = await this.saveMaterialUsages(
        batch,
        dto.materialUsages,
        userId,
        queryRunner,
      );

      // Calculate total material cost
      const totalMaterialCost = materialUsages.reduce(
        (sum, usage) => sum + Number(usage.totalCost),
        0,
      );
      batch.totalMaterialCost = totalMaterialCost;
      await queryRunner.manager.save(batch);

      // 6. Create bottling output records
      const bottlingOutputs = await this.createBottlingOutputs(
        batch,
        dto.bottlingOutputs,
        userId,
        queryRunner,
      );

      // 7. Create inventory transactions (only if NOT draft)
      let inventoryTransactions = [];
      if (!dto.isDraft) {
        // Create PRODUCTION_OUT for materials
        await this.createMaterialOutTransactions(
          batch,
          materialUsages,
          userId,
          queryRunner,
        );

        // Create PRODUCTION_IN for each bottling output
        inventoryTransactions = await this.createBottlingInTransactions(
          batch,
          bottlingOutputs,
          userId,
          queryRunner,
        );
      }

      await queryRunner.commitTransaction();
      await queryRunner.release();

      this.logger.log(
        `Batch ${batch.batchNumber} ${dto.isDraft ? 'saved as draft' : 'completed'}: ` +
          `${bottlingOutputs.length} bottling outputs, ` +
          `${materialUsages.length} materials, ` +
          `${inventoryTransactions.length} inventory transactions`,
      );

      // ✅ Emit BATCH_COMPLETED notification (only if NOT draft)
      if (!dto.isDraft) {
        this.notificationEventEmitter.emitBatchCompleted({
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          productName: batch.product.name,
          actualQuantity: totalGoodQuantity,
          qcPassedQuantity: totalGoodQuantity, // Assuming all good qty is passed, effectively skipping QC stage detail in this simplified flow
        });
      }

      return this._success(
        dto.isDraft
          ? 'Batch saved as draft successfully'
          : 'Batch completed successfully',
        {
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          status: batch.status,
          actualConcentrate: batch.actualConcentrate,
          totalGoodQuantity,
          totalWasteQuantity,
          bottlingOutputsCount: bottlingOutputs.length,
          totalMaterialCost,
          inventoryTransactionsCount: inventoryTransactions.length,
        },
      );
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      await queryRunner.release();
      this.logger.error(`Failed to complete batch ${batchId}`, error.stack);
      throw error;
    }
  }

  /**
   * Validate that bottling outputs match batch's product concept
   */
  private async validateBottlingOutputs(
    productId: number,
    outputs: any[],
    queryRunner: any,
  ) {
    const batchProduct = await queryRunner.manager.findOne(
      queryRunner.manager.getRepository('products').target,
      {
        where: { id: productId },
        relations: ['category'],
      },
    );

    if (!batchProduct) {
      throw new NotFoundException('Batch product not found');
    }

    for (const output of outputs) {
      const productCode = await queryRunner.manager.findOne(ProductCodes, {
        where: { id: output.productCodeId },
        relations: ['product', 'product.category'],
      });

      if (!productCode) {
        throw new NotFoundException(
          `Product code ${output.productCodeId} not found`,
        );
      }

      // Validate product concept match
      if (productCode.product.id !== batchProduct.id) {
        throw new BadRequestException(
          `Product code ${productCode.productCode} does not match batch product concept. ` +
            `Expected: ${batchProduct.productName}, ` +
            `Got: ${productCode.product.productName}`,
        );
      }
    }
  }

  /**
   * Save material usages
   */
  private async saveMaterialUsages(
    batch: ProductionBatches,
    materialUsages: any[],
    userId: number,
    queryRunner: any,
  ): Promise<ProductionMaterialUsage[]> {
    const savedUsages: ProductionMaterialUsage[] = [];

    for (const usageDto of materialUsages) {
      // Find existing usage or create new
      let usage = batch.materialUsages?.find(
        (u) => u.materialProductCodeId === usageDto.materialProductCodeId,
      );

      if (!usage) {
        usage = new ProductionMaterialUsage();
        usage.batchId = batch.id;
        usage.materialProductCodeId = usageDto.materialProductCodeId;
        usage.createdBy = userId;
      }

      usage.actualQuantity = usageDto.actualQuantity;
      usage.unit = usageDto.unit;
      usage.unitCost = usageDto.unitCost;
      usage.totalCost = usageDto.actualQuantity * usageDto.unitCost;
      usage.notes = usageDto.notes;
      usage.updatedBy = userId;

      const savedUsage = await queryRunner.manager.save(usage);
      savedUsages.push(savedUsage);
    }

    return savedUsages;
  }

  /**
   * Create bottling output records
   */
  private async createBottlingOutputs(
    batch: ProductionBatches,
    outputs: any[],
    userId: number,
    queryRunner: any,
  ): Promise<ProductionBottlingOutput[]> {
    const bottlingOutputs: ProductionBottlingOutput[] = [];

    for (const outputDto of outputs) {
      const output = new ProductionBottlingOutput();
      output.batchId = batch.id;
      output.productCodeId = outputDto.productCodeId;
      output.quantity = outputDto.quantity;
      output.wasteQuantity = outputDto.wasteQuantity || 0;
      output.notes = outputDto.notes;
      output.createdBy = userId;

      const savedOutput = await queryRunner.manager.save(output);
      bottlingOutputs.push(savedOutput);
    }

    return bottlingOutputs;
  }

  /**
   * Create PRODUCTION_OUT transactions for materials
   */
  private async createMaterialOutTransactions(
    batch: ProductionBatches,
    materialUsages: ProductionMaterialUsage[],
    userId: number,
    queryRunner: any,
  ) {
    const materials = materialUsages.map((usage) => ({
      productCodeId: usage.materialProductCodeId,
      quantity: usage.actualQuantity,
      unit: usage.unit,
    }));

    await this.inventoryService.recordMaterialProduction(
      batch.batchNumber,
      materials,
      userId,
      batch.performedBy || undefined,
      `Material consumed for batch ${batch.batchNumber}`,
      batch.productionDate,
    );
  }

  /**
   * Create PRODUCTION_IN transactions for bottling outputs
   */
  private async createBottlingInTransactions(
    batch: ProductionBatches,
    outputs: ProductionBottlingOutput[],
    userId: number,
    queryRunner: any,
  ): Promise<any[]> {
    const transactions = [];

    for (const output of outputs) {
      const transaction =
        await this.inventoryService.recordFinishedGoodsProduction(
          output.productCodeId,
          output.quantity, // Only good quantity (not waste)
          batch.batchNumber,
          userId,
          batch.performedBy || undefined,
          `Production from batch ${batch.batchNumber}${output.notes ? ` - ${output.notes}` : ''}`,
          batch.productionDate,
        );
      transactions.push(transaction);
    }

    return transactions;
  }
}
