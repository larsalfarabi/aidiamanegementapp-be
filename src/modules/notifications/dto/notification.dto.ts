import {
  IsString,
  IsEnum,
  IsOptional,
  IsNumber,
  IsObject,
  IsDateString,
  MinLength,
  MaxLength,
} from 'class-validator';
import {
  NotificationCategory,
  NotificationPriority,
  NotificationResourceType,
} from '../entities/notification.entity';

/**
 * DTO for creating a new notification
 */
export class CreateNotificationDto {
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  title: string;

  @IsString()
  @MinLength(10)
  message: string;

  @IsEnum(NotificationCategory)
  category: NotificationCategory;

  @IsEnum(NotificationPriority)
  @IsOptional()
  priority?: NotificationPriority;

  @IsString()
  @IsOptional()
  requiredPermission?: string;

  @IsString()
  eventType: string;

  @IsEnum(NotificationResourceType)
  resourceType: NotificationResourceType;

  @IsNumber()
  @IsOptional()
  resourceId: number | null = null;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  actionUrl: string | null = null;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  actionLabel: string | null = null;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;

  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}

/**
 * DTO for filtering notifications
 */
export class FilterNotificationDto {
  @IsEnum(NotificationCategory)
  @IsOptional()
  category?: NotificationCategory;

  @IsEnum(NotificationPriority)
  @IsOptional()
  priority?: NotificationPriority;

  @IsString()
  @IsOptional()
  status?: 'unread' | 'read' | 'acknowledged' | 'all';

  @IsString()
  @IsOptional()
  search?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsNumber()
  @IsOptional()
  page?: number;

  @IsNumber()
  @IsOptional()
  limit?: number;
}

/**
 * DTO for marking notification as read
 */
export class MarkAsReadDto {
  @IsNumber()
  notificationId: number;
}

/**
 * DTO for acknowledging notification
 */
export class AcknowledgeNotificationDto {
  @IsNumber()
  notificationId: number;
}
