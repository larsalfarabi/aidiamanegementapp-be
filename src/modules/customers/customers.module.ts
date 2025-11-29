import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { Customers } from './entity/customers.entity';
import { CustomerProductCatalogs } from './entity/customer_product_catalog.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Users } from '../users/entities/users.entity';
import { RedisModule } from '../redis/redis.module';
import { PermissionGuard } from '../auth/guards/permission.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customers, CustomerProductCatalogs, Users]),
    RedisModule,
  ],
  controllers: [CustomersController],
  providers: [CustomersService, PermissionGuard],
})
export class CustomersModule {}
