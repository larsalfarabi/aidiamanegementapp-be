import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductionController } from './production.controller';
import { ProductionFormulaService, ProductionBatchService } from './services';
import {
  ProductionFormulas,
  FormulaMaterials,
  ProductionBatches,
  ProductionMaterialUsage,
  ProductionStageTracking,
  ProductionBottlingOutput,
} from './entities';
import { ProductCodes } from '../products/entity/product_codes.entity';
import { Products } from '../products/entity/products.entity';
import { ProductCategories } from '../products/entity/product_categories.entity';
import { InventoryTransactions } from '../inventory/entity/inventory-transactions.entity';
import { InventoryModule } from '../inventory/inventory.module';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { Users } from '../users/entities/users.entity';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductionFormulas,
      FormulaMaterials,
      ProductionBatches,
      ProductionMaterialUsage,
      ProductionStageTracking,
      ProductionBottlingOutput,
      ProductCodes,
      Products, // NEW: Product concept entity
      ProductCategories,
      InventoryTransactions,
      Users,
    ]),
    InventoryModule,
    RedisModule, // Import InventoryModule to use InventoryService
  ],
  controllers: [ProductionController],
  providers: [
    ProductionFormulaService,
    ProductionBatchService,
    PermissionGuard,
  ],
  exports: [ProductionFormulaService, ProductionBatchService],
})
export class ProductionModule {}
