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
  // Customer Management (4 events)
  CUSTOMER_CREATED = 'CUSTOMER_CREATED', // LOW
  CUSTOMER_UPDATED = 'CUSTOMER_UPDATED', // LOW
  CUSTOMER_DELETED = 'CUSTOMER_DELETED', // MEDIUM
  CUSTOMER_CATALOG_UPDATED = 'CUSTOMER_CATALOG_UPDATED', // MEDIUM

  // Order Management (8 events)
  ORDER_CREATED = 'ORDER_CREATED', // HIGH
  ORDER_UPDATED = 'ORDER_UPDATED', // MEDIUM
  ORDER_CANCELLED = 'ORDER_CANCELLED', // HIGH
  ORDER_STATUS_CHANGED = 'ORDER_STATUS_CHANGED', // MEDIUM
  INVOICE_GENERATED = 'INVOICE_GENERATED', // MEDIUM
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED', // MEDIUM
  PAYMENT_OVERDUE = 'PAYMENT_OVERDUE', // HIGH (scheduled)
  ORDER_DELIVERED = 'ORDER_DELIVERED', // MEDIUM

  // Report Generation (2 events)
  REPORT_GENERATED = 'REPORT_GENERATED', // LOW
  REPORT_FAILED = 'REPORT_FAILED', // HIGH

  // === WAREHOUSE MODULE (19 events) ===
  // Product Management (6 events)
  PRODUCT_CREATED = 'PRODUCT_CREATED', // LOW
  PRODUCT_UPDATED = 'PRODUCT_UPDATED', // LOW
  PRODUCT_DELETED = 'PRODUCT_DELETED', // MEDIUM
  PRODUCT_CODE_CREATED = 'PRODUCT_CODE_CREATED', // LOW
  PRODUCT_CODE_CHANGED = 'PRODUCT_CODE_CHANGED', // HIGH
  PRODUCT_PRICE_UPDATED = 'PRODUCT_PRICE_UPDATED', // MEDIUM

  // Inventory Transactions (10 events)
  STOCK_OUT = 'STOCK_OUT', // CRITICAL
  STOCK_LOW = 'STOCK_LOW', // HIGH
  PRODUCTION_IN = 'PRODUCTION_IN', // MEDIUM
  SALE = 'SALE', // MEDIUM
  REPACK_IN = 'REPACK_IN', // MEDIUM
  REPACK_OUT = 'REPACK_OUT', // MEDIUM
  SAMPLE_OUT = 'SAMPLE_OUT', // MEDIUM
  WASTE = 'WASTE', // HIGH
  ADJUSTMENT = 'ADJUSTMENT', // HIGH
  STOCK_MISMATCH = 'STOCK_MISMATCH', // CRITICAL

  // Repacking Operations (3 events)
  REPACK_CREATED = 'REPACK_CREATED', // MEDIUM
  REPACK_COMPLETED = 'REPACK_COMPLETED', // MEDIUM
  REPACK_FAILED = 'REPACK_FAILED', // HIGH

  // === PRODUCTION MODULE (16 events) ===
  // Formula Management (5 events)
  FORMULA_CREATED = 'FORMULA_CREATED', // MEDIUM
  FORMULA_UPDATED = 'FORMULA_UPDATED', // HIGH
  FORMULA_ACTIVATED = 'FORMULA_ACTIVATED', // HIGH
  FORMULA_VERSION_CHANGED = 'FORMULA_VERSION_CHANGED', // HIGH
  MATERIAL_RATIO_CHANGED = 'MATERIAL_RATIO_CHANGED', // CRITICAL

  // Production Batch (11 events)
  BATCH_CREATED = 'BATCH_CREATED', // MEDIUM
  BATCH_STARTED = 'BATCH_STARTED', // HIGH
  BATCH_STAGE_COMPLETED = 'BATCH_STAGE_COMPLETED', // MEDIUM
  QC_PENDING = 'QC_PENDING', // HIGH
  QC_PASSED = 'QC_PASSED', // HIGH
  QC_FAILED = 'QC_FAILED', // CRITICAL
  BATCH_COMPLETED = 'BATCH_COMPLETED', // HIGH
  BATCH_CANCELLED = 'BATCH_CANCELLED', // HIGH
  MATERIAL_SHORTAGE = 'MATERIAL_SHORTAGE', // CRITICAL
  YIELD_BELOW_THRESHOLD = 'YIELD_BELOW_THRESHOLD', // HIGH
  WASTE_ABOVE_THRESHOLD = 'WASTE_ABOVE_THRESHOLD', // CRITICAL

  // === USER & PERMISSION MODULE (9 events) ===
  // User Management (7 events)
  USER_CREATED = 'USER_CREATED', // LOW
  USER_UPDATED = 'USER_UPDATED', // LOW
  USER_DELETED = 'USER_DELETED', // MEDIUM
  USER_ACTIVATED = 'USER_ACTIVATED', // MEDIUM
  USER_DEACTIVATED = 'USER_DEACTIVATED', // MEDIUM
  ROLE_ASSIGNED = 'ROLE_ASSIGNED', // MEDIUM
  PASSWORD_CHANGED = 'PASSWORD_CHANGED', // MEDIUM

  // Permission Management (2 events)
  PERMISSION_CHANGED = 'PERMISSION_CHANGED', // HIGH
  LOGIN_FAILED_MULTIPLE = 'LOGIN_FAILED_MULTIPLE', // HIGH

  // === SYSTEM MODULE (5 events) ===
  DATABASE_BACKUP = 'DATABASE_BACKUP', // LOW
  SYSTEM_ERROR = 'SYSTEM_ERROR', // CRITICAL
  HIGH_API_USAGE = 'HIGH_API_USAGE', // HIGH
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

    // Real-time delivery via WebSocket will be handled by service
    console.log(
      `✅ ORDER_CREATED notification sent for order ${data.orderNumber}`,
    );
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

    console.log(
      `✅ ORDER_CANCELLED notification sent for order ${data.orderNumber}`,
    );
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

    console.log(
      `🔴 CRITICAL: STOCK_OUT notification sent for ${data.productCode}`,
    );
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

    console.log(`⚠️ STOCK_LOW notification sent for ${data.productCode}`);
  }

  /**
   * Emit WASTE_CREATED notification (HIGH)
   */
  async emitWasteCreated(data: {
    productId: number;
    productCode: string;
    productName: string;
    quantity: number;
    reason: string;
  }) {
    await this.notificationsService.create({
      title: 'Barang Rusak/Kadaluarsa',
      message: `${data.productName} (${data.productCode}) waste ${data.quantity} unit - ${data.reason}`,
      category: NotificationCategory.INVENTORY,
      priority: NotificationPriority.HIGH,
      requiredPermission: 'inventory:view',
      eventType: NotificationEventType.WASTE_CREATED,
      resourceType: NotificationResourceType.INVENTORY,
      resourceId: data.productId,
      actionUrl: `/inventory/finished-goods`,
      actionLabel: 'Lihat Detail',
      metadata: data,
    });

    console.log(`✅ WASTE_CREATED notification sent for ${data.productCode}`);
  }

  /**
   * Emit QC_PENDING notification (HIGH)
   */
  async emitQCPending(data: {
    batchId: number;
    batchNumber: string;
    productName: string;
    plannedQuantity: number;
  }) {
    await this.notificationsService.create({
      title: 'QC Pending',
      message: `Batch ${data.batchNumber} (${data.productName}) menunggu QC approval - Qty: ${data.plannedQuantity}`,
      category: NotificationCategory.PRODUCTION,
      priority: NotificationPriority.HIGH,
      requiredPermission: 'batch:view',
      eventType: NotificationEventType.QC_PENDING,
      resourceType: NotificationResourceType.BATCH,
      resourceId: data.batchId,
      actionUrl: `/batches/${data.batchId}`,
      actionLabel: 'Review QC',
      metadata: data,
    });

    console.log(
      `✅ QC_PENDING notification sent for batch ${data.batchNumber}`,
    );
  }

  /**
   * Emit QC_FAILED notification (CRITICAL)
   */
  async emitQCFailed(data: {
    batchId: number;
    batchNumber: string;
    productName: string;
    qcNotes: string;
  }) {
    await this.notificationsService.create({
      title: '🔴 QC Failed!',
      message: `Batch ${data.batchNumber} (${data.productName}) GAGAL QC - ${data.qcNotes}`,
      category: NotificationCategory.PRODUCTION,
      priority: NotificationPriority.CRITICAL,
      requiredPermission: 'batch:view',
      eventType: NotificationEventType.QC_FAILED,
      resourceType: NotificationResourceType.BATCH,
      resourceId: data.batchId,
      actionUrl: `/batches/${data.batchId}`,
      actionLabel: 'Lihat Detail',
      metadata: data,
    });

    console.log(
      `🔴 CRITICAL: QC_FAILED notification sent for batch ${data.batchNumber}`,
    );
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

    console.log(
      `✅ BATCH_COMPLETED notification sent for batch ${data.batchNumber}`,
    );
  }

  // ============================================
  // === SALES MODULE - ADDITIONAL EVENTS ===
  // ============================================

  /**
   * Emit CUSTOMER_CREATED notification (LOW)
   */
  async emitCustomerCreated(data: {
    customerId: number;
    customerCode: string;
    customerName: string;
  }) {
    await this.notificationsService.create({
      title: 'Pelanggan Baru Terdaftar',
      message: `${data.customerName} (${data.customerCode}) telah ditambahkan ke sistem`,
      category: NotificationCategory.SALES,
      priority: NotificationPriority.LOW,
      requiredPermission: 'customer:view',
      eventType: NotificationEventType.CUSTOMER_CREATED,
      resourceType: NotificationResourceType.CUSTOMER,
      resourceId: data.customerId,
      actionUrl: `/customers/${data.customerId}`,
      actionLabel: 'Lihat Data Customer',
      metadata: data,
    });

    console.log(
      `✅ CUSTOMER_CREATED notification sent for ${data.customerCode}`,
    );
  }

  /**
   * Emit CUSTOMER_UPDATED notification (LOW)
   */
  async emitCustomerUpdated(data: {
    customerId: number;
    customerName: string;
  }) {
    await this.notificationsService.create({
      title: 'Data Pelanggan Diperbarui',
      message: `Informasi ${data.customerName} telah diupdate`,
      category: NotificationCategory.SALES,
      priority: NotificationPriority.LOW,
      requiredPermission: 'customer:view',
      eventType: NotificationEventType.CUSTOMER_UPDATED,
      resourceType: NotificationResourceType.CUSTOMER,
      resourceId: data.customerId,
      actionUrl: `/customers/${data.customerId}`,
      actionLabel: 'Lihat Perubahan',
      metadata: data,
    });

    console.log(
      `✅ CUSTOMER_UPDATED notification sent for ${data.customerName}`,
    );
  }

  /**
   * Emit CUSTOMER_DELETED notification (MEDIUM)
   */
  async emitCustomerDeleted(data: { customerName: string }) {
    await this.notificationsService.create({
      title: 'Pelanggan Dihapus',
      message: `${data.customerName} telah dihapus dari sistem`,
      category: NotificationCategory.SALES,
      priority: NotificationPriority.MEDIUM,
      requiredPermission: 'customer:view',
      eventType: NotificationEventType.CUSTOMER_DELETED,
      resourceType: NotificationResourceType.CUSTOMER,
      resourceId: null,
      actionUrl: null,
      actionLabel: null,
      metadata: data,
    });

    console.log(
      `✅ CUSTOMER_DELETED notification sent for ${data.customerName}`,
    );
  }

  /**
   * Emit CUSTOMER_CATALOG_UPDATED notification (MEDIUM)
   */
  async emitCustomerCatalogUpdated(data: {
    customerId: number;
    customerName: string;
    updatedProductsCount: number;
  }) {
    await this.notificationsService.create({
      title: 'Katalog Harga Pelanggan Diperbarui',
      message: `Harga khusus untuk ${data.customerName} telah diupdate (${data.updatedProductsCount} produk)`,
      category: NotificationCategory.SALES,
      priority: NotificationPriority.MEDIUM,
      requiredPermission: 'customer:view',
      eventType: NotificationEventType.CUSTOMER_CATALOG_UPDATED,
      resourceType: NotificationResourceType.CUSTOMER,
      resourceId: data.customerId,
      actionUrl: `/customers/${data.customerId}`,
      actionLabel: 'Lihat Katalog',
      metadata: data,
    });

    console.log(
      `✅ CUSTOMER_CATALOG_UPDATED notification sent for ${data.customerName}`,
    );
  }

  /**
   * Emit ORDER_UPDATED notification (MEDIUM)
   */
  async emitOrderUpdated(data: { orderId: number; orderNumber: string }) {
    await this.notificationsService.create({
      title: 'Pesanan Diperbarui',
      message: `Order ${data.orderNumber} telah diupdate`,
      category: NotificationCategory.SALES,
      priority: NotificationPriority.MEDIUM,
      requiredPermission: 'order:view',
      eventType: NotificationEventType.ORDER_UPDATED,
      resourceType: NotificationResourceType.ORDER,
      resourceId: data.orderId,
      actionUrl: `/orders/${data.orderId}`,
      actionLabel: 'Lihat Perubahan',
      metadata: data,
    });

    console.log(
      `✅ ORDER_UPDATED notification sent for order ${data.orderNumber}`,
    );
  }

  /**
   * Emit ORDER_STATUS_CHANGED notification (MEDIUM)
   */
  async emitOrderStatusChanged(data: {
    orderId: number;
    orderNumber: string;
    oldStatus: string;
    newStatus: string;
  }) {
    await this.notificationsService.create({
      title: 'Status Pesanan Berubah',
      message: `Order ${data.orderNumber} status: ${data.oldStatus} → ${data.newStatus}`,
      category: NotificationCategory.SALES,
      priority: NotificationPriority.MEDIUM,
      requiredPermission: 'order:view',
      eventType: NotificationEventType.ORDER_STATUS_CHANGED,
      resourceType: NotificationResourceType.ORDER,
      resourceId: data.orderId,
      actionUrl: `/orders/${data.orderId}`,
      actionLabel: 'Lihat Order',
      metadata: data,
    });

    console.log(
      `✅ ORDER_STATUS_CHANGED notification sent for order ${data.orderNumber}`,
    );
  }

  /**
   * Emit INVOICE_GENERATED notification (MEDIUM)
   */
  async emitInvoiceGenerated(data: {
    orderId: number;
    orderNumber: string;
    invoiceNumber: string;
  }) {
    await this.notificationsService.create({
      title: 'Invoice Dibuat',
      message: `Invoice ${data.invoiceNumber} untuk order ${data.orderNumber} telah digenerate`,
      category: NotificationCategory.SALES,
      priority: NotificationPriority.MEDIUM,
      requiredPermission: 'order:view',
      eventType: NotificationEventType.INVOICE_GENERATED,
      resourceType: NotificationResourceType.ORDER,
      resourceId: data.orderId,
      actionUrl: `/orders/${data.orderId}`,
      actionLabel: 'Lihat Invoice',
      metadata: data,
    });

    console.log(
      `✅ INVOICE_GENERATED notification sent: ${data.invoiceNumber}`,
    );
  }

  /**
   * Emit PAYMENT_RECEIVED notification (MEDIUM)
   */
  async emitPaymentReceived(data: {
    orderId: number;
    orderNumber: string;
    amount: number;
    totalPaid: number;
    grandTotal: number;
  }) {
    await this.notificationsService.create({
      title: 'Pembayaran Diterima 💰',
      message: `Order ${data.orderNumber}: Rp ${data.amount.toLocaleString('id-ID')} telah dibayarkan (Total: Rp ${data.totalPaid.toLocaleString('id-ID')} / Rp ${data.grandTotal.toLocaleString('id-ID')})`,
      category: NotificationCategory.SALES,
      priority: NotificationPriority.MEDIUM,
      requiredPermission: 'order:view',
      eventType: NotificationEventType.PAYMENT_RECEIVED,
      resourceType: NotificationResourceType.ORDER,
      resourceId: data.orderId,
      actionUrl: `/orders/${data.orderId}`,
      actionLabel: 'Lihat Detail',
      metadata: data,
    });

    console.log(
      `✅ PAYMENT_RECEIVED notification sent for order ${data.orderNumber}`,
    );
  }

  /**
   * Emit PAYMENT_OVERDUE notification (HIGH)
   */
  async emitPaymentOverdue(data: {
    orderId: number;
    orderNumber: string;
    customerName: string;
    daysOverdue: number;
    remainingAmount: number;
  }) {
    await this.notificationsService.create({
      title: 'Pembayaran Jatuh Tempo ⏰',
      message: `Order ${data.orderNumber} (${data.customerName}) telah melewati jatuh tempo ${data.daysOverdue} hari - Sisa: Rp ${data.remainingAmount.toLocaleString('id-ID')}`,
      category: NotificationCategory.SALES,
      priority: NotificationPriority.HIGH,
      requiredPermission: 'order:view',
      eventType: NotificationEventType.PAYMENT_OVERDUE,
      resourceType: NotificationResourceType.ORDER,
      resourceId: data.orderId,
      actionUrl: `/orders/${data.orderId}`,
      actionLabel: 'Tindak Lanjut',
      metadata: data,
    });

    console.log(
      `⚠️ PAYMENT_OVERDUE notification sent for order ${data.orderNumber}`,
    );
  }

  /**
   * Emit ORDER_DELIVERED notification (MEDIUM)
   */
  async emitOrderDelivered(data: {
    orderId: number;
    orderNumber: string;
    customerName: string;
  }) {
    await this.notificationsService.create({
      title: 'Pesanan Terkirim 🚚',
      message: `Order ${data.orderNumber} telah sampai ke ${data.customerName}`,
      category: NotificationCategory.SALES,
      priority: NotificationPriority.MEDIUM,
      requiredPermission: 'order:view',
      eventType: NotificationEventType.ORDER_DELIVERED,
      resourceType: NotificationResourceType.ORDER,
      resourceId: data.orderId,
      actionUrl: `/orders/${data.orderId}`,
      actionLabel: 'Lihat Order',
      metadata: data,
    });

    console.log(
      `✅ ORDER_DELIVERED notification sent for order ${data.orderNumber}`,
    );
  }

  /**
   * Emit REPORT_GENERATED notification (LOW)
   */
  async emitReportGenerated(data: {
    reportId: number;
    reportName: string;
    period: string;
    downloadUrl: string;
  }) {
    await this.notificationsService.create({
      title: 'Laporan Siap Diunduh',
      message: `Laporan ${data.reportName} untuk periode ${data.period} telah selesai`,
      category: NotificationCategory.SYSTEM,
      priority: NotificationPriority.LOW,
      requiredPermission: 'report:view',
      eventType: NotificationEventType.REPORT_GENERATED,
      resourceType: NotificationResourceType.REPORT,
      resourceId: data.reportId,
      actionUrl: data.downloadUrl,
      actionLabel: 'Unduh Laporan',
      metadata: data,
    });

    console.log(`✅ REPORT_GENERATED notification sent: ${data.reportName}`);
  }

  /**
   * Emit REPORT_FAILED notification (HIGH)
   */
  async emitReportFailed(data: {
    reportName: string;
    period: string;
    error: string;
  }) {
    await this.notificationsService.create({
      title: 'Pembuatan Laporan Gagal',
      message: `Laporan ${data.reportName} untuk periode ${data.period} gagal dibuat: ${data.error}`,
      category: NotificationCategory.SYSTEM,
      priority: NotificationPriority.HIGH,
      requiredPermission: 'report:view',
      eventType: NotificationEventType.REPORT_FAILED,
      resourceType: NotificationResourceType.REPORT,
      resourceId: null,
      actionUrl: null,
      actionLabel: 'Coba Lagi',
      metadata: data,
    });

    console.log(`⚠️ REPORT_FAILED notification sent for ${data.reportName}`);
  }

  // ============================================
  // === WAREHOUSE MODULE - PRODUCT EVENTS ===
  // ============================================

  /**
   * Emit PRODUCT_CREATED notification (LOW)
   */
  async emitProductCreated(data: {
    productId: number;
    productCode: string;
    productName: string;
    category: string;
  }) {
    await this.notificationsService.create({
      title: 'Produk Baru Ditambahkan',
      message: `${data.productName} (${data.productCode}) telah ditambahkan ke katalog`,
      category: NotificationCategory.INVENTORY,
      priority: NotificationPriority.LOW,
      requiredPermission: 'product:view',
      eventType: NotificationEventType.PRODUCT_CREATED,
      resourceType: NotificationResourceType.PRODUCT,
      resourceId: data.productId,
      actionUrl: `/products/${data.category.toLowerCase().replace(/\s+/g, '-')}`,
      actionLabel: 'Lihat Produk',
      metadata: data,
    });

    console.log(`✅ PRODUCT_CREATED notification sent for ${data.productCode}`);
  }

  /**
   * Emit PRODUCT_UPDATED notification (LOW)
   */
  async emitProductUpdated(data: {
    productId: number;
    productName: string;
    category: string;
  }) {
    await this.notificationsService.create({
      title: 'Produk Diperbarui',
      message: `${data.productName} telah diupdate`,
      category: NotificationCategory.INVENTORY,
      priority: NotificationPriority.LOW,
      requiredPermission: 'product:view',
      eventType: NotificationEventType.PRODUCT_UPDATED,
      resourceType: NotificationResourceType.PRODUCT,
      resourceId: data.productId,
      actionUrl: `/products/${data.category.toLowerCase().replace(/\s+/g, '-')}`,
      actionLabel: 'Lihat Perubahan',
      metadata: data,
    });

    console.log(`✅ PRODUCT_UPDATED notification sent for ${data.productName}`);
  }

  /**
   * Emit PRODUCT_DELETED notification (MEDIUM)
   */
  async emitProductDeleted(data: { productName: string }) {
    await this.notificationsService.create({
      title: 'Produk Dihapus',
      message: `${data.productName} telah dihapus dari sistem`,
      category: NotificationCategory.INVENTORY,
      priority: NotificationPriority.MEDIUM,
      requiredPermission: 'product:view',
      eventType: NotificationEventType.PRODUCT_DELETED,
      resourceType: NotificationResourceType.PRODUCT,
      resourceId: null,
      actionUrl: null,
      actionLabel: null,
      metadata: data,
    });

    console.log(`✅ PRODUCT_DELETED notification sent for ${data.productName}`);
  }

  /**
   * Emit PRODUCT_CODE_CREATED notification (LOW)
   */
  async emitProductCodeCreated(data: {
    productCodeId: number;
    productName: string;
    productCode: string;
    sizeValue: string;
    category: string;
  }) {
    await this.notificationsService.create({
      title: 'Varian Produk Ditambahkan',
      message: `${data.productName} (${data.sizeValue}) - ${data.productCode} berhasil ditambahkan`,
      category: NotificationCategory.INVENTORY,
      priority: NotificationPriority.LOW,
      requiredPermission: 'product:view',
      eventType: NotificationEventType.PRODUCT_CODE_CREATED,
      resourceType: NotificationResourceType.PRODUCT,
      resourceId: data.productCodeId,
      actionUrl: `/products/${data.category.toLowerCase().replace(/\s+/g, '-')}`,
      actionLabel: 'Lihat Varian',
      metadata: data,
    });

    console.log(
      `✅ PRODUCT_CODE_CREATED notification sent for ${data.productCode}`,
    );
  }

  /**
   * Emit PRODUCT_CODE_CHANGED notification (HIGH)
   */
  async emitProductCodeChanged(data: {
    productCodeId: number;
    productName: string;
    oldCode: string;
    newCode: string;
    category: string;
  }) {
    await this.notificationsService.create({
      title: 'Kode Produk Berubah ⚠️',
      message: `${data.productName}: ${data.oldCode} → ${data.newCode} (Affects orders, inventory, formulas)`,
      category: NotificationCategory.INVENTORY,
      priority: NotificationPriority.HIGH,
      requiredPermission: 'product:view',
      eventType: NotificationEventType.PRODUCT_CODE_CHANGED,
      resourceType: NotificationResourceType.PRODUCT,
      resourceId: data.productCodeId,
      actionUrl: `/products/${data.category.toLowerCase().replace(/\s+/g, '-')}`,
      actionLabel: 'Verifikasi Perubahan',
      metadata: data,
    });

    console.log(
      `⚠️ PRODUCT_CODE_CHANGED notification sent: ${data.oldCode} → ${data.newCode}`,
    );
  }

  /**
   * Emit PRODUCT_PRICE_UPDATED notification (MEDIUM)
   */
  async emitProductPriceUpdated(data: {
    productCodeId: number;
    productName: string;
    oldPrice: number;
    newPrice: number;
    category: string;
  }) {
    await this.notificationsService.create({
      title: 'Harga Produk Diperbarui',
      message: `${data.productName}: Rp ${data.oldPrice.toLocaleString('id-ID')} → Rp ${data.newPrice.toLocaleString('id-ID')}`,
      category: NotificationCategory.INVENTORY,
      priority: NotificationPriority.MEDIUM,
      requiredPermission: 'product:view',
      eventType: NotificationEventType.PRODUCT_PRICE_UPDATED,
      resourceType: NotificationResourceType.PRODUCT,
      resourceId: data.productCodeId,
      actionUrl: `/products/${data.category.toLowerCase().replace(/\s+/g, '-')}`,
      actionLabel: 'Lihat Produk',
      metadata: data,
    });

    console.log(
      `✅ PRODUCT_PRICE_UPDATED notification sent for ${data.productName}`,
    );
  }

  // ============================================
  // === WAREHOUSE MODULE - INVENTORY TRANSACTIONS ===
  // ============================================

  /**
   * Emit PRODUCTION_IN notification (MEDIUM)
   */
  async emitProductionIn(data: {
    transactionId: number;
    productName: string;
    productCode: string;
    quantity: number;
    batchNumber: string;
  }) {
    await this.notificationsService.create({
      title: 'Barang Jadi Masuk Gudang',
      message: `${data.productName} (+${data.quantity}) dari batch ${data.batchNumber}`,
      category: NotificationCategory.INVENTORY,
      priority: NotificationPriority.MEDIUM,
      requiredPermission: 'inventory:view',
      eventType: NotificationEventType.PRODUCTION_IN,
      resourceType: NotificationResourceType.INVENTORY,
      resourceId: data.transactionId,
      actionUrl: `/inventory/finished-goods`,
      actionLabel: 'Lihat Inventory',
      metadata: data,
    });

    console.log(`✅ PRODUCTION_IN notification sent for ${data.productCode}`);
  }

  /**
   * Emit SALE notification (MEDIUM)
   */
  async emitSale(data: {
    transactionId: number;
    productName: string;
    productCode: string;
    quantity: number;
    orderNumber: string;
  }) {
    await this.notificationsService.create({
      title: 'Barang Keluar (Penjualan)',
      message: `${data.productName} (-${data.quantity}) untuk order ${data.orderNumber}`,
      category: NotificationCategory.INVENTORY,
      priority: NotificationPriority.MEDIUM,
      requiredPermission: 'inventory:view',
      eventType: NotificationEventType.SALE,
      resourceType: NotificationResourceType.INVENTORY,
      resourceId: data.transactionId,
      actionUrl: `/orders/${data.orderNumber}`,
      actionLabel: 'Lihat Order',
      metadata: data,
    });

    console.log(`✅ SALE notification sent for ${data.productCode}`);
  }

  /**
   * Emit REPACK_IN notification (MEDIUM)
   */
  async emitRepackIn(data: {
    transactionId: number;
    targetProduct: string;
    quantity: number;
    sourceProduct: string;
  }) {
    await this.notificationsService.create({
      title: 'Repack Selesai',
      message: `${data.targetProduct} (+${data.quantity}) dari ${data.sourceProduct}`,
      category: NotificationCategory.INVENTORY,
      priority: NotificationPriority.MEDIUM,
      requiredPermission: 'inventory:view',
      eventType: NotificationEventType.REPACK_IN,
      resourceType: NotificationResourceType.INVENTORY,
      resourceId: data.transactionId,
      actionUrl: `/inventory/finished-goods`,
      actionLabel: 'Lihat Detail',
      metadata: data,
    });

    console.log(`✅ REPACK_IN notification sent for ${data.targetProduct}`);
  }

  /**
   * Emit REPACK_OUT notification (MEDIUM)
   */
  async emitRepackOut(data: {
    transactionId: number;
    sourceProduct: string;
    quantity: number;
  }) {
    await this.notificationsService.create({
      title: 'Material Repack Terpakai',
      message: `${data.sourceProduct} (-${data.quantity}) untuk repack`,
      category: NotificationCategory.INVENTORY,
      priority: NotificationPriority.MEDIUM,
      requiredPermission: 'inventory:view',
      eventType: NotificationEventType.REPACK_OUT,
      resourceType: NotificationResourceType.INVENTORY,
      resourceId: data.transactionId,
      actionUrl: `/inventory/finished-goods`,
      actionLabel: 'Lihat Detail',
      metadata: data,
    });

    console.log(`✅ REPACK_OUT notification sent for ${data.sourceProduct}`);
  }

  /**
   * Emit SAMPLE_OUT notification (MEDIUM)
   */
  async emitSampleOut(data: {
    transactionId: number;
    productName: string;
    quantity: number;
    recipientName: string;
  }) {
    await this.notificationsService.create({
      title: 'Sample Keluar',
      message: `${data.productName} (-${data.quantity}) untuk ${data.recipientName}`,
      category: NotificationCategory.INVENTORY,
      priority: NotificationPriority.MEDIUM,
      requiredPermission: 'inventory:view',
      eventType: NotificationEventType.SAMPLE_OUT,
      resourceType: NotificationResourceType.INVENTORY,
      resourceId: data.transactionId,
      actionUrl: `/inventory/finished-goods`,
      actionLabel: 'Lihat Detail',
      metadata: data,
    });

    console.log(`✅ SAMPLE_OUT notification sent for ${data.productName}`);
  }

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

    console.log(`⚠️ WASTE notification sent for ${data.productCode}`);
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

    console.log(`⚠️ ADJUSTMENT notification sent for ${data.productCode}`);
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

    console.log(
      `🔴 CRITICAL: STOCK_MISMATCH notification sent for ${data.productCode}`,
    );
  }

  // ============================================
  // === WAREHOUSE MODULE - REPACKING ===
  // ============================================

  /**
   * Emit REPACK_CREATED notification (MEDIUM)
   */
  async emitRepackCreated(data: {
    repackId: number;
    sourceProduct: string;
    targetProduct: string;
    quantity: number;
  }) {
    await this.notificationsService.create({
      title: 'Repack Dimulai',
      message: `${data.sourceProduct} → ${data.targetProduct} (${data.quantity} unit)`,
      category: NotificationCategory.INVENTORY,
      priority: NotificationPriority.MEDIUM,
      requiredPermission: 'inventory:repack',
      eventType: NotificationEventType.REPACK_CREATED,
      resourceType: NotificationResourceType.INVENTORY,
      resourceId: data.repackId,
      actionUrl: `/inventory/finished-goods`,
      actionLabel: 'Lihat Progress',
      metadata: data,
    });

    console.log(`✅ REPACK_CREATED notification sent`);
  }

  /**
   * Emit REPACK_COMPLETED notification (MEDIUM)
   */
  async emitRepackCompleted(data: {
    repackId: number;
    targetProduct: string;
    quantity: number;
  }) {
    await this.notificationsService.create({
      title: 'Repack Selesai ✅',
      message: `${data.targetProduct} berhasil dikemas ulang (${data.quantity} unit)`,
      category: NotificationCategory.INVENTORY,
      priority: NotificationPriority.MEDIUM,
      requiredPermission: 'inventory:repack',
      eventType: NotificationEventType.REPACK_COMPLETED,
      resourceType: NotificationResourceType.INVENTORY,
      resourceId: data.repackId,
      actionUrl: `/inventory/finished-goods`,
      actionLabel: 'Lihat Hasil',
      metadata: data,
    });

    console.log(`✅ REPACK_COMPLETED notification sent`);
  }

  /**
   * Emit REPACK_FAILED notification (HIGH)
   */
  async emitRepackFailed(data: {
    repackId: number;
    sourceProduct: string;
    targetProduct: string;
    failureReason: string;
  }) {
    await this.notificationsService.create({
      title: 'Repack Gagal ⚠️',
      message: `${data.sourceProduct} → ${data.targetProduct} gagal: ${data.failureReason}`,
      category: NotificationCategory.INVENTORY,
      priority: NotificationPriority.HIGH,
      requiredPermission: 'inventory:repack',
      eventType: NotificationEventType.REPACK_FAILED,
      resourceType: NotificationResourceType.INVENTORY,
      resourceId: data.repackId,
      actionUrl: `/inventory/finished-goods`,
      actionLabel: 'Tindak Lanjut',
      metadata: data,
    });

    console.log(`⚠️ REPACK_FAILED notification sent`);
  }

  // ============================================
  // === PRODUCTION MODULE - FORMULA EVENTS ===
  // ============================================

  /**
   * Emit FORMULA_CREATED notification (MEDIUM)
   */
  async emitFormulaCreated(data: {
    formulaId: number;
    productName: string;
    version: string;
  }) {
    await this.notificationsService.create({
      title: 'Formula Baru Dibuat',
      message: `Formula untuk ${data.productName} v${data.version} telah dibuat`,
      category: NotificationCategory.PRODUCTION,
      priority: NotificationPriority.MEDIUM,
      requiredPermission: 'formula:view',
      eventType: NotificationEventType.FORMULA_CREATED,
      resourceType: NotificationResourceType.FORMULA,
      resourceId: data.formulaId,
      actionUrl: `/formulas/${data.formulaId}`,
      actionLabel: 'Lihat Formula',
      metadata: data,
    });

    console.log(`✅ FORMULA_CREATED notification sent for ${data.productName}`);
  }

  /**
   * Emit FORMULA_UPDATED notification (HIGH)
   */
  async emitFormulaUpdated(data: {
    formulaId: number;
    productName: string;
    version: string;
  }) {
    await this.notificationsService.create({
      title: 'Formula Diperbarui ⚠️',
      message: `${data.productName} formula v${data.version} telah diupdate (Affects future batches)`,
      category: NotificationCategory.PRODUCTION,
      priority: NotificationPriority.HIGH,
      requiredPermission: 'formula:view',
      eventType: NotificationEventType.FORMULA_UPDATED,
      resourceType: NotificationResourceType.FORMULA,
      resourceId: data.formulaId,
      actionUrl: `/formulas/${data.formulaId}`,
      actionLabel: 'Lihat Perubahan',
      metadata: data,
    });

    console.log(`⚠️ FORMULA_UPDATED notification sent for ${data.productName}`);
  }

  /**
   * Emit FORMULA_ACTIVATED notification (HIGH)
   */
  async emitFormulaActivated(data: {
    formulaId: number;
    productName: string;
    version: string;
  }) {
    await this.notificationsService.create({
      title: 'Formula Diaktifkan',
      message: `${data.productName} v${data.version} sekarang aktif (Batch baru akan menggunakan formula ini)`,
      category: NotificationCategory.PRODUCTION,
      priority: NotificationPriority.HIGH,
      requiredPermission: 'formula:view',
      eventType: NotificationEventType.FORMULA_ACTIVATED,
      resourceType: NotificationResourceType.FORMULA,
      resourceId: data.formulaId,
      actionUrl: `/formulas/${data.formulaId}`,
      actionLabel: 'Lihat Formula',
      metadata: data,
    });

    console.log(
      `✅ FORMULA_ACTIVATED notification sent for ${data.productName}`,
    );
  }

  /**
   * Emit FORMULA_VERSION_CHANGED notification (HIGH)
   */
  async emitFormulaVersionChanged(data: {
    formulaId: number;
    productName: string;
    oldVersion: string;
    newVersion: string;
  }) {
    await this.notificationsService.create({
      title: 'Versi Formula Berubah',
      message: `${data.productName}: v${data.oldVersion} → v${data.newVersion}`,
      category: NotificationCategory.PRODUCTION,
      priority: NotificationPriority.HIGH,
      requiredPermission: 'formula:view',
      eventType: NotificationEventType.FORMULA_VERSION_CHANGED,
      resourceType: NotificationResourceType.FORMULA,
      resourceId: data.formulaId,
      actionUrl: `/formulas/${data.formulaId}`,
      actionLabel: 'Lihat Changes',
      metadata: data,
    });

    console.log(
      `⚠️ FORMULA_VERSION_CHANGED notification sent for ${data.productName}`,
    );
  }

  /**
   * Emit MATERIAL_RATIO_CHANGED notification (CRITICAL)
   */
  async emitMaterialRatioChanged(data: {
    formulaId: number;
    productName: string;
    materialName: string;
    oldRatio: number;
    newRatio: number;
  }) {
    await this.notificationsService.create({
      title: '🔴 Rasio Material Berubah!',
      message: `${data.productName} formula: ${data.materialName} ratio ${data.oldRatio} → ${data.newRatio} (Cost & quality impact)`,
      category: NotificationCategory.PRODUCTION,
      priority: NotificationPriority.CRITICAL,
      requiredPermission: 'formula:view',
      eventType: NotificationEventType.MATERIAL_RATIO_CHANGED,
      resourceType: NotificationResourceType.FORMULA,
      resourceId: data.formulaId,
      actionUrl: `/formulas/${data.formulaId}`,
      actionLabel: 'Verifikasi Segera',
      metadata: data,
    });

    console.log(
      `🔴 CRITICAL: MATERIAL_RATIO_CHANGED notification sent for ${data.productName}`,
    );
  }

  // ============================================
  // === PRODUCTION MODULE - BATCH EVENTS (ADDITIONAL) ===
  // ============================================

  /**
   * Emit BATCH_CREATED notification (MEDIUM)
   */
  async emitBatchCreated(data: {
    batchId: number;
    batchNumber: string;
    productName: string;
    targetLiters: number;
  }) {
    await this.notificationsService.create({
      title: 'Batch Produksi Dibuat',
      message: `Batch ${data.batchNumber} untuk ${data.productName} (${data.targetLiters}L)`,
      category: NotificationCategory.PRODUCTION,
      priority: NotificationPriority.MEDIUM,
      requiredPermission: 'batch:view',
      eventType: NotificationEventType.BATCH_CREATED,
      resourceType: NotificationResourceType.BATCH,
      resourceId: data.batchId,
      actionUrl: `/batches/${data.batchId}`,
      actionLabel: 'Lihat Batch',
      metadata: data,
    });

    console.log(
      `✅ BATCH_CREATED notification sent for batch ${data.batchNumber}`,
    );
  }

  /**
   * Emit BATCH_STARTED notification (HIGH)
   */
  async emitBatchStarted(data: {
    batchId: number;
    batchNumber: string;
    productName: string;
  }) {
    await this.notificationsService.create({
      title: 'Batch Dimulai 🚀',
      message: `Batch ${data.batchNumber} (${data.productName}) telah dimulai`,
      category: NotificationCategory.PRODUCTION,
      priority: NotificationPriority.HIGH,
      requiredPermission: 'batch:view',
      eventType: NotificationEventType.BATCH_STARTED,
      resourceType: NotificationResourceType.BATCH,
      resourceId: data.batchId,
      actionUrl: `/batches/${data.batchId}`,
      actionLabel: 'Monitor Progress',
      metadata: data,
    });

    console.log(
      `✅ BATCH_STARTED notification sent for batch ${data.batchNumber}`,
    );
  }

  /**
   * Emit BATCH_STAGE_COMPLETED notification (MEDIUM)
   */
  async emitBatchStageCompleted(data: {
    batchId: number;
    batchNumber: string;
    stageName: string;
  }) {
    await this.notificationsService.create({
      title: 'Stage Selesai',
      message: `Batch ${data.batchNumber}: ${data.stageName} completed`,
      category: NotificationCategory.PRODUCTION,
      priority: NotificationPriority.MEDIUM,
      requiredPermission: 'batch:view',
      eventType: NotificationEventType.BATCH_STAGE_COMPLETED,
      resourceType: NotificationResourceType.BATCH,
      resourceId: data.batchId,
      actionUrl: `/batches/${data.batchId}`,
      actionLabel: 'Lanjut ke Stage Berikutnya',
      metadata: data,
    });

    console.log(
      `✅ BATCH_STAGE_COMPLETED notification sent for batch ${data.batchNumber}`,
    );
  }

  /**
   * Emit QC_PASSED notification (HIGH)
   */
  async emitQCPassed(data: {
    batchId: number;
    batchNumber: string;
    productName: string;
    qcNotes: string;
  }) {
    await this.notificationsService.create({
      title: 'QC Lolos ✅',
      message: `Batch ${data.batchNumber} (${data.productName}) telah lolos quality control (Inventory akan diupdate otomatis)`,
      category: NotificationCategory.PRODUCTION,
      priority: NotificationPriority.HIGH,
      requiredPermission: 'batch:view',
      eventType: NotificationEventType.QC_PASSED,
      resourceType: NotificationResourceType.BATCH,
      resourceId: data.batchId,
      actionUrl: `/batches/${data.batchId}`,
      actionLabel: 'Lihat Detail',
      metadata: data,
    });

    console.log(`✅ QC_PASSED notification sent for batch ${data.batchNumber}`);
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

    console.log(
      `⚠️ BATCH_CANCELLED notification sent for batch ${data.batchNumber}`,
    );
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

    console.log(
      `🔴 CRITICAL: MATERIAL_SHORTAGE notification sent for batch ${data.batchNumber}`,
    );
  }

  /**
   * Emit YIELD_BELOW_THRESHOLD notification (HIGH)
   */
  async emitYieldBelowThreshold(data: {
    batchId: number;
    batchNumber: string;
    actualYield: number;
    targetYield: number;
  }) {
    await this.notificationsService.create({
      title: 'Yield Di Bawah Target ⚠️',
      message: `Batch ${data.batchNumber}: Yield ${data.actualYield}% (target: ${data.targetYield}%)`,
      category: NotificationCategory.PRODUCTION,
      priority: NotificationPriority.HIGH,
      requiredPermission: 'batch:view',
      eventType: NotificationEventType.YIELD_BELOW_THRESHOLD,
      resourceType: NotificationResourceType.BATCH,
      resourceId: data.batchId,
      actionUrl: `/batches/${data.batchId}`,
      actionLabel: 'Analisis Penyebab',
      metadata: data,
    });

    console.log(
      `⚠️ YIELD_BELOW_THRESHOLD notification sent for batch ${data.batchNumber}`,
    );
  }

  /**
   * Emit WASTE_ABOVE_THRESHOLD notification (CRITICAL)
   */
  async emitWasteAboveThreshold(data: {
    batchId: number;
    batchNumber: string;
    wastePercentage: number;
    maxThreshold: number;
  }) {
    await this.notificationsService.create({
      title: '🔴 Waste Tinggi!',
      message: `Batch ${data.batchNumber}: Waste ${data.wastePercentage}% (max: ${data.maxThreshold}%)`,
      category: NotificationCategory.ALERT,
      priority: NotificationPriority.CRITICAL,
      requiredPermission: 'batch:view',
      eventType: NotificationEventType.WASTE_ABOVE_THRESHOLD,
      resourceType: NotificationResourceType.BATCH,
      resourceId: data.batchId,
      actionUrl: `/batches/${data.batchId}`,
      actionLabel: 'Investigasi Segera',
      metadata: data,
    });

    console.log(
      `🔴 CRITICAL: WASTE_ABOVE_THRESHOLD notification sent for batch ${data.batchNumber}`,
    );
  }

  // ============================================
  // === USER & PERMISSION MODULE ===
  // ============================================

  /**
   * Emit USER_CREATED notification (LOW)
   */
  async emitUserCreated(data: {
    userId: number;
    userName: string;
    email: string;
  }) {
    await this.notificationsService.create({
      title: 'User Baru Ditambahkan',
      message: `${data.userName} (${data.email}) telah didaftarkan`,
      category: NotificationCategory.SYSTEM,
      priority: NotificationPriority.LOW,
      requiredPermission: 'user:view',
      eventType: NotificationEventType.USER_CREATED,
      resourceType: NotificationResourceType.USER,
      resourceId: data.userId,
      actionUrl: `/users/${data.userId}`,
      actionLabel: 'Lihat User',
      metadata: data,
    });

    console.log(`✅ USER_CREATED notification sent for ${data.userName}`);
  }

  /**
   * Emit USER_UPDATED notification (LOW)
   */
  async emitUserUpdated(data: { userId: number; userName: string }) {
    await this.notificationsService.create({
      title: 'Data User Diperbarui',
      message: `${data.userName} telah diupdate`,
      category: NotificationCategory.SYSTEM,
      priority: NotificationPriority.LOW,
      requiredPermission: 'user:view',
      eventType: NotificationEventType.USER_UPDATED,
      resourceType: NotificationResourceType.USER,
      resourceId: data.userId,
      actionUrl: `/users/${data.userId}`,
      actionLabel: 'Lihat Perubahan',
      metadata: data,
    });

    console.log(`✅ USER_UPDATED notification sent for ${data.userName}`);
  }

  /**
   * Emit USER_DELETED notification (MEDIUM)
   */
  async emitUserDeleted(data: { userName: string }) {
    await this.notificationsService.create({
      title: 'User Dihapus',
      message: `${data.userName} telah dihapus dari sistem`,
      category: NotificationCategory.SYSTEM,
      priority: NotificationPriority.MEDIUM,
      requiredPermission: 'user:view',
      eventType: NotificationEventType.USER_DELETED,
      resourceType: NotificationResourceType.USER,
      resourceId: null,
      actionUrl: null,
      actionLabel: null,
      metadata: data,
    });

    console.log(`✅ USER_DELETED notification sent for ${data.userName}`);
  }

  /**
   * Emit USER_ACTIVATED notification (MEDIUM)
   */
  async emitUserActivated(data: { userId: number; userName: string }) {
    await this.notificationsService.create({
      title: 'User Diaktifkan',
      message: `${data.userName} sekarang dapat mengakses sistem`,
      category: NotificationCategory.SYSTEM,
      priority: NotificationPriority.MEDIUM,
      requiredPermission: 'user:view',
      eventType: NotificationEventType.USER_ACTIVATED,
      resourceType: NotificationResourceType.USER,
      resourceId: data.userId,
      actionUrl: `/users/${data.userId}`,
      actionLabel: 'Lihat User',
      metadata: data,
    });

    console.log(`✅ USER_ACTIVATED notification sent for ${data.userName}`);
  }

  /**
   * Emit USER_DEACTIVATED notification (MEDIUM)
   */
  async emitUserDeactivated(data: { userId: number; userName: string }) {
    await this.notificationsService.create({
      title: 'User Dinonaktifkan',
      message: `${data.userName} tidak dapat login`,
      category: NotificationCategory.SYSTEM,
      priority: NotificationPriority.MEDIUM,
      requiredPermission: 'user:view',
      eventType: NotificationEventType.USER_DEACTIVATED,
      resourceType: NotificationResourceType.USER,
      resourceId: data.userId,
      actionUrl: `/users/${data.userId}`,
      actionLabel: 'Lihat User',
      metadata: data,
    });

    console.log(`✅ USER_DEACTIVATED notification sent for ${data.userName}`);
  }

  /**
   * Emit ROLE_ASSIGNED notification (MEDIUM)
   */
  async emitRoleAssigned(data: {
    userId: number;
    userName: string;
    oldRole: string;
    newRole: string;
  }) {
    await this.notificationsService.create({
      title: 'Role User Berubah',
      message: `${data.userName}: ${data.oldRole} → ${data.newRole}`,
      category: NotificationCategory.SYSTEM,
      priority: NotificationPriority.MEDIUM,
      requiredPermission: 'user:view',
      eventType: NotificationEventType.ROLE_ASSIGNED,
      resourceType: NotificationResourceType.USER,
      resourceId: data.userId,
      actionUrl: `/users/${data.userId}`,
      actionLabel: 'Lihat Permission',
      metadata: data,
    });

    console.log(`✅ ROLE_ASSIGNED notification sent for ${data.userName}`);
  }

  /**
   * Emit PASSWORD_CHANGED notification (MEDIUM)
   */
  async emitPasswordChanged(data: { userId: number; userName: string }) {
    await this.notificationsService.create({
      title: 'Password Berhasil Diubah',
      message: `Password Anda telah diperbarui`,
      category: NotificationCategory.SYSTEM,
      priority: NotificationPriority.MEDIUM,
      requiredPermission: null, // Self-notification, no permission required
      eventType: NotificationEventType.PASSWORD_CHANGED,
      resourceType: NotificationResourceType.USER,
      resourceId: data.userId,
      actionUrl: null,
      actionLabel: null,
      metadata: data,
    });

    console.log(`✅ PASSWORD_CHANGED notification sent for ${data.userName}`);
  }

  /**
   * Emit PERMISSION_CHANGED notification (HIGH)
   */
  async emitPermissionChanged(data: {
    roleId: number;
    roleName: string;
    addedPermissions: string[];
    removedPermissions: string[];
    affectedUserCount: number;
  }) {
    await this.notificationsService.create({
      title: 'Permission Role Diubah ⚠️',
      message: `Role ${data.roleName}: ${data.addedPermissions.length} added, ${data.removedPermissions.length} removed (Affects ${data.affectedUserCount} users)`,
      category: NotificationCategory.SYSTEM,
      priority: NotificationPriority.HIGH,
      requiredPermission: 'permission:view',
      eventType: NotificationEventType.PERMISSION_CHANGED,
      resourceType: NotificationResourceType.ROLE,
      resourceId: data.roleId,
      actionUrl: `/roles/${data.roleId}`,
      actionLabel: 'Review Changes',
      metadata: data,
    });

    console.log(
      `⚠️ PERMISSION_CHANGED notification sent for role ${data.roleName}`,
    );
  }

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
      requiredPermission: null, // System admins will see this via PBAC in service
      eventType: NotificationEventType.LOGIN_FAILED_MULTIPLE,
      resourceType: NotificationResourceType.USER,
      resourceId: null,
      actionUrl: null,
      actionLabel: 'Investigate',
      metadata: data,
    });

    console.log(`⚠️ LOGIN_FAILED_MULTIPLE notification sent for ${data.email}`);
  }

  // ============================================
  // === SYSTEM MODULE ===
  // ============================================

  /**
   * Emit DATABASE_BACKUP notification (LOW)
   */
  async emitDatabaseBackup(data: {
    backupSize: string;
    backupDuration: string;
  }) {
    await this.notificationsService.create({
      title: 'Backup Database Selesai',
      message: `Backup harian berhasil dilakukan (${data.backupSize}, duration: ${data.backupDuration})`,
      category: NotificationCategory.SYSTEM,
      priority: NotificationPriority.LOW,
      requiredPermission: 'setting:view',
      eventType: NotificationEventType.DATABASE_BACKUP,
      resourceType: NotificationResourceType.SETTING,
      resourceId: null,
      actionUrl: null,
      actionLabel: null,
      metadata: data,
    });

    console.log(`✅ DATABASE_BACKUP notification sent`);
  }

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
      requiredPermission: null, // System admins will see this
      eventType: NotificationEventType.SYSTEM_ERROR,
      resourceType: NotificationResourceType.SETTING,
      resourceId: null,
      actionUrl: null,
      actionLabel: 'Contact Support',
      metadata: data,
    });

    console.log(
      `🔴 CRITICAL: SYSTEM_ERROR notification sent for ${data.affectedModule}`,
    );
  }

  /**
   * Emit HIGH_API_USAGE notification (HIGH)
   */
  async emitHighAPIUsage(data: {
    currentUsage: number;
    maxLimit: number;
    percentageUsed: number;
  }) {
    await this.notificationsService.create({
      title: 'Penggunaan API Tinggi ⚠️',
      message: `Rate limit mendekati maksimum (${data.percentageUsed}%: ${data.currentUsage} / ${data.maxLimit})`,
      category: NotificationCategory.ALERT,
      priority: NotificationPriority.HIGH,
      requiredPermission: 'setting:view',
      eventType: NotificationEventType.HIGH_API_USAGE,
      resourceType: NotificationResourceType.SETTING,
      resourceId: null,
      actionUrl: null,
      actionLabel: 'Monitor',
      metadata: data,
    });

    console.log(`⚠️ HIGH_API_USAGE notification sent`);
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
      requiredPermission: null, // System admins
      eventType: NotificationEventType.REDIS_CONNECTION_LOST,
      resourceType: NotificationResourceType.SETTING,
      resourceId: null,
      actionUrl: null,
      actionLabel: 'Restart Redis',
      metadata: {},
    });

    console.log(`🔴 CRITICAL: REDIS_CONNECTION_LOST notification sent`);
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
      requiredPermission: null, // System admins
      eventType: NotificationEventType.DATABASE_CONNECTION_LOST,
      resourceType: NotificationResourceType.SETTING,
      resourceId: null,
      actionUrl: null,
      actionLabel: 'Emergency Protocol',
      metadata: {},
    });

    console.log(`🔴 CRITICAL: DATABASE_CONNECTION_LOST notification sent`);
  }
}
