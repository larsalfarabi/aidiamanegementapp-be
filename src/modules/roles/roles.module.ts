import { Module } from '@nestjs/common';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { Roles } from './entities/roles.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { Users } from '../users/entities/users.entity';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [TypeOrmModule.forFeature([Roles, Users]), RedisModule],
  controllers: [RolesController],
  providers: [RolesService, PermissionGuard],
})
export class RolesModule {}
