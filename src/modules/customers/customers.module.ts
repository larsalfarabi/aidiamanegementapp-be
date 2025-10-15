import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { Customers } from './entity/customers.entity';
import { CustomerProductCatalogs } from './entity/customer_product_catalog.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([Customers, CustomerProductCatalogs])],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}
