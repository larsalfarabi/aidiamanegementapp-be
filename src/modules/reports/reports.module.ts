import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { Orders } from '../orders/entity/orders.entity';
import { OrderItems } from '../orders/entity/order_items.entity';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { Users } from '../users/entities/users.entity';
import { RedisModule } from '../redis/redis.module';
import { ProductionReportsController } from './production/production-reports.controller';
import { ProductionReportsService } from './production/production-reports.service';
import {
  ProductionMaterialUsage,
  ProductionBatches,
  ProductionBottlingOutput,
} from '../production/entities';
import { ProductCategories } from '../products/entity/product_categories.entity';
import { Products } from '../products/entity/products.entity';
import { ProductCodes } from '../products/entity/product_codes.entity';
import { ProductionFormulas, FormulaMaterials } from '../production/entities';
import { ProductPackagingMaterial } from '../products/entity/product-packaging-material.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Orders,
      OrderItems,
      Users,
      ProductionMaterialUsage,
      ProductCategories,
      Products,
      ProductCodes,
      ProductionFormulas,
      FormulaMaterials,
      ProductionBatches,
      ProductPackagingMaterial,
      ProductionBottlingOutput,
    ]),
    RedisModule,
  ],
  controllers: [ReportsController, ProductionReportsController],
  providers: [ReportsService, ProductionReportsService, PermissionGuard],
  exports: [ReportsService, ProductionReportsService],
})
export class ReportsModule {}
