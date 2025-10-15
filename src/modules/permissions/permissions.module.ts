import { Module } from '@nestjs/common';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';
import { Permissions } from './entity/permissions.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Users } from '../users/entities/users.entity';
import { RedisModule } from '../redis/redis.module';
import { PermissionGuard } from '../auth/guards/permission.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Permissions, Users]), RedisModule],
  controllers: [PermissionsController],
  providers: [PermissionsService, PermissionGuard],
})
export class PermissionsModule {}
