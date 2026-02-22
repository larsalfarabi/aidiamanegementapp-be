import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Products } from './entity/products.entity';
import { ProductCategories } from './entity/product_categories.entity';
import { ProductSizes } from './entity/product_sizes.entity';
import { ProductCodes } from './entity/product_codes.entity';
import { ProductPackagingMaterial } from './entity/product-packaging-material.entity';
import { CategoryHierarchyService } from './services/category-hierarchy.service';
import { Users } from '../users/entities/users.entity';
import { RedisModule } from '../redis/redis.module';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Products,
      ProductCategories,
      ProductSizes,
      ProductSizes,
      ProductCodes,
      ProductPackagingMaterial,
      Users,
    ]),
    RedisModule,
    NotificationsModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService, CategoryHierarchyService, PermissionGuard],
  exports: [CategoryHierarchyService],
})
export class ProductsModule {}
