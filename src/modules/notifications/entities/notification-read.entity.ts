import {
  Entity,
  Column,
  Index,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Notification } from './notification.entity';
import { Users } from '../../users/entities/users.entity';

/**
 * NotificationRead Entity
 *
 * Tracks per-user read/acknowledge status for notifications.
 *
 * Business Rules:
 * - One record per user per notification
 * - Soft delete via deletedAt (user dismissal)
 * - Acknowledgment required for CRITICAL notifications
 * - Synced across devices via WebSocket
 */
@Entity({ name: 'notification_reads', synchronize: true })
@Index('idx_notification_reads_unique', ['notificationId', 'userId'], {
  unique: true,
})
@Index('idx_notification_reads_user_read', ['userId', 'isRead'])
@Index('idx_notification_reads_user_unread', ['userId', 'isRead', 'createdAt'])
export class NotificationRead {
  @PrimaryGeneratedColumn('increment', { type: 'bigint', unsigned: true })
  id: number;

  // References
  @Column({
    type: 'bigint',
    unsigned: true,
    comment: 'FK to notifications table',
  })
  notificationId: number;

  @ManyToOne(() => Notification, (notification) => notification.reads, {
    onDelete: 'CASCADE',
    eager: true,
  })
  @JoinColumn({ name: 'notificationId' })
  notification: Notification;

  @Column({
    type: 'int',
    comment: 'FK to users table',
  })
  userId: number;

  @ManyToOne(() => Users, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: Users;

  // Read Status
  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether notification has been read',
  })
  isRead: boolean;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'When notification was marked as read',
  })
  readAt: Date | null;

  // Acknowledgment (for CRITICAL notifications)
  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether CRITICAL notification has been acknowledged',
  })
  isAcknowledged: boolean;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'When notification was acknowledged',
  })
  acknowledgedAt: Date | null;

  // Soft Delete
  @DeleteDateColumn({
    type: 'timestamp',
    nullable: true,
    comment: 'Soft delete timestamp (NULL = active)',
  })
  deletedAt: Date | null;

  // Audit
  @CreateDateColumn({
    type: 'timestamp',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamp',
  })
  updatedAt: Date;

  /**
   * Check if notification is dismissed (soft deleted)
   */
  get isDismissed(): boolean {
    return this.deletedAt !== null;
  }

  /**
   * Check if notification needs acknowledgment
   */
  get needsAcknowledgment(): boolean {
    return (
      this.notification.requiresAcknowledgment &&
      !this.isAcknowledged &&
      !this.isDismissed
    );
  }
}
