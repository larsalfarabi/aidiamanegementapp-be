import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  Injectable,
  UnauthorizedException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NotificationsService } from './notifications.service';
import { Notification } from './entities/notification.entity';

/**
 * WebSocket Gateway for Real-Time Notifications
 *
 * Features:
 * - JWT authentication on connection
 * - Room-based delivery (user-specific rooms)
 * - Event handlers for mark read, acknowledge, etc.
 * - CORS enabled for Next.js frontend
 */
@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      process.env.FRONTEND_URL || 'http://localhost:3000',
    ],
    credentials: true,
  },
})
@Injectable()
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private connectedUsers = new Map<number, Set<string>>(); // userId -> Set<socketId>

  constructor(
    private jwtService: JwtService,
    @Inject(forwardRef(() => NotificationsService))
    private notificationsService: NotificationsService,
  ) {}

  /**
   * Handle client connection
   */
  async handleConnection(client: Socket) {
    try {
      // Extract JWT token from handshake
      const token =
        client.handshake.auth.token || client.handshake.headers.authorization;

      if (!token) {
        throw new UnauthorizedException('No token provided');
      }

      // Verify JWT token
      const payload = this.jwtService.verify(token.replace('Bearer ', ''));
      const userId = payload.sub || payload.id;

      if (!userId) {
        throw new UnauthorizedException('Invalid token payload');
      }

      // Store user data in socket
      client.data.userId = userId;

      // Join user-specific room
      const roomName = `user-${userId}`;
      client.join(roomName);

      // Track connected socket
      if (!this.connectedUsers.has(userId)) {
        this.connectedUsers.set(userId, new Set());
      }
      this.connectedUsers.get(userId)!.add(client.id);

      console.log(`✅ User ${userId} connected (socket: ${client.id})`);

      // Send initial unread count
      const unreadCountResponse =
        await this.notificationsService.getUnreadCount(userId);
      client.emit('notification:unread-count', unreadCountResponse.data);
    } catch (error) {
      console.error('❌ WebSocket authentication failed:', error.message);
      client.emit('error', { message: 'Authentication failed' });
      client.disconnect();
    }
  }

  /**
   * Handle client disconnection
   */
  handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (userId) {
      const userSockets = this.connectedUsers.get(userId);
      if (userSockets) {
        userSockets.delete(client.id);
        if (userSockets.size === 0) {
          this.connectedUsers.delete(userId);
        }
      }
      console.log(`❌ User ${userId} disconnected (socket: ${client.id})`);
    }
  }

  /**
   * Mark notification as read
   */
  @SubscribeMessage('notification:mark-read')
  async handleMarkAsRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { notificationId: number },
  ) {
    const userId = client.data.userId;
    await this.notificationsService.markAsRead(userId, data.notificationId);

    // Broadcast to all user's connected devices
    this.server
      .to(`user-${userId}`)
      .emit('notification:read', { id: data.notificationId });

    // Send updated unread count
    const unreadCountResponse =
      await this.notificationsService.getUnreadCount(userId);
    this.server
      .to(`user-${userId}`)
      .emit('notification:unread-count', unreadCountResponse.data);
  }

  /**
   * Mark all notifications as read
   */
  @SubscribeMessage('notification:mark-all-read')
  async handleMarkAllAsRead(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId;
    await this.notificationsService.markAllAsRead(userId);

    // Broadcast to all user's connected devices
    this.server.to(`user-${userId}`).emit('notification:all-read');

    // Send updated unread count
    const unreadCountResponse =
      await this.notificationsService.getUnreadCount(userId);
    this.server
      .to(`user-${userId}`)
      .emit('notification:unread-count', unreadCountResponse.data);
  }

  /**
   * Acknowledge CRITICAL notification
   */
  @SubscribeMessage('notification:acknowledge')
  async handleAcknowledge(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { notificationId: number },
  ) {
    const userId = client.data.userId;
    await this.notificationsService.acknowledge(userId, data.notificationId);

    // Broadcast to all user's connected devices
    this.server
      .to(`user-${userId}`)
      .emit('notification:acknowledged', { id: data.notificationId });
  }

  /**
   * Delete notification
   */
  @SubscribeMessage('notification:delete')
  async handleDelete(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { notificationId: number },
  ) {
    const userId = client.data.userId;
    await this.notificationsService.deleteNotification(
      userId,
      data.notificationId,
    );

    // Broadcast to all user's connected devices
    this.server
      .to(`user-${userId}`)
      .emit('notification:deleted', { id: data.notificationId });

    // Send updated unread count
    const unreadCountResponse =
      await this.notificationsService.getUnreadCount(userId);
    this.server
      .to(`user-${userId}`)
      .emit('notification:unread-count', unreadCountResponse.data);
  }

  /**
   * Request unread count
   */
  @SubscribeMessage('notification:get-unread-count')
  async handleGetUnreadCount(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId;
    const unreadCountResponse =
      await this.notificationsService.getUnreadCount(userId);
    client.emit('notification:unread-count', unreadCountResponse.data);
  }

  /**
   * Emit new notification to specific user (called by service)
   */
  async notifyUser(userId: number, notification: Notification) {
    const roomName = `user-${userId}`;

    // Send complete notification data matching frontend Notification interface
    this.server.to(roomName).emit('notification:new', {
      notification: {
        id: notification.id,
        notificationNumber: notification.notificationNumber,
        title: notification.title,
        message: notification.message,
        category: notification.category,
        priority: notification.priority,
        requiredPermission: notification.requiredPermission,
        eventType: notification.eventType,
        resourceType: notification.resourceType,
        resourceId: notification.resourceId,
        actionUrl: notification.actionUrl,
        actionLabel: notification.actionLabel,
        metadata: notification.metadata,
        createdAt: notification.createdAt,
        expiresAt: notification.expiresAt,
        // New notification is always unread
        isRead: false,
        readAt: null,
        isAcknowledged: false,
        acknowledgedAt: null,
      },
    });

    // Also send updated unread count
    const unreadCountResponse =
      await this.notificationsService.getUnreadCount(userId);
    this.server
      .to(roomName)
      .emit('notification:unread-count', unreadCountResponse.data);
  }

  /**
   * Emit notification to multiple users (PBAC-filtered)
   * ✅ OPTIMIZED: Parallel delivery instead of sequential
   */
  async notifyMultipleUsers(userIds: number[], notification: Notification) {
    await Promise.all(
      userIds.map((userId) => this.notifyUser(userId, notification)),
    );
  }

  /**
   * Check if user is currently connected
   */
  isUserConnected(userId: number): boolean {
    return (
      this.connectedUsers.has(userId) &&
      this.connectedUsers.get(userId)!.size > 0
    );
  }

  /**
   * Get count of connected devices for user
   */
  getUserDeviceCount(userId: number): number {
    return this.connectedUsers.get(userId)?.size || 0;
  }
}
