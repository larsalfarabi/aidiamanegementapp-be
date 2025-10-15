import * as dotenv from 'dotenv';
dotenv.config();
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Users } from '../../users/entities/users.entity';
import { Repository } from 'typeorm';
import { PERMISSIONS_KEY } from '../../../common/decorator/permission.decorator';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectRepository(Users) private readonly userRepo: Repository<Users>,
    private redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) throw new UnauthorizedException('User not authenticated');

    const cacheKey = `user_permissions:${user.id}`;
    let userPermissions: string[] | undefined =
      await this.redisService.get(cacheKey);

    if (!userPermissions) {
      userPermissions = await this.getUserPermissionsFromDB(user.id);
      await this.redisService.set(cacheKey, userPermissions, 60 * 60);
    }

    return this.validatePermissions(userPermissions, requiredPermissions);
  }

  private async getUserPermissionsFromDB(userId: number): Promise<string[]> {
    const userWithPermissions = await this.userRepo.findOne({
      where: { id: userId, isActive: true },
      relations: ['roles', 'roles.permissions'],
    });

    if (!userWithPermissions) {
      throw new UnauthorizedException('User not found or inactive');
    }

    if (!userWithPermissions.roles || !userWithPermissions.roles.permissions) {
      return [];
    }

    return userWithPermissions.roles.permissions
      .filter((permission) => permission.isActive)
      .map((permission) => `${permission.resource}:${permission.action}`);
  }

  private validatePermissions(
    userPermissions: string[],
    requiredPermissions: string[],
  ): boolean {
    const hasPermission = requiredPermissions.some((permission) =>
      userPermissions.includes(permission),
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `Access denied. Required any of: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }

  async invalidateUserCache(userId: number): Promise<void> {
    const cacheKey = `user_permissions:${userId}`;
    await this.redisService.del(cacheKey);
  }
}
