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
} from './entities';
import { ProductCodes } from '../products/entity/product_codes.entity';
import { ProductCategories } from '../products/entity/product_categories.entity';
import { InventoryTransactions } from '../inventory/entity/inventory_transactions.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductionFormulas,
      FormulaMaterials,
      ProductionBatches,
      ProductionMaterialUsage,
      ProductionStageTracking,
      ProductCodes,
      ProductCategories,
      InventoryTransactions,
    ]),
  ],
  controllers: [ProductionController],
  providers: [ProductionFormulaService, ProductionBatchService],
  exports: [ProductionFormulaService, ProductionBatchService],
})
export class ProductionModule {}
