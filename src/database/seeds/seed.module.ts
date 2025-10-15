import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Users } from '../../modules/users/entities/users.entity';
import { Roles } from '../../modules/roles/entities/roles.entity';
import { Permissions } from '../../modules/permissions/entity/permissions.entity';
import { HashUtil } from '../../common/utils/hash.util';
import { UserSeeder } from './user.seed';
import { RoleSeeder } from './role.seed';
import { PermissionSeeder } from './permission.seed';
import { ProductSeeder } from './product.seed';
import { CustomerSeeder } from './customer.seed';
import { OrderSeeder } from './order.seed';
import { InventorySeeder } from './inventory.seed';
import { Products } from '../../modules/products/entity/products.entity';
import { ProductCategories } from '../../modules/products/entity/product_categories.entity';
import { ProductSizes } from '../../modules/products/entity/product_sizes.entity';
import { ProductCodes } from '../../modules/products/entity/product_codes.entity';
import { Customers } from '../../modules/customers/entity/customers.entity';
import { CustomerProductCatalogs } from '../../modules/customers/entity/customer_product_catalog.entity';
import { Orders } from '../../modules/orders/entity/orders.entity';
import { OrderItems } from '../../modules/orders/entity/order_items.entity';
import { Inventory } from '../../modules/inventory/entity/inventory.entity';
import { InventoryTransactions } from '../../modules/inventory/entity/inventory_transactions.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      username: process.env.DB_USERNAME || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_DATABASE,
      entities: [
        Users,
        Roles,
        Permissions,
        Products,
        ProductCategories,
        ProductSizes,
        ProductCodes,
        Customers,
        CustomerProductCatalogs,
        Orders,
        OrderItems,
        Inventory,
        InventoryTransactions,
      ],
      synchronize: false, // Don't auto-create tables since they exist
      logging: false, // Reduce noise during seeding
    }),
    TypeOrmModule.forFeature([
      Users,
      Permissions,
      Roles,
      Products,
      ProductCategories,
      ProductSizes,
      ProductCodes,
      Customers,
      CustomerProductCatalogs,
      Orders,
      OrderItems,
      Inventory,
      InventoryTransactions,
    ]),
  ],
  providers: [
    HashUtil,
    UserSeeder,
    RoleSeeder,
    PermissionSeeder,
    ProductSeeder,
    CustomerSeeder,
    OrderSeeder,
    InventorySeeder,
  ],
})
export class SeederModule {}
