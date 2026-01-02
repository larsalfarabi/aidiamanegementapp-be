import * as dotenv from 'dotenv';
dotenv.config();
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
import { ProductCategories } from '../../modules/products/entity/product_categories.entity';
import { ProductSizes } from '../../modules/products/entity/product_sizes.entity';

import { DailyInventorySeeder } from './daily-inventory.seed';
import { DailyInventory } from '../../modules/inventory/entity/daily-inventory.entity';
import { ProductCodes } from '../../modules/products/entity/product_codes.entity';
import { Products } from '../../modules/products/entity/products.entity';

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
        ProductCategories,
        ProductSizes,
        DailyInventory,
        ProductCodes,
        Products,
      ],
      synchronize: false, // Don't auto-create tables since they exist
      logging: false, // Reduce noise during seeding
    }),
    TypeOrmModule.forFeature([
      Users,
      Permissions,
      Roles,
      ProductCategories,
      ProductSizes,
      DailyInventory,
      ProductCodes,
      Products,
    ]),
  ],
  providers: [
    HashUtil,
    UserSeeder,
    RoleSeeder,
    PermissionSeeder,
    ProductSeeder,
    DailyInventorySeeder,
  ],
})
export class SeederModule {}
