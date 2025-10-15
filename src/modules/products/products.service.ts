import {
  Injectable,
  NotFoundException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import { ProductCodes } from './entity/product_codes.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import BaseResponse from '../../common/response/base.response';
import { ResponsePagination } from '../../common/interface/response.interface';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ResponseSuccess } from '../../common/interface/response.interface';
import {
  CreateProductCodeDto,
  DeleteProductCodeDto,
  UpdateProductCodeDto,
} from './dto/products.dto';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Pagination } from '../../common/decorator/pagination.decorator';
import { Products } from './entity/products.entity';
import { ProductSizes } from './entity/product_sizes.entity';
import { ProductCategories } from './entity/product_categories.entity';

@Injectable()
export class ProductsService extends BaseResponse {
  constructor(
    @InjectRepository(ProductCodes)
    private readonly productCodeRepo: Repository<ProductCodes>,
    @InjectRepository(Products)
    private readonly productRepo: Repository<Products>,
    @InjectRepository(ProductSizes)
    private readonly productSizeRepo: Repository<ProductSizes>,
    @InjectRepository(ProductCategories)
    private readonly productCategoryRepo: Repository<ProductCategories>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {
    super();
  }

  // * --- PRODUCT CODES --- */
  async findAll(query: PaginationDto): Promise<ResponsePagination> {
    const { pageSize, limit, page } = query;

    const queryBuilder = this.productCodeRepo
      .createQueryBuilder('pc')
      .select([
        'pc.id',
        'pc.productCode',
        'products.name',
        'products.productType',
        'product_categories.name',
        'product_sizes.sizeValue',
      ])
      .leftJoin('pc.productId', 'products')
      .leftJoin('pc.categoryId', 'product_categories')
      .leftJoin('pc.sizeId', 'product_sizes')
      .where('pc.isDeleted = :isDeleted', {
        isDeleted: false,
      })
      .take(pageSize)
      .skip(limit);

    const [result, count] = await queryBuilder.getManyAndCount();

    return this._pagination(
      'Berhasil mengambil data product',
      result,
      count,
      page!,
      pageSize!,
    );
  }

  async findById(id: number) {
    const queryBuilder = this.productCodeRepo
      .createQueryBuilder('pc')
      .select([
        'pc.id',
        'pc.productCode',
        'pc.isActive',
        'pc.createdAt',
        'pc.updatedAt',
        'products.id',
        'products.name',
        'products.productType',
        'products.imageUrl',
        'products.isActive',
        'product_categories.id',
        'product_categories.name',
        'product_categories.description',
        'product_sizes.id',
        'product_sizes.sizeValue',
        'product_sizes.unitOfMeasure',
        'product_sizes.volumeMili',
        'created_user.id',
        'created_user.firstName',
        'updated_user.id',
        'updated_user.firstName',
      ])
      .leftJoin('pc.productId', 'products')
      .leftJoin('pc.categoryId', 'product_categories')
      .leftJoin('pc.sizeId', 'product_sizes')
      .leftJoin('pc.createdBy', 'created_user')
      .leftJoin('pc.updatedBy', 'updated_user')
      .where('pc.id = :id AND pc.isDeleted = :isDeleted', {
        id,
        isDeleted: false,
      });

    const result = await queryBuilder.getOne();

    if (!result) {
      throw new NotFoundException(`Product dengan ID ${id} tidak ditemukan`);
    }

    return this._success('Berhasil mengambil detail product', result);
  }

  async createProductCode(
    payload: CreateProductCodeDto,
  ): Promise<ResponseSuccess> {
    const check = await this.productCodeRepo.findOne({
      where: { productCode: payload.productCode },
    });
    if (check) {
      throw new ConflictException('Product code sudah ada');
    }

    // ✅ FIXED: TypeORM save with relation IDs using simplified syntax
    // When saving, we can use { id } shorthand for relations
    await this.productCodeRepo.save({
      ...payload,
      productId: { id: payload.productId } as any,
      categoryId: { id: payload.categoryId } as any,
      sizeId: { id: payload.sizeId } as any,
    });

    return this._success('Berhasil membuat product code');
  }

  async updateProductCode(
    id: number,
    payload: UpdateProductCodeDto,
  ): Promise<ResponseSuccess> {
    const check = await this.productCodeRepo.findOne({
      where: { id },
    });
    if (!check) {
      throw new NotFoundException(
        `Product code dengan ID ${id} tidak ditemukan`,
      );
    }

    // ✅ FIXED: TypeORM update with relation IDs
    // Prepare update payload with proper relation format
    const updatePayload: any = { ...payload };

    if (payload.productId !== undefined) {
      updatePayload.productId = { id: payload.productId };
    }
    if (payload.categoryId !== undefined) {
      updatePayload.categoryId = { id: payload.categoryId };
    }
    if (payload.sizeId !== undefined) {
      updatePayload.sizeId = { id: payload.sizeId };
    }

    await this.productCodeRepo.update(id, updatePayload);
    return this._success(`Berhasil mengupdate product code dengan ID ${id}`);
  }

  async deleteProductCode(
    id: number,
    payload: DeleteProductCodeDto,
  ): Promise<ResponseSuccess> {
    const result = await this.productCodeRepo.update(id, payload);

    if (result.affected === 0)
      throw new NotFoundException(
        `Product code dengan ID ${id} tidak ditemukan`,
      );

    return this._success(`Berhasil menghapus product code dengan ID ${id}`);
  }

  // * --- PRODUCTS --- */
  async findAllProducts(query: PaginationDto): Promise<ResponsePagination> {
    const { pageSize, limit, page } = query;
    const [result, count] = await this.productRepo.findAndCount({
      select: ['id', 'name', 'productType', 'imageUrl', 'isActive'],
      // take: pageSize,
      // skip: limit,
    });

    return this._pagination(
      'Berhasil mengambil data product',
      result,
      count,
      page!,
      pageSize!,
    );
  }

  // Check if product exists, if not create new one (Find or Create pattern)
  async checkOrCreateProduct(
    payload: import('./dto/products.dto').CheckOrCreateProductDto,
  ): Promise<ResponseSuccess> {
    // Check if product with same name and type already exists
    const existingProduct = await this.productRepo.findOne({
      where: {
        name: payload.name,
        productType: payload.productType,
      },
      select: ['id', 'name', 'productType', 'imageUrl', 'isActive'],
    });

    // If exists, return existing product
    if (existingProduct) {
      return this._success(
        'Product sudah ada, menggunakan product yang sudah ada',
        existingProduct,
      );
    }

    // If not exists, create new product
    const newProduct = await this.productRepo.save({
      name: payload.name,
      productType: payload.productType,
      isActive: true,
      createdBy: payload.createdBy,
    });

    return this._success('Berhasil membuat product baru', {
      id: newProduct.id,
      name: newProduct.name,
      productType: newProduct.productType,
      imageUrl: newProduct.imageUrl,
      isActive: newProduct.isActive,
    });
  }

  // * --- PRODUCT CATEGORIES --- */

  async findAllProductCategories(
    query: PaginationDto,
  ): Promise<ResponsePagination> {
    const { pageSize, limit, page } = query;
    const [result, count] = await this.productCategoryRepo.findAndCount({
      select: ['id', 'name', 'description'],
      take: pageSize,
      skip: limit,
    });

    return this._pagination(
      'Berhasil mengambil data product categories',
      result,
      count,
      page!,
      pageSize!,
    );
  }

  // * --- PRODUCT SIZES --- */
  async findAllProductSizes(query: PaginationDto): Promise<ResponsePagination> {
    const { pageSize, limit, page } = query;
    const [result, count] = await this.productSizeRepo.findAndCount({
      select: ['id', 'sizeValue', 'unitOfMeasure', 'volumeMili'],
      take: pageSize,
      skip: limit,
    });

    return this._pagination(
      'Berhasil mengambil data product sizes',
      result,
      count,
      page!,
      pageSize!,
    );
  }
}
