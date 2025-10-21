import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { Orders } from '../orders/entity/orders.entity';
import { OrderItems } from '../orders/entity/order_items.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Orders, OrderItems])],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
