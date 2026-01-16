import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { Orders } from '../orders/entity/orders.entity';
import { OrderItems } from '../orders/entity/order_items.entity';
import { Customers } from '../customers/entity/customers.entity';
import { DailyInventory } from '../inventory/entity/daily-inventory.entity';
import { ProductionBatches } from '../production/entities/production-batches.entity';

import { DashboardResolver } from './dashboard.resolver';
import { Users } from '../users/entities/users.entity';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Orders,
      OrderItems,
      Customers,
      DailyInventory,
      ProductionBatches,
      Users,
    ]),
    RedisModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardResolver],
})
export class DashboardModule {}
