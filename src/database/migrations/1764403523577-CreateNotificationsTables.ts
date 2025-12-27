import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

/**
 * Migration: Create Notifications Tables
 *
 * Creates tables for real-time notification system:
 * - notifications: System-wide notification events
 * - notification_reads: Per-user read/acknowledge status
 *
 * Features:
 * - PBAC integration (required_permission column)
 * - Priority-based delivery (CRITICAL, HIGH, MEDIUM, LOW)
 * - Category filtering (SALES, INVENTORY, PRODUCTION, SYSTEM, ALERT)
 * - Deep linking (action_url for navigation)
 * - Auto-archiving (expires_at timestamp)
 */
export class CreateNotificationsTables1764403523577
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ==================== 1. CREATE NOTIFICATIONS TABLE ====================
    await queryRunner.createTable(
      new Table({
        name: 'notifications',
        columns: [
          {
            name: 'id',
            type: 'bigint',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
            unsigned: true,
          },
          // Notification Identity
          {
            name: 'notificationNumber',
            type: 'varchar',
            length: '50',
            isUnique: true,
            isNullable: false,
            comment: 'Unique notification number (e.g., NOTIF-20250129-001)',
          },
          // Content
          {
            name: 'title',
            type: 'varchar',
            length: '200',
            isNullable: false,
            comment: 'Notification title (brief summary)',
          },
          {
            name: 'message',
            type: 'text',
            isNullable: false,
            comment: 'Notification message (detailed description)',
          },
          {
            name: 'category',
            type: 'enum',
            enum: ['SALES', 'INVENTORY', 'PRODUCTION', 'SYSTEM', 'ALERT'],
            isNullable: false,
            comment: 'Notification category for filtering',
          },
          {
            name: 'priority',
            type: 'enum',
            enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
            default: "'MEDIUM'",
            isNullable: false,
            comment: 'Notification priority level',
          },
          // PBAC Integration
          {
            name: 'requiredPermission',
            type: 'varchar',
            length: '100',
            isNullable: true,
            comment:
              'Required permission to view (e.g., order:view, NULL = visible to all)',
          },
          // Event Reference
          {
            name: 'eventType',
            type: 'varchar',
            length: '100',
            isNullable: false,
            comment:
              'Event type that triggered notification (e.g., ORDER_CREATED, STOCK_LOW)',
          },
          {
            name: 'resourceType',
            type: 'enum',
            enum: [
              'customer',
              'order',
              'product',
              'inventory',
              'formula',
              'batch',
              'user',
              'system',
            ],
            isNullable: false,
            comment: 'Type of resource related to notification',
          },
          {
            name: 'resourceId',
            type: 'bigint',
            unsigned: true,
            isNullable: true,
            comment: 'ID of related entity (FK to resource table)',
          },
          // Action Link (Deep Linking)
          {
            name: 'actionUrl',
            type: 'varchar',
            length: '500',
            isNullable: true,
            comment:
              'Deep link URL for action (e.g., /orders/123, /batches/456)',
          },
          {
            name: 'actionLabel',
            type: 'varchar',
            length: '100',
            isNullable: true,
            comment: 'Action button label (e.g., View Order, Check Stock)',
          },
          // Metadata
          {
            name: 'metadata',
            type: 'json',
            isNullable: true,
            comment:
              'Additional contextual data (e.g., { orderId: 123, customerName: "Budi" })',
          },
          // Timestamps
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
            comment: 'When notification was created',
          },
          {
            name: 'expiresAt',
            type: 'timestamp',
            isNullable: true,
            comment: 'Auto-archive after this date (NULL = never expires)',
          },
        ],
      }),
      true, // Create table
    );

    // Create Indexes for notifications table
    await queryRunner.createIndex(
      'notifications',
      new TableIndex({
        name: 'idx_notifications_category_priority',
        columnNames: ['category', 'priority'],
      }),
    );

    await queryRunner.createIndex(
      'notifications',
      new TableIndex({
        name: 'idx_notifications_resource',
        columnNames: ['resourceType', 'resourceId'],
      }),
    );

    await queryRunner.createIndex(
      'notifications',
      new TableIndex({
        name: 'idx_notifications_event_type',
        columnNames: ['eventType'],
      }),
    );

    await queryRunner.createIndex(
      'notifications',
      new TableIndex({
        name: 'idx_notifications_created_at',
        columnNames: ['createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'notifications',
      new TableIndex({
        name: 'idx_notifications_expires_at',
        columnNames: ['expiresAt'],
      }),
    );

    // ==================== 2. CREATE NOTIFICATION_READS TABLE ====================
    await queryRunner.createTable(
      new Table({
        name: 'notification_reads',
        columns: [
          {
            name: 'id',
            type: 'bigint',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
            unsigned: true,
          },
          // References
          {
            name: 'notificationId',
            type: 'bigint',
            unsigned: true,
            isNullable: false,
            comment: 'FK to notifications table',
          },
          {
            name: 'userId',
            type: 'int',
            isNullable: false,
            comment: 'FK to users table',
          },
          // Read Status
          {
            name: 'isRead',
            type: 'boolean',
            default: false,
            isNullable: false,
            comment: 'Whether notification has been read',
          },
          {
            name: 'readAt',
            type: 'timestamp',
            isNullable: true,
            comment: 'When notification was marked as read',
          },
          // Acknowledgment (for CRITICAL notifications)
          {
            name: 'isAcknowledged',
            type: 'boolean',
            default: false,
            isNullable: false,
            comment: 'Whether CRITICAL notification has been acknowledged',
          },
          {
            name: 'acknowledgedAt',
            type: 'timestamp',
            isNullable: true,
            comment: 'When notification was acknowledged',
          },
          // Soft Delete
          {
            name: 'deletedAt',
            type: 'timestamp',
            isNullable: true,
            comment: 'Soft delete timestamp (NULL = active)',
          },
          // Audit
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Create Foreign Keys
    await queryRunner.createForeignKey(
      'notification_reads',
      new TableForeignKey({
        columnNames: ['notificationId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'notifications',
        onDelete: 'CASCADE',
        name: 'fk_notification_reads_notification',
      }),
    );

    await queryRunner.createForeignKey(
      'notification_reads',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
        name: 'fk_notification_reads_user',
      }),
    );

    // Create Indexes for notification_reads table
    await queryRunner.createIndex(
      'notification_reads',
      new TableIndex({
        name: 'idx_notification_reads_unique',
        columnNames: ['notificationId', 'userId'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'notification_reads',
      new TableIndex({
        name: 'idx_notification_reads_user_read',
        columnNames: ['userId', 'isRead'],
      }),
    );

    await queryRunner.createIndex(
      'notification_reads',
      new TableIndex({
        name: 'idx_notification_reads_user_unread',
        columnNames: ['userId', 'isRead', 'createdAt'],
      }),
    );

    console.log('✅ Notification tables created successfully');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop Foreign Keys first
    await queryRunner.dropForeignKey(
      'notification_reads',
      'fk_notification_reads_user',
    );
    await queryRunner.dropForeignKey(
      'notification_reads',
      'fk_notification_reads_notification',
    );

    // Drop Tables
    await queryRunner.dropTable('notification_reads', true);
    await queryRunner.dropTable('notifications', true);

    console.log('✅ Notification tables dropped successfully');
  }
}
