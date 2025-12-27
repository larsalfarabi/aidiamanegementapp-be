
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { Orders } from '../orders/entity/orders.entity';
import { OrderItems } from '../orders/entity/order_items.entity';
import { Customers } from '../customers/entity/customers.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Orders, OrderItems, Customers])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
