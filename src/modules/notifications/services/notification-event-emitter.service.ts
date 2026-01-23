import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { NotificationsService } from '../notifications.service';
import { NotificationsGateway } from '../notifications.gateway';
import {
  NotificationCategory,
  NotificationPriority,
  NotificationResourceType,
} from '../entities/notification.entity';

/**
 * Notification Event Types - Comprehensive Coverage (47 Events)
 * Organized by module for better maintainability
 * Last updated: 2025-01-20
 */
export enum NotificationEventType {
  // === SALES MODULE (14 events) ===

  // Order Management (8 events)
  ORDER_CREATED = 'ORDER_CREATED', // HIGH

  ORDER_CANCELLED = 'ORDER_CANCELLED', // HIGH

  // === WAREHOUSE MODULE (19 events) ===

  // Inventory Transactions (10 events)
  STOCK_OUT = 'STOCK_OUT', // CRITICAL
  STOCK_LOW = 'STOCK_LOW', // HIGH

  WASTE = 'WASTE', // HIGH
  ADJUSTMENT = 'ADJUSTMENT', // HIGH
  STOCK_MISMATCH = 'STOCK_MISMATCH', // CRITICAL

  PRODUCTION_IN = 'PRODUCTION_IN', // MEDIUM

  // === PRODUCTION MODULE (16 events) ===

  // Production Batch (11 events)

  BATCH_CREATED = 'BATCH_CREATED', // MEDIUM
  BATCH_COMPLETED = 'BATCH_COMPLETED', // HIGH

  BATCH_CANCELLED = 'BATCH_CANCELLED', // HIGH
  MATERIAL_SHORTAGE = 'MATERIAL_SHORTAGE', // CRITICAL

  // === USER & PERMISSION MODULE (9 events) ===

  // Permission Management (2 events)

  LOGIN_FAILED_MULTIPLE = 'LOGIN_FAILED_MULTIPLE', // HIGH

  // === SYSTEM MODULE (5 events) ===

  SYSTEM_ERROR = 'SYSTEM_ERROR', // CRITICAL

  REDIS_CONNECTION_LOST = 'REDIS_CONNECTION_LOST', // CRITICAL
  DATABASE_CONNECTION_LOST = 'DATABASE_CONNECTION_LOST', // CRITICAL

  // Legacy events (for backwards compatibility)
  WASTE_CREATED = 'WASTE', // Alias for WASTE
}

/**
 * Notification Event Emitter
 *
 * Central service untuk emit notifications dari module lain.
 * Handles PBAC filtering dan WebSocket delivery otomatis.
 */
@Injectable()
export class NotificationEventEmitter {
  constructor(
    @Inject(forwardRef(() => NotificationsService))
    private notificationsService: NotificationsService,
    @Inject(forwardRef(() => NotificationsGateway))
    private notificationsGateway: NotificationsGateway,
  ) {}

  /**
   * Emit ORDER_CREATED notification
   */
  async emitOrderCreated(data: {
    orderId: number;
    orderNumber: string;
    customerName: string;
    grandTotal: number;
  }) {
    const response = await this.notificationsService.create({
      title: 'Pesanan Baru Diterima',
      message: `Order ${data.orderNumber} dari ${data.customerName} senilai Rp ${data.grandTotal.toLocaleString('id-ID')}`,
      category: NotificationCategory.SALES,
      priority: NotificationPriority.HIGH,
      requiredPermission: 'order:view',
      eventType: NotificationEventType.ORDER_CREATED,
      resourceType: NotificationResourceType.ORDER,
      resourceId: data.orderId,
      actionUrl: `/orders/${data.orderId}`,
      actionLabel: 'Lihat Order',
      metadata: data,
    });
  }

  /**
   * Emit ORDER_CANCELLED notification
   */
  async emitOrderCancelled(data: {
    orderId: number;
    orderNumber: string;
    customerName: string;
    reason?: string;
  }) {
    await this.notificationsService.create({
      title: 'Pesanan Dibatalkan',
      message: `Order ${data.orderNumber} dari ${data.customerName} telah dibatalkan${data.reason ? `: ${data.reason}` : ''}`,
      category: NotificationCategory.SALES,
      priority: NotificationPriority.HIGH,
      requiredPermission: 'order:view',
      eventType: NotificationEventType.ORDER_CANCELLED,
      resourceType: NotificationResourceType.ORDER,
      resourceId: data.orderId,
      actionUrl: `/orders/${data.orderId}`,
      actionLabel: 'Lihat Detail',
      metadata: data,
    });
  }

  /**
   * Emit STOCK_OUT notification (CRITICAL)
   */
  async emitStockOut(data: {
    productId: number;
    productCode: string;
    productName: string;
    category: string;
  }) {
    await this.notificationsService.create({
      title: '🔴 Stok Habis!',
      message: `${data.productName} (${data.productCode}) stok habis di gudang`,
      category: NotificationCategory.ALERT,
      priority: NotificationPriority.CRITICAL,
      requiredPermission: 'inventory:view',
      eventType: NotificationEventType.STOCK_OUT,
      resourceType: NotificationResourceType.INVENTORY,
      resourceId: data.productId,
      actionUrl: `/inventory/${data.category.toLowerCase().replace(/\s+/g, '-')}`,
      actionLabel: 'Cek Stok',
      metadata: data,
    });
  }

  /**
   * Emit STOCK_LOW notification (HIGH)
   */
  async emitStockLow(data: {
    productId: number;
    productCode: string;
    productName: string;
    currentStock: number;
    minStock: number;
    category: string;
  }) {
    await this.notificationsService.create({
      title: '⚠️ Stok Menipis',
      message: `${data.productName} (${data.productCode}) stok tersisa ${data.currentStock} (min: ${data.minStock})`,
      category: NotificationCategory.ALERT,
      priority: NotificationPriority.HIGH,
      requiredPermission: 'inventory:view',
      eventType: NotificationEventType.STOCK_LOW,
      resourceType: NotificationResourceType.INVENTORY,
      resourceId: data.productId,
      actionUrl: `/inventory/${data.category.toLowerCase().replace(/\s+/g, '-')}`,
      actionLabel: 'Cek Stok',
      metadata: data,
    });
  }

  /**
   * Emit QC_PENDING notification (HIGH)
   */

  /**
   * Emit QC_FAILED notification (CRITICAL)
   */

  // ============================================
  // === SALES MODULE - ADDITIONAL EVENTS ===
  // ============================================

  // ============================================
  // === WAREHOUSE MODULE - PRODUCT EVENTS ===
  // ============================================

  // ============================================
  // === WAREHOUSE MODULE - INVENTORY TRANSACTIONS ===
  // ============================================

  /**
   * Emit WASTE notification (HIGH)
   * Note: This replaces emitWasteCreated for consistency with new enum
   */
  async emitWaste(data: {
    transactionId: number;
    productName: string;
    productCode: string;
    quantity: number;
    unit: string;
    wasteReason: string;
  }) {
    await this.notificationsService.create({
      title: 'Waste Tercatat ⚠️',
      message: `${data.productName} waste: ${data.quantity} ${data.unit} (${data.wasteReason})`,
      category: NotificationCategory.ALERT,
      priority: NotificationPriority.HIGH,
      requiredPermission: 'inventory:view',
      eventType: NotificationEventType.WASTE,
      resourceType: NotificationResourceType.INVENTORY,
      resourceId: data.transactionId,
      actionUrl: `/inventory/finished-goods`,
      actionLabel: 'Lihat Laporan',
      metadata: data,
    });
  }

  /**
   * Emit ADJUSTMENT notification (HIGH)
   */
  async emitAdjustment(data: {
    transactionId: number;
    productName: string;
    productCode: string;
    oldQuantity: number;
    newQuantity: number;
    reason: string;
  }) {
    await this.notificationsService.create({
      title: 'Adjustment Stok',
      message: `${data.productName}: ${data.oldQuantity} → ${data.newQuantity} (${data.reason})`,
      category: NotificationCategory.INVENTORY,
      priority: NotificationPriority.HIGH,
      requiredPermission: 'inventory:view',
      eventType: NotificationEventType.ADJUSTMENT,
      resourceType: NotificationResourceType.INVENTORY,
      resourceId: data.transactionId,
      actionUrl: `/inventory/finished-goods`,
      actionLabel: 'Verifikasi',
      metadata: data,
    });
  }

  /**
   * Emit STOCK_MISMATCH notification (CRITICAL)
   */
  async emitStockMismatch(data: {
    productCodeId: number;
    productName: string;
    productCode: string;
    systemQuantity: number;
    physicalQuantity: number;
    discrepancy: number;
  }) {
    await this.notificationsService.create({
      title: '🔴 Ketidaksesuaian Stok!',
      message: `${data.productName}: Sistem ${data.systemQuantity} vs Fisik ${data.physicalQuantity} (Selisih: ${data.discrepancy})`,
      category: NotificationCategory.ALERT,
      priority: NotificationPriority.CRITICAL,
      requiredPermission: 'inventory:view',
      eventType: NotificationEventType.STOCK_MISMATCH,
      resourceType: NotificationResourceType.INVENTORY,
      resourceId: data.productCodeId,
      actionUrl: `/inventory/finished-goods`,
      actionLabel: 'Stock Opname Segera',
      metadata: data,
    });
  }

  /**
   * Emit PRODUCTION_IN notification (MEDIUM)
   */
  async emitProductionIn(data: {
    transactionId: number;
    productCode: string;
    productName: string;
    quantity: number;
    batchNumber: string;
  }) {
    await this.notificationsService.create({
      title: 'Produksi Masuk',
      message: `${data.productName}: Masuk ${data.quantity} unit (Batch: ${data.batchNumber})`,
      category: NotificationCategory.INVENTORY,
      priority: NotificationPriority.MEDIUM,
      requiredPermission: 'inventory:view',
      eventType: NotificationEventType.PRODUCTION_IN,
      resourceType: NotificationResourceType.INVENTORY,
      resourceId: data.transactionId,
      actionUrl: `/inventory/finished-goods`,
      actionLabel: 'Lihat Stok',
      metadata: data,
    });
  }

  // ============================================
  // === WAREHOUSE MODULE - REPACKING ===
  // ============================================

  // ============================================
  // === PRODUCTION MODULE - FORMULA EVENTS ===
  // ============================================

  /**
   * Emit MATERIAL_RATIO_CHANGED notification (CRITICAL)
   */

  // ============================================
  // === PRODUCTION MODULE - BATCH EVENTS (ADDITIONAL) ===
  // ============================================

  /**
   * Emit BATCH_CANCELLED notification (HIGH)
   */
  /**
   * Emit BATCH_CREATED notification (MEDIUM)
   */
  async emitBatchCreated(data: {
    batchId: number;
    batchNumber: string;
    productName: string;
    plannedQuantity: number;
  }) {
    await this.notificationsService.create({
      title: 'Batch Produksi Dibuat',
      message: `Batch ${data.batchNumber} (${data.productName}) telah dibuat. Planned Qty: ${data.plannedQuantity}`,
      category: NotificationCategory.PRODUCTION,
      priority: NotificationPriority.MEDIUM,
      requiredPermission: 'batch:view',
      eventType: NotificationEventType.BATCH_CREATED,
      resourceType: NotificationResourceType.BATCH,
      resourceId: data.batchId,
      actionUrl: `/batches/${data.batchId}`,
      actionLabel: 'Lihat Detail',
      metadata: data,
    });
  }

  /**
   * Emit BATCH_COMPLETED notification (HIGH)
   */
  async emitBatchCompleted(data: {
    batchId: number;
    batchNumber: string;
    productName: string;
    actualQuantity: number;
    qcPassedQuantity: number;
  }) {
    await this.notificationsService.create({
      title: 'Batch Produksi Selesai',
      message: `Batch ${data.batchNumber} (${data.productName}) selesai - QC Pass: ${data.qcPassedQuantity} unit`,
      category: NotificationCategory.PRODUCTION,
      priority: NotificationPriority.HIGH,
      requiredPermission: 'batch:view',
      eventType: NotificationEventType.BATCH_COMPLETED,
      resourceType: NotificationResourceType.BATCH,
      resourceId: data.batchId,
      actionUrl: `/batches/${data.batchId}`,
      actionLabel: 'Lihat Detail',
      metadata: data,
    });
  }

  /**
   * Emit BATCH_CANCELLED notification (HIGH)
   */
  async emitBatchCancelled(data: {
    batchId: number;
    batchNumber: string;
    cancellationReason: string;
  }) {
    await this.notificationsService.create({
      title: 'Batch Dibatalkan ⚠️',
      message: `Batch ${data.batchNumber} telah dibatalkan: ${data.cancellationReason}`,
      category: NotificationCategory.PRODUCTION,
      priority: NotificationPriority.HIGH,
      requiredPermission: 'batch:view',
      eventType: NotificationEventType.BATCH_CANCELLED,
      resourceType: NotificationResourceType.BATCH,
      resourceId: data.batchId,
      actionUrl: `/batches/${data.batchId}`,
      actionLabel: 'Lihat Detail',
      metadata: data,
    });
  }

  /**
   * Emit MATERIAL_SHORTAGE notification (CRITICAL)
   */
  async emitMaterialShortage(data: {
    batchId: number;
    batchNumber: string;
    insufficientMaterials: Array<{
      materialName: string;
      required: number;
      available: number;
      shortage: number;
    }>;
  }) {
    const materialsText = data.insufficientMaterials
      .map(
        (m) =>
          `${m.materialName}: kurang ${m.shortage} (required: ${m.required}, tersedia: ${m.available})`,
      )
      .join(', ');

    await this.notificationsService.create({
      title: '🔴 Material Tidak Cukup!',
      message: `Batch ${data.batchNumber} tidak bisa dimulai - ${materialsText}`,
      category: NotificationCategory.ALERT,
      priority: NotificationPriority.CRITICAL,
      requiredPermission: 'batch:view',
      eventType: NotificationEventType.MATERIAL_SHORTAGE,
      resourceType: NotificationResourceType.BATCH,
      resourceId: data.batchId,
      actionUrl: `/batches/${data.batchId}`,
      actionLabel: 'Restock Material',
      metadata: data,
    });
  }

  /**
   * Emit WASTE_ABOVE_THRESHOLD notification (CRITICAL)
   */

  // ============================================
  // === USER & PERMISSION MODULE ===
  // ============================================

  /**
   * Emit LOGIN_FAILED_MULTIPLE notification (HIGH)
   */
  async emitLoginFailedMultiple(data: {
    email: string;
    attemptCount: number;
    ipAddress: string;
  }) {
    await this.notificationsService.create({
      title: 'Login Gagal Berulang ⚠️',
      message: `User ${data.email} gagal login ${data.attemptCount}x dalam 5 menit dari IP ${data.ipAddress} (Potential security threat)`,
      category: NotificationCategory.ALERT,
      priority: NotificationPriority.HIGH,
      requiredPermission: undefined, // System admins will see this via PBAC in service
      eventType: NotificationEventType.LOGIN_FAILED_MULTIPLE,
      resourceType: NotificationResourceType.USER,
      resourceId: null,
      actionUrl: null,
      actionLabel: 'Investigate',
      metadata: data,
    });
  }

  // ============================================
  // === SYSTEM MODULE ===
  // ============================================

  /**
   * Emit SYSTEM_ERROR notification (CRITICAL)
   */
  async emitSystemError(data: {
    errorMessage: string;
    stackTrace?: string;
    affectedModule: string;
  }) {
    await this.notificationsService.create({
      title: '🔴 System Error!',
      message: `Aplikasi mengalami error di ${data.affectedModule}: ${data.errorMessage}`,
      category: NotificationCategory.ALERT,
      priority: NotificationPriority.CRITICAL,
      requiredPermission: undefined, // System admins will see this
      eventType: NotificationEventType.SYSTEM_ERROR,
      resourceType: NotificationResourceType.SETTING,
      resourceId: null,
      actionUrl: null,
      actionLabel: 'Contact Support',
      metadata: data,
    });
  }

  /**
   * Emit REDIS_CONNECTION_LOST notification (CRITICAL)
   */
  async emitRedisConnectionLost() {
    await this.notificationsService.create({
      title: '🔴 Redis Connection Lost!',
      message: 'Cache service tidak tersedia - performance degraded',
      category: NotificationCategory.ALERT,
      priority: NotificationPriority.CRITICAL,
      requiredPermission: undefined, // System admins
      eventType: NotificationEventType.REDIS_CONNECTION_LOST,
      resourceType: NotificationResourceType.SETTING,
      resourceId: null,
      actionUrl: null,
      actionLabel: 'Restart Redis',
      metadata: {},
    });
  }

  /**
   * Emit DATABASE_CONNECTION_LOST notification (CRITICAL)
   */
  async emitDatabaseConnectionLost() {
    await this.notificationsService.create({
      title: '🔴 Database Connection Lost!',
      message: 'Database tidak dapat diakses - EMERGENCY PROTOCOL',
      category: NotificationCategory.ALERT,
      priority: NotificationPriority.CRITICAL,
      requiredPermission: undefined, // System admins
      eventType: NotificationEventType.DATABASE_CONNECTION_LOST,
      resourceType: NotificationResourceType.SETTING,
      resourceId: null,
      actionUrl: null,
      actionLabel: 'Emergency Protocol',
      metadata: {},
    });
  }
}
