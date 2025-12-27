// src/modules/inventory/services/inventory-check.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DailyInventory } from '../entity/daily-inventory.entity';
import { ProductCodes } from '../../products/entity/product_codes.entity';
import { NotificationEventEmitter } from '../../notifications/services/notification-event-emitter.service';

/**
 * Inventory Check Service
 *
 * Scheduled job yang berjalan setiap hari jam 08:00 WIB
 * untuk mengecek status stok semua produk dan mengirim
 * notifikasi CRITICAL untuk produk yang habis atau hampir habis.
 *
 * Business Rules:
 * - OUT_OF_STOCK: stokAkhir = 0 (CRITICAL 🔴)
 * - LOW_STOCK: stokAkhir <= minStock AND stokAkhir > 0 (CRITICAL 🔴)
 * - Hanya check produk aktif (isActive = true, isDeleted = false)
 * - Menggunakan data dari daily_inventory (closing stock kemarin)
 *
 * Notification Recipients (PBAC):
 * - INVENTORY_READ: Warehouse staff
 * - PRODUCTION_READ: Production manager (untuk production planning)
 * - ORDERS_READ: Sales team (untuk inform customers)
 */
@Injectable()
export class InventoryCheckService {
  private readonly logger = new Logger(InventoryCheckService.name);

  constructor(
    @InjectRepository(DailyInventory)
    private readonly dailyInventoryRepo: Repository<DailyInventory>,
    @InjectRepository(ProductCodes)
    private readonly productCodeRepo: Repository<ProductCodes>,
    private readonly notificationEventEmitter: NotificationEventEmitter,
  ) {}

  /**
   * Cron Job: Check Stock Levels
   *
   * Runs every day at 08:00 WIB (01:00 UTC, WIB = UTC+7)
   * Alternative: Use '0 8 * * *' for local timezone
   *
   * @cron 0 1 * * * (01:00 UTC = 08:00 WIB)
   */
  @Cron('0 1 * * *', {
    name: 'check-stock-levels',
    timeZone: 'UTC',
  })
  async checkStockLevels(): Promise<void> {
    this.logger.log('🔍 Starting daily stock level check...');

    try {
      // Get yesterday's date for daily_inventory lookup
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const businessDate = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD

      // Query: Find all products with low/out-of-stock status
      const lowStockProducts = await this.dailyInventoryRepo
        .createQueryBuilder('di')
        .leftJoinAndSelect('di.productCode', 'pc')
        .leftJoinAndSelect('pc.product', 'product')
        .leftJoinAndSelect('pc.category', 'category')
        .leftJoinAndSelect('pc.size', 'size')
        .where('di.businessDate = :businessDate', { businessDate })
        .andWhere('pc.isActive = :isActive', { isActive: true })
        .andWhere('pc.isDeleted = :isDeleted', { isDeleted: false })
        .andWhere(
          '(di.stokAkhir = 0 OR (di.stokAkhir <= di.minimumStock AND di.stokAkhir > 0))',
        )
        .getMany();

      this.logger.log(
        `Found ${lowStockProducts.length} products with low/out-of-stock status`,
      );

      // Emit notifications
      let outOfStockCount = 0;
      let lowStockCount = 0;

      for (const item of lowStockProducts) {
        const productCode = item.productCode;
        const isOutOfStock = item.stokAkhir === 0;

        if (isOutOfStock) {
          // CRITICAL: Out of Stock
          await this.notificationEventEmitter.emitStockOut({
            productId: productCode.id,
            productCode: productCode.productCode,
            productName: productCode.product?.name || 'Unknown',
            category: productCode.category?.name || 'Unknown',
          });
          outOfStockCount++;
        } else {
          // CRITICAL: Low Stock
          await this.notificationEventEmitter.emitStockLow({
            productId: productCode.id,
            productCode: productCode.productCode,
            productName: productCode.product?.name || 'Unknown',
            currentStock: item.stokAkhir,
            minStock: item.minimumStock || 0,
            category: productCode.category?.name || 'Unknown',
          });
          lowStockCount++;
        }
      }

      this.logger.log(
        `✅ Stock check complete: ${outOfStockCount} out-of-stock, ${lowStockCount} low-stock`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Error during stock level check: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Manual trigger for testing
   * Can be called via API endpoint for debugging
   */
  async manualStockCheck(): Promise<{
    outOfStockCount: number;
    lowStockCount: number;
    products: any[];
  }> {
    this.logger.log('🔍 Manual stock check triggered');

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const businessDate = yesterday.toISOString().split('T')[0];

    const lowStockProducts = await this.dailyInventoryRepo
      .createQueryBuilder('di')
      .leftJoinAndSelect('di.productCode', 'pc')
      .leftJoinAndSelect('pc.product', 'product')
      .leftJoinAndSelect('pc.category', 'category')
      .leftJoinAndSelect('pc.size', 'size')
      .where('di.businessDate = :businessDate', { businessDate })
      .andWhere('pc.isActive = :isActive', { isActive: true })
      .andWhere('pc.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere(
        '(di.stokAkhir = 0 OR (di.stokAkhir <= di.minimumStock AND di.stokAkhir > 0))',
      )
      .getMany();

    let outOfStockCount = 0;
    let lowStockCount = 0;
    const products = [];

    for (const item of lowStockProducts) {
      const productCode = item.productCode;
      const isOutOfStock = item.stokAkhir === 0;

      products.push({
        productCode: productCode.productCode,
        productName: productCode.product?.name,
        category: productCode.category?.name,
        currentStock: item.stokAkhir,
        minStock: item.minimumStock,
        status: isOutOfStock ? 'OUT_OF_STOCK' : 'LOW_STOCK',
      });

      if (isOutOfStock) {
        await this.notificationEventEmitter.emitStockOut({
          productId: productCode.id,
          productCode: productCode.productCode,
          productName: productCode.product?.name || 'Unknown',
          category: productCode.category?.name || 'Unknown',
        });
        outOfStockCount++;
      } else {
        await this.notificationEventEmitter.emitStockLow({
          productId: productCode.id,
          productCode: productCode.productCode,
          productName: productCode.product?.name || 'Unknown',
          currentStock: item.stokAkhir,
          minStock: item.minimumStock || 0,
          category: productCode.category?.name || 'Unknown',
        });
        lowStockCount++;
      }
    }

    return { outOfStockCount, lowStockCount, products };
  }
}
