import {
  Injectable,
  NotFoundException,
  ConflictException,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { Not } from 'typeorm';
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
import { ProductCodeQueryDto, QueryProductDto } from './dto/products.dto';

@Injectable()
export class ProductsService extends BaseResponse {
  // Service for managing product codes and related entities
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
    const { pageSize, limit, page, mainCategory, subCategoryId, size } = query;

    // ✅ SWAPPED STRUCTURE: pc.category = Main Category, products.category = Sub Category
    const queryBuilder = this.productCodeRepo
      .createQueryBuilder('pc')
      .leftJoin('pc.product', 'products')
      .leftJoinAndSelect('pc.category', 'mainCategory') // ProductCodes.category = Main Category NOW
      .leftJoin('products.category', 'subCategory') // Products.category = Sub Category NOW
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
        'subCategory.categoryType',
        'productSizes.id',
        'productSizes.sizeValue',
        'productSizes.unitOfMeasure',
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
    // ✅ SWAPPED STRUCTURE: pc.category = Main Category, products.category = Sub Category
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
        'mainCategory.id', // ✅ Main category dari ProductCodes table
        'mainCategory.name',
        'mainCategory.description',
        'subCategory.id', // Sub-category dari Products table
        'subCategory.name',
        'subCategory.description',
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
      .leftJoinAndSelect('pc.category', 'mainCategory') // ProductCodes.category = Main Category NOW
      .leftJoin('products.category', 'subCategory') // Products.category = Sub Category NOW
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
    // Validation 1: Check if productCode already exists
    const checkProductCode = await this.productCodeRepo.findOne({
      where: { productCode: payload.productCode },
    });
    if (checkProductCode) {
      throw new ConflictException('Product code sudah ada');
    }

    // ✅ ANTI-DUPLICATION: Check if combination (productId + categoryId + sizeId) already exists
    // This prevents duplicate ProductCodes with same product, category, and size
    const checkDuplicate = await this.productCodeRepo.findOne({
      where: {
        product: { id: payload.product },
        category: { id: payload.category },
        size: { id: payload.size },
        isDeleted: false,
      },
      relations: ['product', 'category', 'size'],
    });

    if (checkDuplicate) {
      const productDetails = await this.productRepo.findOne({
        where: { id: payload.product },
        relations: ['category'],
      });
      const categoryDetails = await this.productCategoryRepo.findOne({
        where: { id: payload.category },
      });
      const sizeDetails = await this.productSizeRepo.findOne({
        where: { id: payload.size },
      });

      throw new ConflictException(
        `Product code dengan kombinasi yang sama sudah ada: ` +
          `${productDetails?.name || 'Unknown'} - ` +
          `${productDetails?.category?.name || 'No SubCategory'} (${categoryDetails?.name || 'Unknown'}) - ` +
          `${sizeDetails?.sizeValue || 'Unknown'} ${sizeDetails?.unitOfMeasure || ''}. ` +
          `Product code: ${checkDuplicate.productCode}`,
      );
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

    const validateProductCode = await this.productCodeRepo.findOne({
      where: { productCode: payload.productCode, id: id },
    });
    if (!validateProductCode) {
      throw new ConflictException('Kode barang sudah pernah digunakan');
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

  /**
   * Check inventory status before delete
   * ✅ UPDATED: Check stok akhir from daily_inventory OR inventory_transactions
   * Strategy:
   * 1. Try daily_inventory first (most accurate, latest closing stock)
   * 2. If no daily_inventory record exists, aggregate from inventory_transactions
   * Returns: hasActiveStock, hasHistory, currentStock, transactionCount
   */
  async checkInventoryStatus(id: number): Promise<ResponseSuccess> {
    const productCode = await this.productCodeRepo.findOne({
      where: { id },
      select: ['id', 'productCode'],
    });

    if (!productCode) {
      return this._fail('Kode barang tidak ditemukan', 404);
    }

    // ✅ Get today's date in WIB timezone (UTC+7)
    const now = new Date();
    const wibOffset = 7 * 60; // WIB is UTC+7
    const wibTime = new Date(now.getTime() + wibOffset * 60 * 1000);
    const todayStr = wibTime.toISOString().split('T')[0]; // YYYY-MM-DD format in WIB

    // ✅ Strategy 1: Try to get latest stok akhir from daily_inventory
    const dailyStockQuery = `
      SELECT 
        COALESCE(stokAkhir, 0) as current_stock,
        businessDate
      FROM daily_inventory
      WHERE productCodeId = ? 
        AND deletedAt IS NULL
      ORDER BY businessDate DESC
      LIMIT 1
    `;

    // ✅ Strategy 2: Fallback - aggregate from inventory_transactions
    const transactionAggregateQuery = `
      SELECT 
        COALESCE(
          SUM(CASE 
            WHEN transactionType IN ('PRODUCTION_IN', 'PURCHASE', 'REPACK_IN', 'SAMPLE_RETURN', 'ADJUSTMENT_IN') 
            THEN quantity 
            ELSE 0 
          END), 0
        ) as total_in,
        COALESCE(
          SUM(CASE 
            WHEN transactionType IN ('SALE', 'REPACK_OUT', 'SAMPLE_OUT', 'PRODUCTION_OUT', 'ADJUSTMENT_OUT') 
            THEN ABS(quantity) 
            ELSE 0 
          END), 0
        ) as total_out,
        COUNT(*) as transaction_count
      FROM inventory_transactions
      WHERE productCodeId = ? AND deletedAt IS NULL
    `;

    const [stockResult, transactionResult] = await Promise.all([
      this.productCodeRepo.query(dailyStockQuery, [id]),
      this.productCodeRepo.query(transactionAggregateQuery, [id]),
    ]);

    // Determine current stock: use daily_inventory if exists, else use transaction aggregate
    let currentStock = 0;
    let checkDate: string | Date = todayStr;
    let source = 'none';

    if (stockResult.length > 0 && stockResult[0].current_stock !== null) {
      // Use daily_inventory data
      currentStock = parseFloat(stockResult[0].current_stock || 0);
      checkDate = stockResult[0].businessDate;
      source = 'daily_inventory';
    } else if (transactionResult.length > 0) {
      // Fallback: calculate from transactions
      const totalIn = parseFloat(transactionResult[0].total_in || 0);
      const totalOut = parseFloat(transactionResult[0].total_out || 0);
      currentStock = totalIn - totalOut;
      source = 'inventory_transactions';
    }

    const transactionCount = parseInt(
      transactionResult[0]?.transaction_count || 0,
    );
    const hasActiveStock = currentStock > 0;
    const hasHistory = transactionCount > 0;

    // Format checkDate properly
    let formattedCheckDate: string;
    if (checkDate instanceof Date) {
      formattedCheckDate = checkDate.toISOString().split('T')[0];
    } else if (typeof checkDate === 'string') {
      formattedCheckDate = checkDate;
    } else {
      formattedCheckDate = todayStr;
    }

    return this._success('Status inventory berhasil diambil', {
      productCodeId: id,
      productCode: productCode.productCode,
      hasActiveStock,
      hasHistory,
      currentStock: parseFloat(currentStock.toFixed(2)),
      transactionCount,
      canDelete: !hasActiveStock, // ✅ Validasi berdasarkan stok aktual
      warningLevel: hasActiveStock
        ? 'danger'
        : hasHistory
          ? 'warning'
          : 'normal',
      checkDate: formattedCheckDate,
      source, // Debug info: 'daily_inventory', 'inventory_transactions', or 'none'
    });
  }

  async deleteProductCode(
    id: number,
    payload: DeleteProductCodeDto,
  ): Promise<ResponseSuccess> {
    // Validasi inventory sebelum delete
    const inventoryStatus = await this.checkInventoryStatus(id);

    if (inventoryStatus.status === 'fail') {
      return inventoryStatus;
    }

    const { hasActiveStock, currentStock, productCode } = inventoryStatus.data;

    // PREVENT: Jika masih ada stok aktif
    if (hasActiveStock) {
      return this._fail(
        `Kode barang ${productCode} tidak dapat dihapus karena masih memiliki stok aktif sebanyak ${currentStock}. Silakan kosongkan stok terlebih dahulu melalui transaksi inventory.`,
        400,
      );
    }
    const result = await this.productCodeRepo.update(id, payload);

    if (result.affected === 0)
      throw new NotFoundException(
        `Product code dengan ID ${id} tidak ditemukan`,
      );

    return this._success(`Berhasil menghapus product code dengan ID ${id}`);
  }

  // * --- PRODUCTS --- */
  async findAllProducts(query: QueryProductDto): Promise<ResponsePagination> {
    const { pageSize, limit, page, subCategory } = query;

    // Build where clause dynamically
    const whereClause: any = {};

    if (subCategory) {
      // Filter by sub-category name (level 1)
      whereClause.category = { name: subCategory };
    }

    const [result, count] = await this.productRepo.findAndCount({
      where: whereClause,
      select: ['id', 'name', 'productType', 'imageUrl', 'isActive'],
      relations: ['category'],
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

    // ✅ SWAPPED STRUCTURE: Products.category should use SUB category (level 1)
    // Main category relationship is now stored in ProductCodes.category
    let subCategoryId: number;
    let subCategoryName: string;

    if (category.level !== 1) {
      throw new BadRequestException(
        `Invalid category. Products must use SUB category (level 1 - Buffet, Premium, Freshly). ` +
          `Category "${category.name}" has level ${category.level}.`,
      );
    }

    // This is a sub-category - use directly
    subCategoryId = category.id;
    subCategoryName = category.name.toUpperCase();

    // Get parent (main category) for validation
    const parentCategory = category.parent;
    if (!parentCategory) {
      throw new BadRequestException(
        `Sub-category "${category.name}" has no parent category.`,
      );
    }

    // Validate productType requirement based on parent main category
    const requiresProductType =
      parentCategory.name.toUpperCase() === 'BARANG JADI';

    if (requiresProductType && !payload.productType) {
      throw new ConflictException(
        'productType wajib diisi untuk kategori Barang Jadi',
      );
    }

    // ✅ ANTI-DUPLICATION: Check if combination (name + categoryId + productType) already exists
    const whereClause: any = {
      name: payload.name,
      category: { id: subCategoryId }, // Use sub-category ID
      deletedAt: null, // Only check non-deleted products
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
      // Product already exists - return existing instead of creating duplicate
      return this._success(
        `Product sudah ada: ${existingProduct.name} - ${existingProduct.category?.name || 'No SubCategory'} - ${existingProduct.productType || 'No Type'}`,
        existingProduct,
      );
    }

    // ✅ FIXED: Create new product with SUB category ID
    const newProduct = await this.productRepo.save({
      name: payload.name,
      productType: payload.productType ?? null,
      category: { id: subCategoryId }, // Use sub-category ID
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
