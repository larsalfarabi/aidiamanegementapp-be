import { InjectUpdatedBy } from './../../common/decorator/inject-updatedBy.decorator';
import {
  Controller,
  Get,
  UseGuards,
  Param,
  ParseIntPipe,
  Put,
  Delete,
  Body,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { Pagination } from '../../common/decorator/pagination.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtGuard } from '../auth/guards/auth.guard';
import { Post } from '@nestjs/common';
import { InjectCreatedBy } from '../../common/decorator/inject-createdBy.decorator';
import {
  CreateProductCodeDto,
  DeleteProductCodeDto,
  UpdateProductCodeDto,
  CheckOrCreateProductDto,
  ProductCodeQueryDto,
  QueryProductDto,
} from './dto/products.dto';
// import { CacheInterceptor, CacheKey, CacheTTL } from '@nestjs/cache-manager';
import { InjectDeletedBy } from '../../common/decorator/inject-deletedBy.decorator';

@UseGuards(JwtGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // * --- PRODUCT CODES --- */
  @Get()
  async findAll(@Pagination() query: ProductCodeQueryDto) {
    return this.productsService.findAll(query);
  }

  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.findById(id);
  }

  @Post()
  async createProductCode(@InjectCreatedBy() payload: CreateProductCodeDto) {
    return this.productsService.createProductCode(payload);
  }

  @Put(':id')
  async updateProductCode(
    @Param('id', ParseIntPipe) id: number,
    @InjectUpdatedBy() payload: UpdateProductCodeDto,
  ) {
    return this.productsService.updateProductCode(id, payload);
  }

  @Delete(':id')
  async deleteProductCode(
    @Param('id', ParseIntPipe) id: number,
    @InjectDeletedBy() payload: DeleteProductCodeDto,
  ) {
    return this.productsService.deleteProductCode(id, payload);
  }

  // * --- PRODUCTS --- */
  @Get('items/all')
  async findAllProducts(@Pagination() query: QueryProductDto) {
    return this.productsService.findAllProducts(query);
  }

  // Check or create product item (Find or Create pattern)
  @Post('items/check-or-create')
  async checkOrCreateProduct(
    @InjectCreatedBy() payload: CheckOrCreateProductDto,
  ) {
    return this.productsService.checkOrCreateProduct(payload);
  }

  // * --- PRODUCT CATEGORIES --- */
  @Get('categories/all')
  async findAllProductCategories(@Pagination() query: PaginationDto) {
    return this.productsService.findAllProductCategories(query);
  }

  // ✅ NEW: Get main categories only
  @Get('categories/main')
  async findMainCategories() {
    return this.productsService.findMainCategories();
  }

  // ✅ NEW: Get sub-categories by parent ID
  @Get('categories/:parentId/sub-categories')
  async findSubCategoriesByParent(@Param('parentId') parentId: string) {
    return this.productsService.findSubCategoriesByParent(+parentId);
  }

  // ✅ NEW: Get category hierarchy
  @Get('categories/hierarchy')
  async findCategoryHierarchy() {
    return this.productsService.findCategoryHierarchy();
  }

  // * --- PRODUCT SIZES --- */
  @Get('sizes/all')
  async findAllProductSizes(
    @Pagination() query: import('./dto/products.dto').ProductSizeQueryDto,
  ) {
    return this.productsService.findAllProductSizes(query);
  }
}
