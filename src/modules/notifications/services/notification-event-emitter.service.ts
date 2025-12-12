import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { NotificationsService } from '../notifications.service';
import { NotificationsGateway } from '../notifications.gateway';
import {
  NotificationCategory,
  NotificationPriority,
  NotificationResourceType,
} from '../entities/notification.entity';

/**
 * Notification Event Types (MVP - Critical Events Only)
 */
export enum NotificationEventType {
  // Orders (HIGH priority)
  ORDER_CREATED = 'ORDER_CREATED',
  ORDER_CANCELLED = 'ORDER_CANCELLED',

  // Inventory (CRITICAL & HIGH)
  STOCK_OUT = 'STOCK_OUT', // CRITICAL
  STOCK_LOW = 'STOCK_LOW', // HIGH
  WASTE_CREATED = 'WASTE_CREATED', // HIGH

  // Production (CRITICAL & HIGH)
  QC_PENDING = 'QC_PENDING', // HIGH
  QC_FAILED = 'QC_FAILED', // CRITICAL
  BATCH_COMPLETED = 'BATCH_COMPLETED', // HIGH
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
}
