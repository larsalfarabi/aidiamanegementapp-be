import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataSource } from 'typeorm';
import { ProductionMaterialUsage } from '../modules/production/entities/production-material-usage.entity';
import { InventoryTransactions } from '../modules/inventory/entity/inventory-transactions.entity';

/**
 * Verification script for Packaging Backfill.
 * Shows counts and details of backfilled records.
 */
async function bootstrap() {
  console.log('='.repeat(60));
  console.log('  PACKAGING BACKFILL VERIFICATION');
  console.log('='.repeat(60));

  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);
  const usageRepo = dataSource.getRepository(ProductionMaterialUsage);

  // 1. Count backfill usage records
  const backfillCount = await usageRepo.count({
    where: { notes: 'Backfill Auto-Deduction' },
  });

  // 2. Count normal auto-deduction records
  const normalCount = await usageRepo.count({
    where: { notes: 'System Auto-Deduction (Packaging)' },
  });

  // 3. Get backfill records grouped by batch
  const backfillByBatch = await usageRepo
    .createQueryBuilder('u')
    .select('u.batchId', 'batchId')
    .addSelect('COUNT(*)', 'materialCount')
    .addSelect('SUM(u.actualQuantity)', 'totalQty')
    .where("u.notes = 'Backfill Auto-Deduction'")
    .groupBy('u.batchId')
    .getRawMany();

  // 4. Count inventory transactions created by backfill
  const invTxCount = await dataSource
    .getRepository(InventoryTransactions)
    .createQueryBuilder('t')
    .where("t.notes LIKE '%Backfill packaging for batch%'")
    .getCount();

  console.log(`\n  Backfill Usage Records   : ${backfillCount}`);
  console.log(`  Normal Auto-Deduction    : ${normalCount}`);
  console.log(`  Total Packaging Records  : ${backfillCount + normalCount}`);
  console.log(`  Inventory Transactions   : ${invTxCount}`);
  console.log(`  Batches Affected         : ${backfillByBatch.length}`);

  if (backfillByBatch.length > 0) {
    console.log('\n  Backfill Details (per batch):');
    console.log('  ' + '-'.repeat(50));
    for (const row of backfillByBatch) {
      console.log(
        `  Batch #${row.batchId}: ${row.materialCount} materials, ${row.totalQty} PCS total`,
      );
    }
  }

  console.log('\n' + '='.repeat(60));
  await app.close();
}

bootstrap();
