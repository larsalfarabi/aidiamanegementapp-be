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
import { RedisService } from '../redis/redis.service';
import { Logger } from '@nestjs/common';

// ✅ OPTIMIZATION: Configuration constants
const NOTIFICATION_CONFIG = {
  RETRY_MAX_ATTEMPTS: 3,
  RETRY_DELAY_MIN_MS: 50,
  RETRY_DELAY_MAX_MS: 150,
  EXPIRE_DAYS_LOW_PRIORITY: 30,
  EXPIRE_DAYS_HIGH_PRIORITY: 90,
  UNREAD_COUNT_CACHE_TTL: 30, // seconds
} as const;

@Injectable()
export class NotificationsService extends BaseResponse {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private notificationRepo: Repository<Notification>,
    @InjectRepository(NotificationRead)
    private notificationReadRepo: Repository<NotificationRead>,
    @InjectRepository(Users)
    private userRepo: Repository<Users>,
    @Inject(forwardRef(() => NotificationsGateway))
    private notificationsGateway: NotificationsGateway,
    private readonly redisService: RedisService,
  ) {
    super();
  }

  /**
   * Create a new notification and auto-assign to eligible users (PBAC-filtered)
   */
  async create(dto: CreateNotificationDto): Promise<ResponseSuccess> {
    const maxRetries = 3;
    let savedNotification: Notification | null = null;
    let lastError: any;

    // Retry loop untuk menangani race condition pada nomor notifikasi
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // 1. Ambil notifikasi terakhir untuk sequence number
        const [lastNotification] = await this.notificationRepo.find({
          order: { createdAt: 'DESC' },
          take: 1,
        });

        const sequence = NotificationNumberGenerator.getNextSequence(
          lastNotification?.notificationNumber || null,
        );

        // 2. Generate nomor notifikasi (tambahkan 'attempt' sebagai offset jika retry)
        const notificationNumber = NotificationNumberGenerator.generate(
          new Date(),
          await sequence,
          attempt,
        );

        // 3. Set default expiration jika tidak disediakan
        let expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;

        if (!expiresAt) {
          expiresAt = new Date();
          if (
            dto.priority === NotificationPriority.LOW ||
            dto.priority === NotificationPriority.MEDIUM
          ) {
            expiresAt.setDate(expiresAt.getDate() + 30); // 30 hari untuk Low/Medium
          } else {
            expiresAt.setDate(expiresAt.getDate() + 90); // 90 hari untuk High/Critical
          }
        }

        // 4. Create & Save Notification
        const notification = this.notificationRepo.create({
          ...dto,
          notificationNumber,
          expiresAt,
        });

        savedNotification = await this.notificationRepo.save(notification);

        // Jika berhasil disimpan, keluar dari loop
        break;
      } catch (error) {
        lastError = error;
        // Cek error duplicate entry (MySQL: ER_DUP_ENTRY / code 1062)
        const isDuplicate =
          error.code === 'ER_DUP_ENTRY' ||
          error.message?.includes('Duplicate entry');

        if (isDuplicate && attempt < maxRetries - 1) {
          this.logger.warn(
            `Duplicate notification number detected on attempt ${attempt + 1}, retrying...`,
          );
          // Tunggu sebentar sebelum retry random 50-150ms
          await new Promise((resolve) =>
            setTimeout(resolve, 50 + Math.random() * 100),
          );
          continue;
        }

        // Jika bukan duplicate atau max retry tercapai, lempar error
        this.logger.error('Failed to create notification', error);
        throw error;
      }
    }

    if (!savedNotification) {
      throw new Error(
        `Failed to create notification after ${maxRetries} attempts: ${lastError?.message}`,
      );
    }

    // 5. Distribusi ke User (Notification Reads & WebSocket)
    // Get eligible users based on permission
    const eligibleUsers = await this.getEligibleUsers(
      dto.requiredPermission || undefined,
    );

    if (eligibleUsers.length > 0) {
      // Create notification_reads records
      const notificationReads = eligibleUsers.map((user) =>
        this.notificationReadRepo.create({
          notificationId: savedNotification!.id,
          userId: user.id,
          isRead: false,
        }),
      );

      await this.notificationReadRepo.save(notificationReads);

      // Emit to WebSocket for real-time delivery
      try {
        await this.notificationsGateway.notifyMultipleUsers(
          eligibleUsers.map((u) => u.id),
          savedNotification,
        );
      } catch (wsError) {
        this.logger.warn(
          `Failed to emit websocket notification: ${wsError.message}`,
        );
        // Jangan throw error, karena notifikasi DB sudah tersimpan
      }
    }

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
   * ✅ OPTIMIZED: Redis caching with 30s TTL
   */
  async getUnreadCount(userId: number): Promise<ResponseSuccess> {
    const cacheKey = `notification:unread:${userId}`;

    // Try cache first
    const cached = await this.redisService.get<{ count: number }>(cacheKey);
    if (cached !== null) {
      return this._success('Unread count retrieved (cached)', cached);
    }

    // Cache miss - query database
    const count = await this.notificationReadRepo.count({
      where: {
        userId,
        isRead: false,
        deletedAt: IsNull(),
      },
      relations: ['notification'],
    });

    const result = { count };

    // Cache result
    await this.redisService.set(
      cacheKey,
      result,
      NOTIFICATION_CONFIG.UNREAD_COUNT_CACHE_TTL,
    );

    return this._success('Unread count retrieved', result);
  }

  /**
   * Mark notification as read
   * ✅ OPTIMIZED: Invalidates Redis cache
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

    // ✅ Invalidate cache
    await this.redisService.del(`notification:unread:${userId}`);

    return this._success('Notification marked as read');
  }

  /**
   * Mark all notifications as read for user
   * ✅ OPTIMIZED: Invalidates Redis cache
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

    // ✅ Invalidate cache
    await this.redisService.del(`notification:unread:${userId}`);

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

    this.logger.log(
      `Cleaned up ${expiredNotifications.length} expired notifications`,
    );
  }
}
