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
  UseInterceptors,
  UploadedFile,
  Res,
  HttpStatus,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ProductsService } from './products.service';
import { Pagination } from '../../common/decorator/pagination.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtGuard } from '../auth/guards/auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermissions } from '../../common/decorator/permission.decorator';
import { Resource, Action } from '../../common/enums/resource.enum';
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

@UseGuards(JwtGuard, PermissionGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // * --- PRODUCT CODES --- */
  @Get()
  @RequirePermissions(`${Resource.PRODUCT}:${Action.VIEW}`)
  async findAll(@Pagination() query: ProductCodeQueryDto) {
    return this.productsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(`${Resource.PRODUCT}:${Action.VIEW}`)
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.findById(id);
  }

  @Post()
  @RequirePermissions(`${Resource.PRODUCT}:${Action.CREATE}`)
  async createProductCode(@InjectCreatedBy() payload: CreateProductCodeDto) {
    return this.productsService.createProductCode(payload);
  }

  @Put(':id')
  @RequirePermissions(`${Resource.PRODUCT}:${Action.UPDATE}`)
  async updateProductCode(
    @Param('id', ParseIntPipe) id: number,
    @InjectUpdatedBy() payload: UpdateProductCodeDto,
  ) {
    return this.productsService.updateProductCode(id, payload);
  }

  // Check inventory status before delete
  @Get(':id/inventory-status')
  @RequirePermissions(`${Resource.PRODUCT}:${Action.VIEW}`)
  async checkInventoryStatus(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.checkInventoryStatus(id);
  }

  @Delete(':id')
  @RequirePermissions(`${Resource.PRODUCT}:${Action.DELETE}`)
  async deleteProductCode(
    @Param('id', ParseIntPipe) id: number,
    @InjectDeletedBy() payload: DeleteProductCodeDto,
  ) {
    return this.productsService.deleteProductCode(id, payload);
  }

  // * --- PRODUCTS --- */
  @Get('items/all')
  @RequirePermissions(`${Resource.PRODUCT}:${Action.VIEW}`)
  async findAllProducts(@Pagination() query: QueryProductDto) {
    return this.productsService.findAllProducts(query);
  }

  // Check or create product item (Find or Create pattern)
  @Post('items/check-or-create')
  @RequirePermissions(`${Resource.PRODUCT}:${Action.CREATE}`)
  async checkOrCreateProduct(
    @InjectCreatedBy() payload: CheckOrCreateProductDto,
  ) {
    return this.productsService.checkOrCreateProduct(payload);
  }

  // * --- PRODUCT CATEGORIES --- */
  @Get('categories/all')
  @RequirePermissions(`${Resource.PRODUCT}:${Action.VIEW}`)
  async findAllProductCategories(@Pagination() query: PaginationDto) {
    return this.productsService.findAllProductCategories(query);
  }

  // ✅ NEW: Get main categories only
  @Get('categories/main')
  @RequirePermissions(`${Resource.PRODUCT}:${Action.VIEW}`)
  async findMainCategories() {
    return this.productsService.findMainCategories();
  }

  // ✅ NEW: Get sub-categories by parent ID
  @Get('categories/:parentId/sub-categories')
  @RequirePermissions(`${Resource.PRODUCT}:${Action.VIEW}`)
  async findSubCategoriesByParent(@Param('parentId') parentId: string) {
    return this.productsService.findSubCategoriesByParent(+parentId);
  }

  // ✅ NEW: Get category hierarchy
  @Get('categories/hierarchy')
  @RequirePermissions(`${Resource.PRODUCT}:${Action.VIEW}`)
  async findCategoryHierarchy() {
    return this.productsService.findCategoryHierarchy();
  }

  // * --- PRODUCT SIZES --- */
  @Get('sizes/all')
  @RequirePermissions(`${Resource.PRODUCT}:${Action.VIEW}`)
  async findAllProductSizes(
    @Pagination() query: import('./dto/products.dto').ProductSizeQueryDto,
  ) {
    return this.productsService.findAllProductSizes(query);
  }

  // * --- EXCEL UPLOAD --- */
  @Get('excel/template')
  @RequirePermissions(`${Resource.PRODUCT}:${Action.VIEW}`)
  async downloadTemplate(
    @Query('category') category: string,
    @Res({ passthrough: false }) res: Response,
  ) {
    const buffer = await this.productsService.generateExcelTemplate(category);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=Template_Upload_Product.xlsx',
    );

    res.send(buffer);
  }

  @Post('excel/upload')
  @RequirePermissions(`${Resource.PRODUCT}:${Action.CREATE}`)
  @UseInterceptors(FileInterceptor('file'))
  async uploadExcel(
    @UploadedFile() file: any,
    @InjectCreatedBy() payload: any,
    @Query('category') category: string,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const result = await this.productsService.uploadExcelFile(
      file.buffer,
      payload.createdBy,
      category,
    );

    return {
      statusCode: HttpStatus.OK,
      message: 'Excel file processed',
      data: result,
    };
  }
}
