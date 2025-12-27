import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtGuard } from '../auth/guards/auth.guard';
import {
  CreateNotificationDto,
  FilterNotificationDto,
  MarkAsReadDto,
  AcknowledgeNotificationDto,
} from './dto/notification.dto';

@Controller('notifications')
@UseGuards(JwtGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Create notification (Admin only - for system notifications)
   */
  @Post()
  async create(@Body() dto: CreateNotificationDto) {
    return this.notificationsService.create(dto);
  }

  /**
   * Get user's notifications with filtering
   */
  @Get()
  async getUserNotifications(
    @Request() req: any,
    @Query() filter: FilterNotificationDto,
  ) {
    return this.notificationsService.getUserNotifications(req.user.id, filter);
  }

  /**
   * Get unread notification count
   */
  @Get('unread-count')
  async getUnreadCount(@Request() req: any) {
    return this.notificationsService.getUnreadCount(req.user.id);
  }

  /**
   * Mark notification as read
   */
  @Patch(':id/read')
  async markAsRead(@Request() req: any, @Param('id') id: string) {
    return this.notificationsService.markAsRead(req.user.id, parseInt(id));
  }

  /**
   * Mark all notifications as read
   */
  @Post('mark-all-read')
  async markAllAsRead(@Request() req: any) {
    return this.notificationsService.markAllAsRead(req.user.id);
  }

  /**
   * Acknowledge CRITICAL notification
   */
  @Patch(':id/acknowledge')
  async acknowledge(@Request() req: any, @Param('id') id: string) {
    return this.notificationsService.acknowledge(req.user.id, parseInt(id));
  }

  /**
   * Delete notification (soft delete)
   */
  @Delete(':id')
  async deleteNotification(@Request() req: any, @Param('id') id: string) {
    return this.notificationsService.deleteNotification(
      req.user.id,
      parseInt(id),
    );
  }

  /**
   * Delete all read notifications
   */
  @Delete('read/all')
  async deleteAllRead(@Request() req: any) {
    return this.notificationsService.deleteAllRead(req.user.id);
  }
}
