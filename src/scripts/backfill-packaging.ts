import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ProductionBatches } from '../modules/production/entities/production-batches.entity';
import { ProductionBottlingOutput } from '../modules/production/entities/production-bottling-output.entity';
import { ProductPackagingMaterial } from '../modules/products/entity/product-packaging-material.entity';
import { DataSource } from 'typeorm';
import { ProductionMaterialUsage } from '../modules/production/entities/production-material-usage.entity';
import { InventoryLegacyService } from '../modules/inventory/services/inventory-legacy.service';

/**
 * Script to Backfill Packaging Materials for Past Production Batches
 *
 * SAFE TO RE-RUN: This script is idempotent.
 * - Checks each batch for existing packaging usage records before processing.
 * - Batches that already have packaging deducted (via normal flow OR previous backfill)
 *   are skipped entirely.
 * - Individual materials are also checked to prevent duplicates.
 *
 * Logic:
 * 1. Find all COMPLETED batches from START_DATE onwards.
 * 2. For each batch, check if Packaging Material Usage already exists.
 *    - If ALL packaging already recorded → SKIP (batch already processed).
 *    - If SOME or NONE recorded → process only missing materials.
 * 3. Calculate packaging qty based on Bottling Output × PackagingMaterial rules.
 * 4. Create ProductionMaterialUsage records.
 * 5. Create Inventory Transactions (Backdated to production date).
 * 6. Uses updateStockWithPropagation to fix inventory chain.
 */

// =============================================
// CONFIGURATION — Change these as needed
// =============================================
const START_DATE = '2026-01-02'; // Start backfill from this date
const DRY_RUN = false; // Set to true to preview without writing to DB
const SYSTEM_USER_ID = 1; // System user ID for audit trail

async function bootstrap() {
  try {
    console.log('='.repeat(60));
    console.log('  PACKAGING BACKFILL SCRIPT');
    console.log(`  Start Date : ${START_DATE}`);
    console.log(
      `  Dry Run    : ${DRY_RUN ? 'YES (preview only)' : 'NO (will write to DB)'}`,
    );
    console.log('='.repeat(60));

    const app = await NestFactory.createApplicationContext(AppModule);
    const dataSource = app.get(DataSource);
    const batchRepo = dataSource.getRepository(ProductionBatches);
    const packagingRepo = dataSource.getRepository(ProductPackagingMaterial);
    const usageRepo = dataSource.getRepository(ProductionMaterialUsage);
    const inventoryService = app.get(InventoryLegacyService);

    // 1. Fetch Completed Batches with relations
    const batches = await batchRepo
      .createQueryBuilder('batch')
      .leftJoinAndSelect('batch.bottlingOutputs', 'bottlingOutputs')
      .leftJoinAndSelect('batch.product', 'product')
      .leftJoinAndSelect('batch.materialUsages', 'materialUsages')
      .leftJoinAndSelect(
        'materialUsages.materialProductCode',
        'materialProductCode',
      )
      .leftJoinAndSelect('materialProductCode.product', 'materialProduct')
      .where('batch.status = :status', { status: 'COMPLETED' })
      .andWhere('batch.productionDate >= :date', { date: START_DATE })
      .orderBy('batch.productionDate', 'ASC')
      .getMany();

    console.log(
      `\nFound ${batches.length} completed batches since ${START_DATE}.\n`,
    );

    // Stats
    let totalBatchesProcessed = 0;
    let totalBatchesSkipped = 0;
    let totalPackagingAdded = 0;
    let totalErrors = 0;

    for (const batch of batches) {
      const batchLabel = `${batch.batchNumber} (${batch.productionDate})`;

      // Skip batches without bottling outputs
      if (!batch.bottlingOutputs || batch.bottlingOutputs.length === 0) {
        console.log(`[SKIP] ${batchLabel} — No bottling outputs.`);
        totalBatchesSkipped++;
        continue;
      }

      // ============================
      // BATCH-LEVEL SKIP CHECK
      // ============================
      // Check if this batch already has packaging material usage
      // (either from normal completion or previous backfill)
      const existingPackagingNotes = [
        'System Auto-Deduction (Packaging)',
        'Backfill Auto-Deduction',
      ];

      const hasExistingPackaging = batch.materialUsages.some((u) =>
        existingPackagingNotes.includes(u.notes),
      );

      // Gather all expected packaging rules for this batch
      const allExpectedRules: {
        materialProductCodeId: number;
        neededQty: number;
        outputProductCodeId: number;
      }[] = [];

      for (const output of batch.bottlingOutputs) {
        const rules = await packagingRepo.find({
          where: { productCodeId: output.productCodeId, isActive: true },
          relations: ['materialProductCode'],
        });

        for (const rule of rules) {
          const totalBottles =
            Number(output.quantity) + Number(output.wasteQuantity || 0);
          const neededQty = totalBottles * Number(rule.quantity);
          if (neededQty > 0) {
            allExpectedRules.push({
              materialProductCodeId: rule.materialProductCodeId,
              neededQty,
              outputProductCodeId: output.productCodeId,
            });
          }
        }
      }

      if (allExpectedRules.length === 0) {
        console.log(
          `[SKIP] ${batchLabel} — No packaging rules found for output SKUs.`,
        );
        totalBatchesSkipped++;
        continue;
      }

      // Check which materials are already recorded
      const missingRules = allExpectedRules.filter(
        (rule) =>
          !batch.materialUsages.some(
            (u) => u.materialProductCodeId === rule.materialProductCodeId,
          ),
      );

      if (missingRules.length === 0) {
        console.log(
          `[SKIP] ${batchLabel} — All ${allExpectedRules.length} packaging materials already recorded.`,
        );
        totalBatchesSkipped++;
        continue;
      }

      // ============================
      // PROCESS MISSING MATERIALS
      // ============================
      console.log(
        `[PROCESS] ${batchLabel} — ${missingRules.length}/${allExpectedRules.length} materials need backfill.`,
      );

      let packagingAdded = 0;

      try {
        for (const rule of missingRules) {
          console.log(
            `  → Material #${rule.materialProductCodeId}: ${rule.neededQty} PCS (output #${rule.outputProductCodeId})`,
          );

          if (DRY_RUN) {
            packagingAdded++;
            continue;
          }

          // 1. Save Usage Record
          const usage = new ProductionMaterialUsage();
          usage.batchId = batch.id;
          usage.materialProductCodeId = rule.materialProductCodeId;
          usage.actualQuantity = rule.neededQty;
          usage.plannedQuantity = rule.neededQty;
          usage.wasteQuantity = 0;
          usage.unit = 'PCS';
          usage.unitCost = 0;
          usage.totalCost = 0;
          usage.notes = 'Backfill Auto-Deduction';
          usage.createdBy = SYSTEM_USER_ID;
          usage.updatedBy = SYSTEM_USER_ID;

          await usageRepo.save(usage);
          packagingAdded++;

          // 2. Create Inventory Transaction (Backdated)
          const materialsToDeduct = [
            {
              productCodeId: rule.materialProductCodeId,
              quantity: rule.neededQty,
              unit: 'PCS',
            },
          ];

          await inventoryService.recordMaterialProduction(
            batch.batchNumber,
            materialsToDeduct,
            SYSTEM_USER_ID,
            undefined,
            `Backfill packaging for batch ${batch.batchNumber}`,
            batch.productionDate, // Backdated to original production date
          );
        }

        if (packagingAdded > 0) {
          console.log(
            `  ✅ Added ${packagingAdded} packaging records for ${batchLabel}`,
          );
          totalBatchesProcessed++;
          totalPackagingAdded += packagingAdded;
        }
      } catch (err) {
        console.error(`  ❌ Error processing ${batchLabel}:`, err);
        totalErrors++;
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('  BACKFILL SUMMARY');
    console.log('='.repeat(60));
    console.log(`  Total Batches Found   : ${batches.length}`);
    console.log(`  Batches Processed     : ${totalBatchesProcessed}`);
    console.log(`  Batches Skipped       : ${totalBatchesSkipped}`);
    console.log(`  Packaging Records Added: ${totalPackagingAdded}`);
    console.log(`  Errors                : ${totalErrors}`);
    if (DRY_RUN) {
      console.log(`  ⚠️  DRY RUN — No data was written to the database.`);
    }
    console.log('='.repeat(60));

    await app.close();
  } catch (error) {
    console.error('Backfill Script Failed:', error);
    process.exit(1);
  }
}

bootstrap();
