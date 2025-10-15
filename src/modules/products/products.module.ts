import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Products } from './entity/products.entity';
import { ProductCategories } from './entity/product_categories.entity';
import { ProductSizes } from './entity/product_sizes.entity';
import { ProductCodes } from './entity/product_codes.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Products,
      ProductCategories,
      ProductSizes,
      ProductCodes,
    ]),
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
