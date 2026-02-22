import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataSource } from 'typeorm';
import { Orders } from '../modules/orders/entity/orders.entity';
import { InventoryTransactionService } from '../modules/inventory/services/inventory-transaction.service';

/**
 * Backfill Future-Dated Orders
 *
 * One-time script to process existing orders that:
 * - Have invoiceDate <= today (already past or today)
 * - Have inventoryDeducted = false (stock was never deducted)
 * - Are not deleted
 *
 * This handles orders that were created with future invoice dates
 * BEFORE the cron job was implemented.
 *
 * Safe to re-run: Uses inventoryDeducted flag for idempotency.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register src/scripts/backfill-future-orders.ts
 */

// =============================================
// CONFIGURATION
// =============================================
const DRY_RUN = false; // Set to false to write to DB
const SYSTEM_USER_ID = 1; // System user ID for audit trail

async function bootstrap() {
  console.log('='.repeat(60));
  console.log('  BACKFILL FUTURE-DATED ORDERS');
  console.log('='.repeat(60));
  console.log(
    `  Mode: ${DRY_RUN ? '🔍 DRY RUN (preview only)' : '⚡ LIVE (writing to DB)'}`,
  );
  console.log('');

  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);
  const inventoryTxService = app.get(InventoryTransactionService);
  const ordersRepo = dataSource.getRepository(Orders);

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  console.log(`  Today: ${todayStr}`);

  // Find orders with inventoryDeducted = false AND invoiceDate <= today
  const pendingOrders = await ordersRepo
    .createQueryBuilder('order')
    .leftJoinAndSelect('order.orderItems', 'items')
    .where('order.inventoryDeducted = :deducted', { deducted: false })
    .andWhere('DATE(order.invoiceDate) <= :today', { today: todayStr })
    .andWhere('(order.isDeleted = :isDeleted OR order.isDeleted IS NULL)', {
      isDeleted: false,
    })
    .orderBy('order.invoiceDate', 'ASC')
    .getMany();

  console.log(
    `  Found: ${pendingOrders.length} orders with pending inventory deduction\n`,
  );

  if (pendingOrders.length === 0) {
    console.log('  ✅ No pending orders found. Nothing to do.');
    await app.close();
    return;
  }

  let processed = 0;
  let errors = 0;
  let totalItems = 0;

  for (const order of pendingOrders) {
    const itemCount = order.orderItems?.length || 0;
    const invoiceDateStr = new Date(order.invoiceDate)
      .toISOString()
      .split('T')[0];

    console.log(
      `[${DRY_RUN ? 'DRY' : 'LIVE'}] ${order.orderNumber} | Invoice: ${invoiceDateStr} | Items: ${itemCount}`,
    );

    if (DRY_RUN) {
      processed++;
      totalItems += itemCount;
      for (const item of order.orderItems || []) {
        console.log(
          `  → Product ${item.productCodeId}: qty ${item.quantity} ${item.unit || 'PCS'}`,
        );
      }
      continue;
    }

    // LIVE execution — use transaction for each order
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const item of order.orderItems || []) {
        await inventoryTxService.recordSale(
          {
            productCodeId: item.productCodeId,
            quantity: item.quantity,
            orderId: order.id,
            invoiceDate: order.invoiceDate,
            notes: `Backfill: Deduction for future-dated order ${order.orderNumber}`,
          },
          SYSTEM_USER_ID,
          queryRunner.manager,
        );

        console.log(
          `  ✅ Product ${item.productCodeId}: qty ${item.quantity} deducted`,
        );
      }

      // Mark as deducted
      await queryRunner.manager.update(Orders, order.id, {
        inventoryDeducted: true,
      });

      await queryRunner.commitTransaction();
      processed++;
      totalItems += itemCount;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      errors++;
      console.error(`  ❌ FAILED: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('  BACKFILL SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Total Orders Found  : ${pendingOrders.length}`);
  console.log(`  Processed           : ${processed}`);
  console.log(`  Total Items         : ${totalItems}`);
  console.log(`  Errors              : ${errors}`);
  if (DRY_RUN) {
    console.log(`  ⚠️  DRY RUN — No data was written to the database.`);
  }
  console.log('='.repeat(60));

  await app.close();
}

bootstrap();
