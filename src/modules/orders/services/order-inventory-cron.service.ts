import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Orders } from '../entity/orders.entity';
import { InventoryTransactionService } from '../../inventory/services/inventory-transaction.service';

/**
 * OrderInventoryCronService
 *
 * Cron job yang berjalan setiap hari jam 00:05 WIB
 * untuk memproses pengurangan stok pesanan dengan tanggal invoice future date.
 *
 * Schedule: 5 menit setelah daily-inventory-reset (00:00 WIB)
 * agar daily_inventory untuk hari ini sudah tersedia.
 *
 * Business Rules:
 * - Cari orders WHERE invoiceDate = TODAY AND inventoryDeducted = false AND isDeleted = false
 * - Untuk setiap order, lakukan recordSale() untuk semua items
 * - Set inventoryDeducted = true setelah berhasil
 * - Idempotent: aman jika dijalankan berkali-kali
 */
@Injectable()
export class OrderInventoryCronService {
  private readonly logger = new Logger(OrderInventoryCronService.name);

  constructor(
    @InjectRepository(Orders)
    private readonly ordersRepo: Repository<Orders>,
    private readonly inventoryTransactionService: InventoryTransactionService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Cron Job: Process Future-Dated Orders
   *
   * Runs every day at 00:05 WIB (17:05 UTC previous day)
   * Processes orders whose invoiceDate = today and inventoryDeducted = false
   */
  @Cron('0 5 0 * * *', {
    name: 'process-future-orders',
    timeZone: 'Asia/Jakarta',
  })
  async processFutureOrders(): Promise<void> {
    this.logger.log(
      '📦 [CRON] Starting future-dated order inventory processing...',
    );

    try {
      await this.processOrders();
    } catch (error) {
      this.logger.error(
        `❌ [CRON] Failed to process future-dated orders: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Core logic: Find and process pending orders
   * Can be called from cron or manual trigger
   */
  async processOrders(): Promise<{
    totalFound: number;
    processed: number;
    errors: number;
    details: any[];
  }> {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD

    // Find orders with invoiceDate = today AND inventoryDeducted = false
    const pendingOrders = await this.ordersRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.orderItems', 'items')
      .where('DATE(order.invoiceDate) = :today', { today: todayStr })
      .andWhere('order.inventoryDeducted = :deducted', { deducted: false })
      .andWhere('(order.isDeleted = :isDeleted OR order.isDeleted IS NULL)', {
        isDeleted: false,
      })
      .getMany();

    this.logger.log(
      `📋 [CRON] Found ${pendingOrders.length} pending orders for ${todayStr}`,
    );

    if (pendingOrders.length === 0) {
      return { totalFound: 0, processed: 0, errors: 0, details: [] };
    }

    let processed = 0;
    let errors = 0;
    const details: any[] = [];

    for (const order of pendingOrders) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        const itemCount = order.orderItems?.length || 0;
        this.logger.log(
          `[CRON] Processing ${order.orderNumber} (${itemCount} items, invoice: ${todayStr})`,
        );

        // Record inventory transaction for each order item
        for (const item of order.orderItems || []) {
          await this.inventoryTransactionService.recordSale(
            {
              productCodeId: item.productCodeId,
              quantity: item.quantity,
              orderId: order.id,
              invoiceDate: order.invoiceDate,
              notes: `Cron: Deduction for future-dated order ${order.orderNumber}`,
            },
            1, // System user ID
            queryRunner.manager,
          );
        }

        // Mark as deducted
        await queryRunner.manager.update(Orders, order.id, {
          inventoryDeducted: true,
        });

        await queryRunner.commitTransaction();

        processed++;
        details.push({
          orderNumber: order.orderNumber,
          itemCount,
          status: 'SUCCESS',
        });

        this.logger.log(
          `✅ [CRON] ${order.orderNumber} — ${itemCount} items deducted`,
        );
      } catch (error) {
        await queryRunner.rollbackTransaction();
        errors++;
        details.push({
          orderNumber: order.orderNumber,
          status: 'ERROR',
          error: error.message,
        });
        this.logger.error(
          `❌ [CRON] ${order.orderNumber} — Failed: ${error.message}`,
          error.stack,
        );
      } finally {
        await queryRunner.release();
      }
    }

    // Summary
    this.logger.log('='.repeat(60));
    this.logger.log('  FUTURE ORDER CRON SUMMARY');
    this.logger.log('='.repeat(60));
    this.logger.log(`  Date              : ${todayStr}`);
    this.logger.log(`  Total Found       : ${pendingOrders.length}`);
    this.logger.log(`  Processed         : ${processed}`);
    this.logger.log(`  Errors            : ${errors}`);
    this.logger.log('='.repeat(60));

    return {
      totalFound: pendingOrders.length,
      processed,
      errors,
      details,
    };
  }

  /**
   * Manual trigger for testing or recovery
   * Can be called via admin endpoint
   */
  async manualTrigger(): Promise<{
    success: boolean;
    result: any;
  }> {
    this.logger.log('🔧 [MANUAL] Future order processing triggered manually');
    const result = await this.processOrders();
    return { success: true, result };
  }
}
