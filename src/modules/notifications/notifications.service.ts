import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In } from 'typeorm';
import BaseResponse from '../../common/response/base.response';
import {
  ResponseSuccess,
  ResponsePagination,
} from '../../common/interface/response.interface';
import {
  Notification,
  NotificationPriority,
} from './entities/notification.entity';
import { NotificationRead } from './entities/notification-read.entity';
import {
  CreateNotificationDto,
  FilterNotificationDto,
} from './dto/notification.dto';
import { NotificationNumberGenerator } from './utils/notification-number.generator';
import { Users } from '../users/entities/users.entity';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService extends BaseResponse {
  constructor(
    @InjectRepository(Notification)
    private notificationRepo: Repository<Notification>,
    @InjectRepository(NotificationRead)
    private notificationReadRepo: Repository<NotificationRead>,
    @InjectRepository(Users)
    private userRepo: Repository<Users>,
    @Inject(forwardRef(() => NotificationsGateway))
    private notificationsGateway: NotificationsGateway,
  ) {
    super();
  }

  /**
   * Create a new notification and auto-assign to eligible users (PBAC-filtered)
   */
  async create(dto: CreateNotificationDto): Promise<ResponseSuccess> {
    // Generate notification number
    const lastNotification = await this.notificationRepo
      .createQueryBuilder('notification')
      .orderBy('notification.createdAt', 'DESC')
      .getOne();

    const sequence = await NotificationNumberGenerator.getNextSequence(
      lastNotification?.notificationNumber || null,
    );
    const notificationNumber = NotificationNumberGenerator.generate(
      new Date(),
      sequence,
    );

    // Set default expiration (30 days for LOW/MEDIUM, 90 days for HIGH/CRITICAL)
    let expiresAt = null;
    if (
      dto.priority === NotificationPriority.LOW ||
      dto.priority === NotificationPriority.MEDIUM
    ) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
    } else {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 90);
    }

    // Create notification
    const notification = this.notificationRepo.create({
      ...dto,
      notificationNumber,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : expiresAt,
    });

    const savedNotification = await this.notificationRepo.save(notification);

    // Get eligible users based on permission
    const eligibleUsers = await this.getEligibleUsers(dto.requiredPermission);

    // Create notification_reads records for each eligible user
    const notificationReads = eligibleUsers.map((user) =>
      this.notificationReadRepo.create({
        notificationId: savedNotification.id,
        userId: user.id,
      }),
    );

    await this.notificationReadRepo.save(notificationReads);

    // Emit to WebSocket for real-time delivery
    await this.notificationsGateway.notifyMultipleUsers(
      eligibleUsers.map((u) => u.id),
      savedNotification,
    );

    return this._success('Notification created successfully', {
      notification: savedNotification,
      recipientCount: eligibleUsers.length,
    });
  }

  /**
   * Get notifications for a specific user (PBAC-filtered)
   */
  async getUserNotifications(
    userId: number,
    filter: FilterNotificationDto,
  ): Promise<ResponsePagination> {
    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const skip = (page - 1) * limit;

    // Build query
    const query = this.notificationReadRepo
      .createQueryBuilder('nr')
      .leftJoinAndSelect('nr.notification', 'n')
      .where('nr.userId = :userId', { userId })
      .andWhere('nr.deletedAt IS NULL')
      .andWhere('(n.expiresAt IS NULL OR n.expiresAt > NOW())');

    // Filter by category
    if (filter.category) {
      query.andWhere('n.category = :category', { category: filter.category });
    }

    // Filter by priority
    if (filter.priority) {
      query.andWhere('n.priority = :priority', { priority: filter.priority });
    }

    // Filter by status
    if (filter.status) {
      switch (filter.status) {
        case 'unread':
          query.andWhere('nr.isRead = FALSE');
          break;
        case 'read':
          query.andWhere('nr.isRead = TRUE');
          break;
        case 'acknowledged':
          query.andWhere('nr.isAcknowledged = TRUE');
          break;
        // 'all' - no additional filter
      }
    }

    // Search in title and message
    if (filter.search) {
      query.andWhere('(n.title LIKE :search OR n.message LIKE :search)', {
        search: `%${filter.search}%`,
      });
    }

    // Date range filter
    if (filter.startDate) {
      query.andWhere('n.createdAt >= :startDate', {
        startDate: new Date(filter.startDate),
      });
    }
    if (filter.endDate) {
      query.andWhere('n.createdAt <= :endDate', {
        endDate: new Date(filter.endDate),
      });
    }

    // Order by priority (CRITICAL first) then createdAt (newest first)
    query.orderBy('n.priority', 'ASC'); // CRITICAL=1, HIGH=2, MEDIUM=3, LOW=4
    query.addOrderBy('n.createdAt', 'DESC');

    // Pagination
    const [results, total] = await query
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    // Transform NotificationRead to Notification with read status
    const notifications = results.map((nr) => ({
      ...nr.notification,
      isRead: nr.isRead,
      readAt: nr.readAt,
      isAcknowledged: nr.isAcknowledged,
      acknowledgedAt: nr.acknowledgedAt,
    }));

    return this._pagination(
      'Notifications retrieved successfully',
      notifications,
      total,
      page,
      limit,
    );
  }

  /**
   * Get unread notification count for user
   */
  async getUnreadCount(userId: number): Promise<ResponseSuccess> {
    const count = await this.notificationReadRepo.count({
      where: {
        userId,
        isRead: false,
        deletedAt: IsNull(),
      },
      relations: ['notification'],
    });

    return this._success('Unread count retrieved', { count });
  }

  /**
   * Mark notification as read
   */
  async markAsRead(
    userId: number,
    notificationId: number,
  ): Promise<ResponseSuccess> {
    const notificationRead = await this.notificationReadRepo.findOne({
      where: {
        userId,
        notificationId,
        deletedAt: IsNull(),
      },
    });

    if (!notificationRead) {
      throw new NotFoundException('Notification not found');
    }

    if (notificationRead.isRead) {
      return this._success('Notification already marked as read');
    }

    notificationRead.isRead = true;
    notificationRead.readAt = new Date();

    await this.notificationReadRepo.save(notificationRead);

    return this._success('Notification marked as read');
  }

  /**
   * Mark all notifications as read for user
   */
  async markAllAsRead(userId: number): Promise<ResponseSuccess> {
    const unreadNotifications = await this.notificationReadRepo.find({
      where: {
        userId,
        isRead: false,
        deletedAt: IsNull(),
      },
    });

    if (unreadNotifications.length === 0) {
      return this._success('No unread notifications');
    }

    const now = new Date();
    unreadNotifications.forEach((nr) => {
      nr.isRead = true;
      nr.readAt = now;
    });

    await this.notificationReadRepo.save(unreadNotifications);

    return this._success(
      `${unreadNotifications.length} notifications marked as read`,
    );
  }

  /**
   * Acknowledge CRITICAL notification
   */
  async acknowledge(
    userId: number,
    notificationId: number,
  ): Promise<ResponseSuccess> {
    const notificationRead = await this.notificationReadRepo.findOne({
      where: {
        userId,
        notificationId,
        deletedAt: IsNull(),
      },
      relations: ['notification'],
    });

    if (!notificationRead) {
      throw new NotFoundException('Notification not found');
    }

    if (
      notificationRead.notification.priority !== NotificationPriority.CRITICAL
    ) {
      throw new BadRequestException(
        'Only CRITICAL notifications require acknowledgment',
      );
    }

    if (notificationRead.isAcknowledged) {
      return this._success('Notification already acknowledged');
    }

    notificationRead.isAcknowledged = true;
    notificationRead.acknowledgedAt = new Date();

    // Auto-mark as read when acknowledging
    if (!notificationRead.isRead) {
      notificationRead.isRead = true;
      notificationRead.readAt = new Date();
    }

    await this.notificationReadRepo.save(notificationRead);

    return this._success('Notification acknowledged');
  }

  /**
   * Soft delete notification (user dismissal)
   */
  async deleteNotification(
    userId: number,
    notificationId: number,
  ): Promise<ResponseSuccess> {
    const notificationRead = await this.notificationReadRepo.findOne({
      where: {
        userId,
        notificationId,
        deletedAt: IsNull(),
      },
      relations: ['notification'],
    });

    if (!notificationRead) {
      throw new NotFoundException('Notification not found');
    }

    // Prevent deletion of unacknowledged CRITICAL notifications
    if (
      notificationRead.notification.priority ===
        NotificationPriority.CRITICAL &&
      !notificationRead.isAcknowledged
    ) {
      throw new BadRequestException(
        'Cannot delete CRITICAL notification without acknowledgment',
      );
    }

    await this.notificationReadRepo.softDelete(notificationRead.id);

    return this._success('Notification deleted');
  }

  /**
   * Delete all read notifications for user
   */
  async deleteAllRead(userId: number): Promise<ResponseSuccess> {
    const readNotifications = await this.notificationReadRepo.find({
      where: {
        userId,
        isRead: true,
        deletedAt: IsNull(),
      },
    });

    if (readNotifications.length === 0) {
      return this._success('No read notifications to delete');
    }

    await this.notificationReadRepo.softDelete(
      readNotifications.map((nr) => nr.id),
    );

    return this._success(`${readNotifications.length} notifications deleted`);
  }

  /**
   * Get eligible users based on permission (PBAC filtering)
   * If no permission required, return all active users
   */
  private async getEligibleUsers(
    requiredPermission?: string,
  ): Promise<Users[]> {
    if (!requiredPermission) {
      // No permission required - visible to all authenticated users
      return this.userRepo.find({
        where: { isActive: true },
      });
    }

    // Get users with the required permission
    const users = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'role')
      .leftJoinAndSelect('role.permissions', 'permission')
      .where('user.isActive = :isActive', { isActive: true })
      .andWhere('permission.name = :permission', {
        permission: requiredPermission,
      })
      .getMany();

    return users;
  }

  /**
   * Clean up expired notifications (scheduled job)
   */
  async cleanupExpiredNotifications(): Promise<void> {
    const expiredNotifications = await this.notificationRepo.find({
      where: {
        expiresAt: IsNull(),
      },
    });

    // Soft delete expired notification_reads
    for (const notification of expiredNotifications) {
      await this.notificationReadRepo
        .createQueryBuilder()
        .softDelete()
        .where('notificationId = :id', { id: notification.id })
        .execute();
    }

    console.log(
      `Cleaned up ${expiredNotifications.length} expired notifications`,
    );
  }
}
