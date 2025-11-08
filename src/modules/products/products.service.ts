import {
  Injectable,
  NotFoundException,
  ConflictException,
  Inject,
  BadRequestException,
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
import { ProductCodeQueryDto } from './dto/products.dto';

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
  async findAll(query: ProductCodeQueryDto): Promise<ResponsePagination> {
    const { pageSize, limit, page, mainCategory, subCategoryId, size } =
      query;

    // ✅ UPDATED: Menggunakan relasi baru (product, category, size)
    const queryBuilder = this.productCodeRepo
      .createQueryBuilder('pc')
      .leftJoin('pc.product', 'products')
      .leftJoin('products.category', 'mainCategory')
      .leftJoin('pc.category', 'subCategory')
      .leftJoin('pc.size', 'productSizes')
      .where('pc.isDeleted = :isDeleted', {
        isDeleted: false,
      })
      .select([
        'pc',
        'products.id',
        'products.name',
        'products.productType',
        'mainCategory.id',
        'mainCategory.name',
        'subCategory.id',
        'subCategory.name',
        'productSizes.id',
        'productSizes.sizeValue',
      ])
      .take(pageSize)
      .skip(limit);

    if (mainCategory) {
      queryBuilder.andWhere('mainCategory.name = :mainCategory', {
        mainCategory: mainCategory,
      });
    }

    if (subCategoryId) {
      queryBuilder.andWhere('subCategory.id = :subCategoryId', {
        subCategoryId: subCategoryId,
      });
    }

    if (size) {
      queryBuilder.andWhere('productSizes.id = :size', {
        size: size,
      });
    }

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
    // ✅ UPDATED: Menggunakan relasi baru dengan main category dari Products
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
        'mainCategory.id', // ✅ Main category dari Products table
        'mainCategory.name',
        'mainCategory.description',
        'productCategories.id', // Sub-category dari ProductCodes table
        'productCategories.name',
        'productCategories.description',
        'productSizes.id',
        'productSizes.sizeValue',
        'productSizes.unitOfMeasure',
        'productSizes.baseValue',
        'productSizes.baseUnit',
        'productSizes.categoryType',
        'created_user.id',
        'created_user.firstName',
        'updated_user.id',
        'updated_user.firstName',
      ])
      .leftJoin('pc.product', 'products')
      .leftJoin('products.category', 'mainCategory') // ✅ Join main category
      .leftJoin('pc.category', 'productCategories') // Sub-category
      .leftJoin('pc.size', 'productSizes')
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

    // ✅ UPDATED: Menggunakan relasi baru (product, category, size)
    await this.productCodeRepo.save({
      ...payload,
      product: { id: payload.product } as any,
      category: { id: payload.category } as any,
      size: { id: payload.size } as any,
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

    // ✅ UPDATED: Menggunakan relasi baru (product, category, size)
    const updatePayload: any = { ...payload };

    if (payload.product !== undefined) {
      updatePayload.product = { id: payload.product };
    }
    if (payload.category !== undefined) {
      updatePayload.category = { id: payload.category };
    }
    if (payload.size !== undefined) {
      updatePayload.size = { id: payload.size };
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
    // Business validation: productType required for Finished Goods (Jadi), optional for others
    if (!payload.category) {
      throw new ConflictException('category wajib diisi');
    }

    // ✅ IMPROVED: Dynamic category check with parent lookup
    const category = await this.productCategoryRepo.findOne({
      where: { id: payload.category },
      select: ['id', 'name', 'level', 'parentId'],
      relations: ['parent'],
    });

    if (!category) {
      throw new ConflictException(
        `Kategori dengan ID ${payload.category} tidak ditemukan`,
      );
    }

    // ✅ CRITICAL FIX: Determine main category ID and name
    // Products.category should ALWAYS point to main category (level 0)
    // Sub-category relationship is stored in ProductCodes.category
    let mainCategoryId: number;
    let mainCategoryName: string;

    if (category.level > 0 && category.parent) {
      // This is a sub-category - use parent (main category)
      mainCategoryId = category.parent.id;
      mainCategoryName = category.parent.name.toUpperCase();
    } else {
      // This is already a main category
      mainCategoryId = category.id;
      mainCategoryName = category.name.toUpperCase();
    }

    // Validate productType requirement based on main category
    const requiresProductType = mainCategoryName === 'BARANG JADI';

    if (requiresProductType && !payload.productType) {
      throw new ConflictException(
        'productType wajib diisi untuk kategori Barang Jadi',
      );
    }

    // ✅ FIXED: Query using MAIN category ID, not sub-category
    const whereClause: any = {
      name: payload.name,
      category: { id: mainCategoryId }, // Use main category ID
    };
    if (payload.productType !== undefined) {
      whereClause.productType = payload.productType;
    }
    const existingProduct = await this.productRepo.findOne({
      where: whereClause,
      select: ['id', 'name', 'productType', 'imageUrl', 'isActive'],
      relations: ['category'],
    });

    if (existingProduct) {
      return this._success(
        'Product sudah ada, menggunakan product yang sudah ada',
        existingProduct,
      );
    }

    // ✅ FIXED: Create new product with MAIN category ID
    const newProduct = await this.productRepo.save({
      name: payload.name,
      productType: payload.productType ?? null,
      category: { id: mainCategoryId }, // Use main category ID
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
      select: [
        'id',
        'name',
        'description',
        'parentId',
        'level',
        'categoryType',
      ],
      take: pageSize,
      skip: limit,
      order: { level: 'ASC', name: 'ASC' },
    });

    return this._pagination(
      'Berhasil mengambil data product categories',
      result,
      count,
      page!,
      pageSize!,
    );
  }

  /**
   * ✅ NEW: Get main categories only (level 0)
   */
  async findMainCategories(): Promise<ResponseSuccess> {
    const result = await this.productCategoryRepo.find({
      where: { level: 0, isActive: true },
      select: ['id', 'name', 'description'],
      order: { name: 'ASC' },
    });

    return this._success('Berhasil mengambil main categories', result);
  }

  /**
   * ✅ NEW: Get sub-categories by parent ID
   */
  async findSubCategoriesByParent(parentId: number): Promise<ResponseSuccess> {
    const parent = await this.productCategoryRepo.findOne({
      where: { id: parentId },
    });

    if (!parent) {
      throw new NotFoundException(
        `Parent category dengan ID ${parentId} tidak ditemukan`,
      );
    }

    const result = await this.productCategoryRepo.find({
      where: { parentId, isActive: true },
      select: ['id', 'name', 'description', 'level'],
      order: { name: 'ASC' },
    });

    return this._success(
      `Berhasil mengambil sub-categories dari ${parent.name}`,
      result,
    );
  }

  /**
   * ✅ NEW: Get category hierarchy (with children)
   */
  async findCategoryHierarchy(): Promise<ResponseSuccess> {
    const mainCategories = await this.productCategoryRepo.find({
      where: { level: 0, isActive: true },
      select: ['id', 'name', 'description', 'level'],
      order: { name: 'ASC' },
    });

    // Load children for each main category
    const hierarchyData = await Promise.all(
      mainCategories.map(async (mainCat) => {
        const subCategories = await this.productCategoryRepo.find({
          where: { parentId: mainCat.id, isActive: true },
          select: ['id', 'name', 'description', 'level'],
          order: { name: 'ASC' },
        });

        return {
          ...mainCat,
          children: subCategories,
        };
      }),
    );

    return this._success(
      'Berhasil mengambil category hierarchy',
      hierarchyData,
    );
  }

  // * --- PRODUCT SIZES --- */
  async findAllProductSizes(
    query: import('./dto/products.dto').ProductSizeQueryDto,
  ): Promise<ResponsePagination> {
    const { pageSize, limit, page, categoryType } = query;

    const queryBuilder = this.productSizeRepo
      .createQueryBuilder('ps')
      .select([
        'ps.id',
        'ps.sizeValue',
        'ps.unitOfMeasure',
        'ps.baseValue',
        'ps.baseUnit',
        'ps.categoryType',
      ])
      .orderBy('ps.sizeValue', 'ASC')
      .take(pageSize)
      .skip(limit);

    // ✅ Filter by categoryType if provided
    if (categoryType) {
      queryBuilder.where('ps.categoryType = :categoryType', { categoryType });
    }

    const [result, count] = await queryBuilder.getManyAndCount();

    return this._pagination(
      'Berhasil mengambil data product sizes',
      result,
      count,
      page!,
      pageSize!,
    );
  }
}
