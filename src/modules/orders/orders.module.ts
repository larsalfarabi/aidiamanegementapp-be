import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { Orders } from './entity/orders.entity';
import { OrderItems } from './entity/order_items.entity';
import { Customers } from '../customers/entity/customers.entity';
import { CustomerProductCatalogs } from '../customers/entity/customer_product_catalog.entity';
import { ProductCodes } from '../products/entity/product_codes.entity';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Orders,
      OrderItems,
      Customers,
      CustomerProductCatalogs,
      ProductCodes,
    ]),
    InventoryModule, // ✅ Import to access InventoryTransactionService
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
