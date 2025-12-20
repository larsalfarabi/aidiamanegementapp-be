import {
  Entity,
  Column,
  Index,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { NotificationRead } from './notification-read.entity';

/**
 * Notification Priority Levels (Human-Centered Design)
 */
export enum NotificationPriority {
  CRITICAL = 'CRITICAL', // 🔴 Red, sound alert, requires immediate action
  HIGH = 'HIGH', // 🟠 Orange, visual alert, action within hour
  MEDIUM = 'MEDIUM', // 🟡 Yellow, standard notification
  LOW = 'LOW', // 🔵 Blue, informational only
}

/**
 * Notification Categories
 */
export enum NotificationCategory {
  SALES = 'SALES', // Orders, customers, invoices
  INVENTORY = 'INVENTORY', // Stock, transactions, repacking
  PRODUCTION = 'PRODUCTION', // Batches, formulas, QC
  SYSTEM = 'SYSTEM', // Users, permissions, errors
  ALERT = 'ALERT', // Stock low/out, critical issues
}

/**
 * Resource Types (matches backend Resource enum)
 */
export enum NotificationResourceType {
  CUSTOMER = 'customer',
  ORDER = 'order',
  PRODUCT = 'product',
  INVENTORY = 'inventory',
  FORMULA = 'formula',
  BATCH = 'batch',
  USER = 'user',
  SYSTEM = 'system',
  REPORT = 'report',
  ROLE = 'role',
  SETTING = 'setting',
}

/**
 * Notification Entity
 *
 * Represents system-wide notification events.
 * Immutable once created (soft delete via notification_reads).
 *
 * Business Rules:
 * - Single notification record for all users (efficient storage)
 * - PBAC filtering via requiredPermission column
 * - Priority-based delivery (CRITICAL → LOW)
 * - Deep linking via actionUrl
 * - Auto-archiving via expiresAt
 */
@Entity({ name: 'notifications', synchronize: false })
@Index('idx_notifications_category_priority', ['category', 'priority'])
@Index('idx_notifications_resource', ['resourceType', 'resourceId'])
@Index('idx_notifications_event_type', ['eventType'])
@Index('idx_notifications_created_at', ['createdAt'])
@Index('idx_notifications_expires_at', ['expiresAt'])
export class Notification {
  @PrimaryGeneratedColumn('increment', { type: 'bigint', unsigned: true })
  id: number;

  // Notification Identity
  @Column({
    type: 'varchar',
    unique: true,
    length: 50,
    comment: 'Unique notification number (e.g., NOTIF-20250129-001)',
  })
  notificationNumber: string;

  // Content
  @Column({
    type: 'varchar',
    length: 200,
    comment: 'Notification title (brief summary)',
  })
  title: string;

  @Column({
    type: 'text',
    comment: 'Notification message (detailed description)',
  })
  message: string;

  @Column({
    type: 'enum',
    enum: NotificationCategory,
    comment: 'Notification category for filtering',
  })
  category: NotificationCategory;

  @Column({
    type: 'enum',
    enum: NotificationPriority,
    default: NotificationPriority.MEDIUM,
    comment: 'Notification priority level',
  })
  priority: NotificationPriority;

  // PBAC Integration
  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment:
      'Required permission to view (e.g., order:view, NULL = visible to all)',
  })
  requiredPermission: string | null;

  // Event Reference
  @Column({
    type: 'varchar',
    length: 100,
    comment:
      'Event type that triggered notification (e.g., ORDER_CREATED, STOCK_LOW)',
  })
  eventType: string;

  @Column({
    type: 'enum',
    enum: NotificationResourceType,
    comment: 'Type of resource related to notification',
  })
  resourceType: NotificationResourceType;

  @Column({
    type: 'bigint',
    unsigned: true,
    nullable: true,
    comment: 'ID of related entity (FK to resource table)',
  })
  resourceId: number | null;

  // Action Link (Deep Linking)
  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: 'Deep link URL for action (e.g., /orders/123, /batches/456)',
  })
  actionUrl: string | null;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Action button label (e.g., View Order, Check Stock)',
  })
  actionLabel: string | null;

  // Metadata
  @Column({
    type: 'json',
    nullable: true,
    comment:
      'Additional contextual data (e.g., { orderId: 123, customerName: "Budi" })',
  })
  metadata: object | null;

  // Timestamps
  @CreateDateColumn({
    type: 'timestamp',
    comment: 'When notification was created',
  })
  createdAt: Date;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'Auto-archive after this date (NULL = never expires)',
  })
  expiresAt: Date | null;

  // Relations
  @OneToMany(() => NotificationRead, (read) => read.notification)
  reads: NotificationRead[];

  /**
   * Check if notification is expired
   */
  get isExpired(): boolean {
    if (!this.expiresAt) return false;
    return new Date() > new Date(this.expiresAt);
  }

  /**
   * Check if notification requires acknowledgment
   */
  get requiresAcknowledgment(): boolean {
    return this.priority === NotificationPriority.CRITICAL;
  }
}
