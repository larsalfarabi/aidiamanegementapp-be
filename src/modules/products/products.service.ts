import {
  Injectable,
  NotFoundException,
  ConflictException,
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
import { RedisService } from '../redis/redis.service';
import { Pagination } from '../../common/decorator/pagination.decorator';
import { Products } from './entity/products.entity';
import { ProductSizes } from './entity/product_sizes.entity';
import {
  ProductCategories,
  CategoryType,
} from './entity/product_categories.entity';
import { ProductCodeQueryDto, QueryProductDto } from './dto/products.dto';
import * as ExcelJS from 'exceljs';

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
    private readonly redisService: RedisService,
  ) {
    super();
  }

  // * --- PRODUCT CODES --- */
  async findAll(query: ProductCodeQueryDto): Promise<ResponsePagination> {
    const { pageSize, limit, page, mainCategory, subCategoryId, size, search } =
      query;

    // Cache Strategy
    const cacheKey = `products:codes:list:${JSON.stringify(query)}`;
    const cachedData =
      await this.redisService.get<ResponsePagination>(cacheKey);

    if (cachedData) {
      return {
        ...cachedData,
        message: cachedData.message + ' (from cache)',
      };
    }

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
      .skip(limit)
      .orderBy('pc.id', 'DESC');

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

    // ✅ NEW: Add search filter for productCode, product name, or category
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      queryBuilder.andWhere(
        '(pc.productCode LIKE :search OR products.name LIKE :search OR mainCategory.name LIKE :search)',
        { search: searchTerm },
      );
    }

    const [result, count] = await queryBuilder.getManyAndCount();

    const response = this._pagination(
      'Berhasil mengambil data product',
      result,
      count,
      page!,
      pageSize!,
    );

    // Cache for 5 minutes (300 seconds)
    await this.redisService.set(cacheKey, response, 300);

    return response;
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
    // Validation 1: Check if productCode already exists (must filter isDeleted: false)
    const checkProductCode = await this.productCodeRepo.findOne({
      where: { productCode: payload.productCode, isDeleted: false },
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
    const savedProductCode = await this.productCodeRepo.save({
      ...payload,
      product: { id: payload.product } as any,
      category: { id: payload.category } as any,
      size: { id: payload.size } as any,
    });

    // Fetch complete data for response
    const productCode = await this.productCodeRepo.findOne({
      where: { id: savedProductCode.id },
      relations: ['product', 'category', 'size'],
    });

    // [ROLLED BACK] Emit notification disabled

    return this._success('Berhasil membuat product code', {
      id: savedProductCode.id,
      productCode: savedProductCode.productCode,
      ...productCode,
    });
  }

  async updateProductCode(
    id: number,
    payload: UpdateProductCodeDto,
  ): Promise<ResponseSuccess> {
    // Step 1: Check if product code exists
    const existingProductCode = await this.productCodeRepo.findOne({
      where: { id },
      relations: ['product', 'category', 'size'],
    });

    if (!existingProductCode) {
      throw new NotFoundException(
        `Product code dengan ID ${id} tidak ditemukan`,
      );
    }

    // Step 2: If productCode is being changed, validate uniqueness
    if (
      payload.productCode &&
      payload.productCode !== existingProductCode.productCode
    ) {
      const duplicateCheck = await this.productCodeRepo.findOne({
        where: { productCode: payload.productCode, isDeleted: false },
      });

      if (duplicateCheck && duplicateCheck.id !== id) {
        throw new ConflictException(
          `Product code "${payload.productCode}" sudah digunakan`,
        );
      }
    }

    // Step 3: Build update object with only provided fields
    const updateData: any = {};

    if (payload.productCode !== undefined) {
      updateData.productCode = payload.productCode;
    }

    if (payload.product !== undefined) {
      updateData.product = { id: payload.product };
    }

    if (payload.category !== undefined) {
      updateData.category = { id: payload.category };
    }

    if (payload.size !== undefined) {
      updateData.size = { id: payload.size };
    }

    if (payload.isActive !== undefined) {
      updateData.isActive = payload.isActive;
    }

    if (payload.updatedBy !== undefined) {
      updateData.updatedBy = payload.updatedBy;
    }

    // Step 4: Perform the update
    await this.productCodeRepo.update(id, updateData);

    // Step 5: Fetch updated data for response
    const updatedProductCode = await this.productCodeRepo.findOne({
      where: { id },
      relations: ['product', 'category', 'size'],
    });

    return this._success(
      `Berhasil mengupdate product code dengan ID ${id}`,
      updatedProductCode,
    );
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

    // Fetch product data before deletion for notification
    const product = await this.productCodeRepo.findOne({
      where: { id },
      relations: ['product', 'category'],
    });
    if (!product) {
      throw new NotFoundException(
        `Product code dengan ID ${id} tidak ditemukan`,
      );
    }

    const result = await this.productCodeRepo.update(id, payload);

    if (result.affected === 0)
      throw new NotFoundException(
        `Product code dengan ID ${id} tidak ditemukan`,
      );

    // [ROLLED BACK] Emit notification disabled

    return this._success(`Berhasil menghapus product code dengan ID ${id}`);
  }

  // * --- PRODUCTS --- */
  async findAllProducts(query: QueryProductDto): Promise<ResponsePagination> {
    const { pageSize, limit, page, mainCategory, subCategory } = query;

    // Use QueryBuilder for complex joins (filtering by parent category)
    const queryBuilder = this.productRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.category', 'productCategory')
      .leftJoin('productCategory.parent', 'parentCategory')
      .select([
        'p.id',
        'p.name',
        'p.productType',
        'p.imageUrl',
        'p.isActive',
        'productCategory.id',
        'productCategory.name',
        'productCategory.level',
      ]);

    // Filter by main category
    // Products can be linked to:
    // - Level 1 categories (sub-categories) - filter via parent
    // - Level 0 categories (main without sub) - filter via category directly
    if (mainCategory) {
      queryBuilder.andWhere(
        '(parentCategory.name = :mainCategory OR (productCategory.level = 0 AND productCategory.name = :mainCategory))',
        { mainCategory },
      );
    }

    // Filter by sub-category name directly
    if (subCategory) {
      queryBuilder.andWhere('productCategory.name = :subCategory', {
        subCategory,
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

    // Determine category ID to use for Products table
    let categoryIdForProduct: number;
    let categoryName: string;
    let mainCategoryName: string;

    if (category.level === 0) {
      // This is a main category (level 0)
      // Check if it has any sub-categories
      const subCategoriesCount = await this.productCategoryRepo.count({
        where: { parentId: category.id },
      });

      if (subCategoriesCount > 0) {
        // Main category HAS sub-categories - reject and require sub-category
        throw new BadRequestException(
          `Kategori "${category.name}" memiliki sub-kategori. Silakan pilih sub-kategori terlebih dahulu.`,
        );
      }

      // Main category has NO sub-categories - use directly
      // (e.g., Barang Baku, Barang Kemasan, Barang Pembantu)
      categoryIdForProduct = category.id;
      categoryName = category.name.toUpperCase();
      mainCategoryName = category.name.toUpperCase();
    } else if (category.level === 1) {
      // This is a sub-category - use directly
      categoryIdForProduct = category.id;
      categoryName = category.name.toUpperCase();

      // Get parent (main category) for validation
      const parentCategory = category.parent;
      if (!parentCategory) {
        throw new BadRequestException(
          `Sub-category "${category.name}" has no parent category.`,
        );
      }
      mainCategoryName = parentCategory.name.toUpperCase();
    } else {
      throw new BadRequestException(
        `Category level ${category.level} is not supported. Use level 0 (main) or level 1 (sub).`,
      );
    }

    // Validate productType requirement based on main category
    const requiresProductType = mainCategoryName === 'BARANG JADI';

    if (requiresProductType && !payload.productType) {
      throw new ConflictException(
        'productType wajib diisi untuk kategori Barang Jadi',
      );
    }

    // ✅ ANTI-DUPLICATION: Check if combination (name + categoryId + productType) already exists
    const whereClause: any = {
      name: payload.name,
      category: { id: categoryIdForProduct },
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
        `Product sudah ada: ${existingProduct.name} - ${existingProduct.category?.name || 'No Category'} - ${existingProduct.productType || 'No Type'}`,
        existingProduct,
      );
    }

    // ✅ Create new product with the determined category ID
    const newProduct = await this.productRepo.save({
      name: payload.name,
      productType: payload.productType ?? null,
      category: { id: categoryIdForProduct },
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
      'Berhasil mengambil data product',
      result,
      count,
      page!,
      pageSize!,
    );
  }

  /**
   * Generate Excel template for Product Code upload
   */
  async generateExcelTemplate(category?: string): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Template Upload Product');

    // Context-Aware Columns
    const isBarangJadi = category?.toUpperCase() === 'BARANG JADI';
    const isOther = category && !isBarangJadi;

    if (isBarangJadi) {
      // Columns for Barang Jadi
      worksheet.columns = [
        { header: 'Kode Produk', key: 'productCode', width: 30 },
        { header: 'Nama Produk', key: 'productName', width: 35 },
        { header: 'Sub Kategori', key: 'subCategory', width: 25 },
        { header: 'Tipe Produk', key: 'productType', width: 20 },
        { header: 'Ukuran Produk', key: 'sizeValue', width: 20 },
      ];
    } else if (isOther) {
      // Columns for Raw/Packaging/Supporting
      worksheet.columns = [
        { header: 'Kode Produk', key: 'productCode', width: 30 },
        { header: 'Nama Produk', key: 'productName', width: 35 },
        { header: 'Satuan', key: 'sizeValue', width: 20 },
      ];
    } else {
      // Default / Fallback (All columns if no category specified)
      worksheet.columns = [
        { header: 'Kategori Utama (Main)', key: 'mainCategory', width: 25 },
        { header: 'Sub Kategori', key: 'subCategory', width: 25 },
        { header: 'Nama Produk (Konsep)', key: 'productName', width: 35 },
        { header: 'Kode Produk', key: 'productCode', width: 30 },
        { header: 'Ukuran/Satuan', key: 'sizeValue', width: 20 },
      ];
    }

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.height = 25;
    const cellCount = worksheet.columns.length;
    for (let i = 1; i <= cellCount; i++) {
      const cell = headerRow.getCell(i);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    }

    // Example Data based on category
    // Example Data based on category
    if (isBarangJadi) {
      worksheet.addRow({
        productCode: 'MANGO-FRESH-250ML',
        productName: 'Mangga',
        subCategory: 'FRESHLY',
        productType: 'RTD',
        sizeValue: '250 ML',
      });
    } else if (category?.toUpperCase() === 'BAHAN BAKU') {
      worksheet.addRow({
        productCode: 'GULA-KG',
        productName: 'Gula Pasir',
        sizeValue: '1 KG',
      });
    } else if (category) {
      // Generic example for others
      worksheet.addRow({
        productCode: 'ITEM-001',
        productName: 'Item Name',
        sizeValue: '1 PCS',
      });
    } else {
      // Default examples
      worksheet.addRow({
        mainCategory: 'BARANG JADI',
        subCategory: 'FRESHLY',
        productName: 'Mangga',
        productCode: 'MANGO-FRESH-250ML',
        sizeValue: '250 ML',
      });
    }

    // Instructions Sheet
    const instructionSheet = workbook.addWorksheet('Petunjuk Pengisian');
    instructionSheet.columns = [
      { header: 'Kolom', key: 'column', width: 25 },
      { header: 'Keterangan', key: 'description', width: 70 },
      { header: 'Wajib', key: 'required', width: 10 },
    ];

    // Style instruction header (Cell-based to avoid full row fill)
    const headerCells = ['A1', 'B1', 'C1'];
    headerCells.forEach((cellAddress) => {
      const cell = instructionSheet.getCell(cellAddress);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF70AD47' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
    instructionSheet.getRow(1).height = 25;

    let instructions = [];

    if (isBarangJadi) {
      instructions = [
        {
          column: 'Kode Produk',
          description: 'Kode unik barang',
          required: 'Ya',
        },
        {
          column: 'Nama Produk',
          description: 'Nama umum produk',
          required: 'Ya',
        },
        {
          column: 'Sub Kategori',
          description: 'Wajib diisi (FRESHLY, PREMIUM, BUFFET)',
          required: 'Ya',
        },
        {
          column: 'Tipe Produk',
          description: 'Tipe spesifik (RTD, CONC)',
          required: 'Ya',
        },
        {
          column: 'Ukuran Produk',
          description: 'Contoh: 250 ML, 1 LITER',
          required: 'Ya',
        },
      ];
    } else if (isOther) {
      instructions = [
        {
          column: 'Kode Produk',
          description: 'Kode unik barang',
          required: 'Ya',
        },
        {
          column: 'Nama Produk',
          description: 'Nama umum produk',
          required: 'Ya',
        },
        {
          column: 'Satuan',
          description: 'Satuan ukuran (KG, PCS, LITER)',
          required: 'Ya',
        },
      ];
    } else {
      // Default instructions
      instructions = [
        {
          column: 'Kategori Utama',
          description: 'Pilih: BARANG JADI, dsb',
          required: 'Ya',
        },
        {
          column: 'Sub Kategori',
          description: 'Untuk Barang Jadi',
          required: 'Kondisional',
        },
        {
          column: 'Nama Produk',
          description: 'Nama konsep produk',
          required: 'Ya',
        },
        { column: 'Kode Produk', description: 'Kode unik SKU', required: 'Ya' },
        { column: 'Ukuran', description: 'Ukuran/Satuan', required: 'Ya' },
      ];
    }

    instructions.forEach((instr) => {
      const row = instructionSheet.addRow(instr);
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
    });

    // Add general notes
    instructionSheet.addRow([]);
    instructionSheet.addRow(['CATATAN PENTING:']).font = {
      bold: true,
      size: 12,
    };
    instructionSheet.addRow([
      '1. Pastikan semua kolom yang wajib diisi tidak kosong',
    ]);
    instructionSheet.addRow([
      '2. Kode Produk harus UNIK. Jika kode sudah ada, data akan di-update.',
    ]);
    instructionSheet.addRow([
      '3. Untuk Barang Jadi, Sub Kategori dan Tipe Produk (RTD/CONC) wajib diisi sesuai pilihan.',
    ]);
    instructionSheet.addRow([
      '4. Ukuran/Satuan harus sesuai dengan Master Size yang terdaftar.',
    ]);
    instructionSheet.addRow([
      '5. Hapus baris contoh sebelum mengisi data produk Anda',
    ]);
    instructionSheet.addRow([
      '6. Maksimal 1000 baris data dalam satu file upload',
    ]);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Resolve or Create Product Concept (Name + SubCategory)
   */
  /**
   * Resolve or Create Product Concept (Name + SubCategory + ProductType)
   */
  private async resolveOrCrateProductConcept(
    productName: string,
    subCategoryId: number | null, // Allow null for non-Barang Jadi
    createdBy: { id: number },
    productType?: string,
  ): Promise<Products> {
    const nameUpper = productName.toUpperCase().trim();

    // Check existing - handle null subCategoryId
    const whereClause: any = {
      name: nameUpper,
    };
    if (subCategoryId) {
      whereClause.category = { id: subCategoryId };
    } else {
      // For products without sub-category (e.g. Barang Baku), match by name + productType only
      // categoryId will be null in DB
    }
    if (productType) {
      whereClause.productType = productType;
    }

    const existing = await this.productRepo.findOne({
      where: whereClause,
      relations: ['category'],
    });

    if (existing) return existing;

    // Create new
    const newProduct = this.productRepo.create({
      name: nameUpper,
      category: subCategoryId ? { id: subCategoryId } : undefined, // Allow null (undefined for TypeORM)
      productType: (productType as any) || null,
      isActive: true,
      createdBy,
    });

    return await this.productRepo.save(newProduct);
  }

  /**
   * Upload and process Excel file for Product Code data
   */
  async uploadExcelFile(
    fileBuffer: Buffer,
    createdBy: { id: number },
    category?: string,
  ): Promise<import('./dto/products.dto').ExcelProductUploadResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as any);

    const worksheet = workbook.getWorksheet('Template Upload Product');
    if (!worksheet) {
      throw new BadRequestException(
        'Sheet "Template Upload Product" tidak ditemukan dalam file Excel',
      );
    }

    const result: import('./dto/products.dto').ExcelProductUploadResult = {
      totalRows: 0,
      successCount: 0,
      failedCount: 0,
      errors: [],
      successDetails: [],
    };

    // Cache Data for Performance
    const mainCategories = await this.productCategoryRepo.find({
      where: { level: 0 },
    });
    const subCategories = await this.productCategoryRepo.find({
      where: { level: 1 },
    });
    const sizes = await this.productSizeRepo.find();

    // Key-Value Maps for fast lookup
    const mainCategoryMap = new Map(
      mainCategories.map((c) => [c.name.toUpperCase(), c]),
    );
    const subCategoryMap = new Map(
      subCategories.map((c) => [c.name.toUpperCase(), c]),
    );

    // Determine Context
    const isBarangJadi = category?.toUpperCase() === 'BARANG JADI';
    const isOther = category && !isBarangJadi;

    // Resolve Main Category Context
    let contextMainCat = null;
    if (category) {
      contextMainCat = mainCategoryMap.get(category.toUpperCase());
      if (!contextMainCat) {
        throw new BadRequestException(
          `Category context "${category}" not found in database`,
        );
      }
    }

    const rowsToProcess: any[] = [];

    // First pass: Read and basic validation
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header

      const rowValues = row.values as any[];
      const isEmptyRow =
        !rowValues ||
        rowValues.every(
          (cell) => cell === null || cell === undefined || cell === '',
        );
      if (isEmptyRow) return;

      result.totalRows++;

      // Variables
      let mainCatName = contextMainCat ? contextMainCat.name : '';
      let subCatName = '';
      let productName = '';
      let productCode = '';
      let sizeValueRaw = '';
      let productType = ''; // New field

      // Map Columns based on Context
      if (isBarangJadi) {
        // Columns: Code(1), Name(2), SubCat(3), Type(4), Size(5)
        productCode =
          row.getCell(1).value?.toString().trim().toUpperCase() || '';
        productName =
          row.getCell(2).value?.toString().trim().toUpperCase() || '';
        subCatName =
          row.getCell(3).value?.toString().trim().toUpperCase() || '';
        productType =
          row.getCell(4).value?.toString().trim().toUpperCase() || '';
        sizeValueRaw =
          row.getCell(5).value?.toString().trim().toUpperCase() || '';
      } else if (isOther) {
        // Columns: Code(1), Name(2), Unit(3)
        productCode =
          row.getCell(1).value?.toString().trim().toUpperCase() || '';
        productName =
          row.getCell(2).value?.toString().trim().toUpperCase() || '';
        sizeValueRaw =
          row.getCell(3).value?.toString().trim().toUpperCase() || ''; // Unit mapped to Size
      } else {
        // Default: Main(1), Sub(2), Name(3), Code(4), Size(5)
        mainCatName =
          row.getCell(1).value?.toString().trim().toUpperCase() || '';
        subCatName =
          row.getCell(2).value?.toString().trim().toUpperCase() || '';
        productName =
          row.getCell(3).value?.toString().trim().toUpperCase() || '';
        productCode =
          row.getCell(4).value?.toString().trim().toUpperCase() || '';
        sizeValueRaw =
          row.getCell(5).value?.toString().trim().toUpperCase() || '';
      }

      const rowErrors: string[] = [];

      // Validation
      if (!productName) rowErrors.push('Nama Produk wajib diisi');
      if (!productCode) rowErrors.push('Kode Produk wajib diisi');
      if (!sizeValueRaw) rowErrors.push('Ukuran/Satuan wajib diisi');

      // Context checks
      if (!isBarangJadi && !isOther && !mainCatName) {
        rowErrors.push(
          'Kategori Utama wajib diisi (jika tidak menggunakan context upload)',
        );
      }

      // Main Category Validation
      const mainCat = contextMainCat || mainCategoryMap.get(mainCatName);
      if (!mainCat) {
        rowErrors.push(`Kategori Utama "${mainCatName}" tidak ditemukan`);
      }

      // Sub Category Validation
      // Logic: Required if Main Category == BARANG JADI
      // Logic: For others (BAHAN BAKU), SubCat might be empty but we need a default one?
      // Let's resolve SubCat object
      let subCat = subCatName ? subCategoryMap.get(subCatName) : null;

      if (mainCat?.name.toUpperCase() === 'BARANG JADI') {
        if (!subCatName) {
          rowErrors.push('Sub Kategori wajib diisi untuk Barang Jadi');
        } else if (!subCat) {
          rowErrors.push(`Sub Kategori "${subCatName}" tidak ditemukan`);
        }

        if (!productType && isBarangJadi) {
          // Only enforce if using new template version
          rowErrors.push('Tipe Produk wajib diisi untuk Barang Jadi');
        }
      }

      if (rowErrors.length > 0) {
        result.failedCount++;
        result.errors.push({
          row: rowNumber,
          productName,
          errors: rowErrors,
        });
        return; // Skip processing for this row
      }

      rowsToProcess.push({
        rowNumber,
        mainCat,
        subCat, // Can be null
        productName,
        productCode,
        sizeValueRaw,
        productType,
      });
    });

    // Process Valid Rows
    for (const rowData of rowsToProcess) {
      try {
        // 1. Resolve Size
        const targetSize = sizes.find(
          (s) =>
            rowData.sizeValueRaw === `${s.sizeValue} ${s.unitOfMeasure}` || // e.g. "250 ML"
            rowData.sizeValueRaw === s.sizeValue || // e.g. "250"
            rowData.sizeValueRaw === s.unitOfMeasure, // e.g. "KG" (for raw materials often just Unit)
        );

        if (!targetSize) {
          throw new Error(
            `Ukuran/Satuan "${rowData.sizeValueRaw}" tidak ditemukan. Pastikan sesuai Master Size.`,
          );
        }

        // 2. Resolve SubCategory
        // For "Barang Jadi": subCategory is required (FRESHLY, PREMIUM, BUFFET)
        // For others (Barang Baku, Kemasan, Pembantu): subCategory is null
        let finalSubCatId: number | null = rowData.subCat?.id ?? null;

        // If this is Barang Jadi without SubCat, try finding one under main category
        if (
          !finalSubCatId &&
          rowData.mainCat?.name?.toUpperCase() === 'BARANG JADI'
        ) {
          const genericSub = subCategories.find(
            (s) => s.parentId === rowData.mainCat.id,
          );
          if (genericSub) {
            finalSubCatId = genericSub.id;
          }
          // Note: If still null for Barang Jadi, validation earlier should have caught it
        }
        // For non-Barang Jadi main categories, finalSubCatId stays null - this is correct!

        // 3. Resolve/Create Product Concept
        const product = await this.resolveOrCrateProductConcept(
          rowData.productName,
          finalSubCatId, // Can be null for Barang Baku/Kemasan/Pembantu
          createdBy,
          rowData.productType, // Valid context for uniqueness
        );

        // 4. Create/Update Product Code
        const existingCode = await this.productCodeRepo.findOne({
          where: { productCode: rowData.productCode },
        });

        if (existingCode) {
          existingCode.product = product;
          existingCode.category = rowData.mainCat;
          existingCode.size = targetSize;
          await this.productCodeRepo.save(existingCode);
        } else {
          const newCode = this.productCodeRepo.create({
            productCode: rowData.productCode,
            product: product,
            category: rowData.mainCat,
            size: targetSize,
            isActive: true,
            createdBy,
          });
          await this.productCodeRepo.save(newCode);
        }

        result.successCount++;
        result.successDetails.push({
          row: rowData.rowNumber,
          productName: rowData.productName,
          productCode: rowData.productCode,
        });
      } catch (error) {
        result.failedCount++;
        result.errors.push({
          row: rowData.rowNumber,
          productName: rowData.productName,
          errors: [error.message],
        });
      }
    }

    return result;
  }
}
