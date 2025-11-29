import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { Orders } from '../orders/entity/orders.entity';
import { OrderItems } from '../orders/entity/order_items.entity';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { Users } from '../users/entities/users.entity';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [TypeOrmModule.forFeature([Orders, OrderItems, Users]), RedisModule],
  controllers: [ReportsController],
  providers: [ReportsService, PermissionGuard],
  exports: [ReportsService],
})
export class ReportsModule {}
