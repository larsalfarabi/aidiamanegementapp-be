import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import BaseResponse from '../../../common/response/base.response';
import { ProductionFormulas, FormulaMaterials } from '../entities';
import { Products } from '../../products/entity/products.entity';
import { ProductCodes } from '../../products/entity/product_codes.entity';
import { ProductCategories } from '../../products/entity/product_categories.entity';
import { CreateFormulaDto, UpdateFormulaDto, FilterFormulaDto } from '../dto';
import { RedisService } from '../../redis/redis.service';
import { ResponsePagination } from '../../../common/interface/response.interface';

@Injectable()
export class ProductionFormulaService extends BaseResponse {
  private readonly logger = new Logger(ProductionFormulaService.name);

  constructor(
    @InjectRepository(ProductionFormulas)
    private readonly formulaRepository: Repository<ProductionFormulas>,
    @InjectRepository(FormulaMaterials)
    private readonly formulaMaterialRepository: Repository<FormulaMaterials>,
    @InjectRepository(Products)
    private readonly productRepository: Repository<Products>,
    @InjectRepository(ProductCodes)
    private readonly productCodeRepository: Repository<ProductCodes>,
    @InjectRepository(ProductCategories)
    private readonly categoryRepository: Repository<ProductCategories>,
    private readonly redisService: RedisService,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  /**
   * Generate Formula Code
   * Format: FORMULA-{PRODUCTNAME+CATEGORY+TYPE}-v{VERSION}
   * Example: FORMULA-MANGOJUICE-PREMIUM-RTD-v1.0
   */
  private async generateFormulaCode(
    productId: number,
    version: string,
  ): Promise<string> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
      relations: ['category'],
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    // Get product name, category, and type
    const productName = product.name || 'UNKNOWN';
    const categoryName = product.category?.name || 'UNKNOWN';
    const productType = product.productType || 'UNKNOWN';

    // Clean and format
    const cleanProductName = productName
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/[^A-Z0-9]/g, '');
    const cleanCategoryName = categoryName
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/[^A-Z0-9]/g, '');
    const cleanProductType = productType
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/[^A-Z0-9]/g, '');

    return `FORMULA-${cleanProductName}-${cleanCategoryName}-${cleanProductType}-v${version}`;
  }

  /**
   * Create Production Formula with Materials (BOM)
   * NOW SUPPORTS: Product-based formulas (not productCode-based)
   */
  async createFormula(dto: CreateFormulaDto, userId: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Validate product exists
      const product = await this.productRepository.findOne({
        where: { id: dto.productId },
        relations: ['category'],
      });

      if (!product) {
        throw new NotFoundException(
          `Product with ID ${dto.productId} not found`,
        );
      }

      // 2. Validate productCodeId if provided (optional)
      if (dto.productCodeId) {
        const productCode = await this.productCodeRepository.findOne({
          where: { id: dto.productCodeId },
          relations: ['product'],
        });

        if (!productCode) {
          throw new NotFoundException(
            `Product code with ID ${dto.productCodeId} not found`,
          );
        }

        // Ensure productCodeId belongs to the same product
        if (productCode.product.id !== dto.productId) {
          throw new BadRequestException(
            `Product code ${productCode.productCode} does not belong to product ${product.name}`,
          );
        }
      }

      // 3. Generate formula code
      const version = dto.version || '1.0';
      const formulaCode = await this.generateFormulaCode(
        dto.productId,
        version,
      );

      // 3. Check duplicate formula code
      const existingFormula = await this.formulaRepository.findOne({
        where: { formulaCode },
      });

      if (existingFormula) {
        throw new ConflictException(
          `Formula code ${formulaCode} already exists. Use different version or product.`,
        );
      }

      // 4. Validate materials exist and category is valid
      for (const material of dto.materials) {
        const materialExists = await this.productCodeRepository.findOne({
          where: { id: material.materialProductCodeId },
        });

        if (!materialExists) {
          throw new NotFoundException(
            `Material product code ${material.materialProductCodeId} not found`,
          );
        }
      }

      // 5. Create formula
      const formulaData: Partial<ProductionFormulas> = {
        formulaCode,
        formulaName: dto.formulaName,
        version,
        productId: dto.productId, // PRIMARY: Product concept
        productCodeId: dto.productCodeId || null, // OPTIONAL: Specific product size

        isActive: dto.isActive !== undefined ? dto.isActive : true,
        effectiveFrom: new Date(dto.effectiveFrom),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        createdBy: userId,
      };

      const formula = this.formulaRepository.create(formulaData);

      const [savedFormula] = await queryRunner.manager.save(
        ProductionFormulas,
        [formula],
      );

      // 7. Create formula materials (BOM)
      const materials = await Promise.all(
        dto.materials.map(async (material, index) => {
          // Auto-populate unit from productSize if not provided
          let unit = material.unit;
          if (!unit) {
            const productCode = await this.productCodeRepository.findOne({
              where: { id: material.materialProductCodeId },
              relations: ['size'],
            });
            unit = productCode?.size?.unitOfMeasure || 'KG';
          }

          const totalCost = material.standardUnitCost
            ? material.rumus * material.standardUnitCost
            : null;

          const materialData: Partial<FormulaMaterials> = {
            formulaId: savedFormula.id,
            materialProductCodeId: material.materialProductCodeId,
            rumus: material.rumus,
            unit,
            standardUnitCost: material.standardUnitCost || null,
            totalCost,
            sequence: material.sequence || index + 1,
            isActive: true,
            createdBy: userId,
          };

          return this.formulaMaterialRepository.create(materialData);
        }),
      );

      await queryRunner.manager.save(materials);

      await queryRunner.commitTransaction();

      // 8. Fetch complete formula with relations
      const completeFormula = await this.formulaRepository.findOne({
        where: { id: savedFormula.id },
        relations: [
          'product',
          'product.category', // Products.category = Sub Category (level 1)
          'productCode',
          'productCode.product',
          'productCode.category', // ✅ SWAPPED: ProductCodes.category = Main Category (level 0)
          'materials',
          'materials.materialProductCode',
        ],
      });

      this.logger.log(`Formula created: ${formulaCode} by user ${userId}`);

      return this._success(
        'Production formula created successfully',
        completeFormula,
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to create formula', error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get All Formulas with Pagination & Filters
   */
  async getFormulas(filterDto: FilterFormulaDto) {
    try {
      const {
        page,
        pageSize,
        limit,
        productId,
        productCodeId,
        isActive,
        search,
      } = filterDto;

      // Cache Strategy
      const cacheKey = `formulas:list:${JSON.stringify(filterDto)}`;
      const cachedData =
        await this.redisService.get<ResponsePagination>(cacheKey);

      if (cachedData) {
        return {
          ...cachedData,
          message: cachedData.message + ' (from cache)',
        };
      }

      const queryBuilder = this.formulaRepository
        .createQueryBuilder('formula')
        .leftJoinAndSelect('formula.product', 'product')
        .leftJoinAndSelect('product.category', 'productCategory')
        .leftJoinAndSelect('formula.productCode', 'productCode')
        .leftJoinAndSelect('formula.materials', 'materials')
        .leftJoinAndSelect(
          'materials.materialProductCode',
          'materialProductCode',
        )
        .leftJoinAndSelect('materialProductCode.product', 'materialProduct')
        .leftJoinAndSelect(
          'materialProduct.category',
          'materialProductCategory',
        )
        .orderBy('formula.createdAt', 'DESC');

      // Apply filters
      if (productId) {
        queryBuilder.andWhere('formula.productId = :productId', {
          productId,
        });
      }

      if (productCodeId) {
        queryBuilder.andWhere('formula.productCodeId = :productCodeId', {
          productCodeId,
        });
      }

      if (isActive !== undefined) {
        queryBuilder.andWhere('formula.isActive = :isActive', {
          isActive,
        });
      }

      if (search) {
        queryBuilder.andWhere(
          '(formula.formulaName LIKE :search OR formula.formulaCode LIKE :search)',
          { search: `%${search}%` },
        );
      }

      const [formulas, total] = await queryBuilder
        .skip(limit)
        .take(pageSize)
        .getManyAndCount();

      const response = this._pagination(
        'Formulas retrieved successfully',
        formulas,
        total,
        page!,
        pageSize!,
      );

      // Cache for 5 minutes
      await this.redisService.set(cacheKey, response, 300);

      return response;
    } catch (error) {
      this.logger.error('Failed to get formulas', error.stack);
      throw error;
    }
  }

  /**
   * Get Formula by ID
   */
  async getFormulaById(id: number) {
    try {
      const formula = await this.formulaRepository.findOne({
        where: { id },
        relations: [
          'product',
          'product.category', // ✅ SWAPPED: ProductCodes.category = Main Category (level 0)
          'materials',
          'materials.materialProductCode',
          'materials.materialProductCode.product',
          'materials.materialProductCode.category', // Products.category = Sub Category (level 1)
        ],
      });

      if (!formula) {
        throw new NotFoundException(`Formula with ID ${id} not found`);
      }

      return this._success('Formula retrieved successfully', formula);
    } catch (error) {
      this.logger.error(`Failed to get formula ${id}`, error.stack);
      throw error;
    }
  }

  /**
   * Get Active Formula by Product Code ID
   */
  async getActiveFormulaByProductId(productCodeId: number) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const formula = await this.formulaRepository
        .createQueryBuilder('formula')
        .leftJoinAndSelect('formula.productCode', 'productCode')
        .leftJoinAndSelect('formula.materials', 'materials')
        .leftJoinAndSelect(
          'materials.materialProductCode',
          'materialProductCode',
        )
        .where('formula.productCodeId = :productCodeId', { productCodeId })
        .andWhere('formula.isActive = :isActive', { isActive: true })
        .andWhere('formula.effectiveFrom <= :today', { today })
        .andWhere(
          '(formula.effectiveTo IS NULL OR formula.effectiveTo >= :today)',
          { today },
        )
        .orderBy('formula.version', 'DESC')
        .getOne();

      if (!formula) {
        throw new NotFoundException(
          `No active formula found for product code ${productCodeId}`,
        );
      }

      return this._success('Active formula retrieved successfully', formula);
    } catch (error) {
      this.logger.error(
        `Failed to get active formula for product ${productCodeId}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Update Formula
   */
  async updateFormula(id: number, dto: UpdateFormulaDto, userId: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const formula = await this.formulaRepository.findOne({
        where: { id },
        relations: ['materials'],
      });

      if (!formula) {
        throw new NotFoundException(`Formula with ID ${id} not found`);
      }

      // Update formula fields
      if (dto.formulaName) formula.formulaName = dto.formulaName;

      if (dto.isActive !== undefined) formula.isActive = dto.isActive;
      if (dto.effectiveFrom)
        formula.effectiveFrom = new Date(dto.effectiveFrom);
      if (dto.effectiveTo !== undefined)
        formula.effectiveTo = dto.effectiveTo
          ? new Date(dto.effectiveTo)
          : null;

      formula.updatedBy = userId;

      await queryRunner.manager.save(formula);

      // Update materials if provided
      if (dto.materials) {
        // Delete existing materials
        await queryRunner.manager.delete(FormulaMaterials, {
          formulaId: id,
        });

        // Create new materials with auto-populated unit
        const materials = await Promise.all(
          dto.materials.map(async (material, index) => {
            // Auto-populate unit from productSize if not provided
            let unit = material.unit;
            if (!unit) {
              const productCode = await this.productCodeRepository.findOne({
                where: { id: material.materialProductCodeId },
                relations: ['size'],
              });
              unit = productCode?.size?.unitOfMeasure || 'KG';
            }

            const totalCost = material.standardUnitCost
              ? material.rumus * material.standardUnitCost
              : null;

            const materialData: Partial<FormulaMaterials> = {
              formulaId: id,
              materialProductCodeId: material.materialProductCodeId,
              rumus: material.rumus,
              unit,
              standardUnitCost: material.standardUnitCost || null,
              totalCost,
              sequence: material.sequence || index + 1,
              isActive: true,
              createdBy: userId,
            };

            return this.formulaMaterialRepository.create(materialData);
          }),
        );

        await queryRunner.manager.save(materials);
      }

      await queryRunner.commitTransaction();

      // Fetch updated formula
      const updatedFormula = await this.formulaRepository.findOne({
        where: { id },
        relations: [
          'productCode',
          'productCode.product',
          'materials',
          'materials.materialProductCode',
        ],
      });

      this.logger.log(`Formula ${id} updated by user ${userId}`);

      return this._success('Formula updated successfully', updatedFormula);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to update formula ${id}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Deactivate Formula (Soft Delete)
   */
  async deactivateFormula(id: number, userId: number) {
    try {
      const formula = await this.formulaRepository.findOne({
        where: { id },
      });

      if (!formula) {
        throw new NotFoundException(`Formula with ID ${id} not found`);
      }

      formula.isActive = false;
      formula.effectiveTo = new Date();
      formula.updatedBy = userId;

      await this.formulaRepository.save(formula);

      this.logger.log(`Formula ${id} deactivated by user ${userId}`);

      return this._success('Formula deactivated successfully', formula);
    } catch (error) {
      this.logger.error(`Failed to deactivate formula ${id}`, error.stack);
      throw error;
    }
  }

  /**
   * Calculate Material Requirements for Batch
   * Returns materials with calculated planned quantities based on target production
   *
   * Formula: Planned Quantity = rumus × Target Production (Liters)
   *
   * @param formulaId - Formula ID
   * @param targetLiters - Target production volume in liters (e.g., 40L)
   * @returns Array of materials with calculated quantities
   *
   * Example:
   * - Formula: LEMON BUFFET
   * - Target: 40 Liters
   * - Material: LEMON PREMIUM (rumus = 0.50)
   * - Calculated: 0.50 × 40 = 20.00 liters
   */
  async calculateMaterialRequirements(
    formulaId: number,
    targetLiters: number,
  ): Promise<
    {
      materialProductCodeId: number;
      materialCode: string;
      materialName: string;
      rumus: number;
      unit: string;
      plannedQuantity: number;
      sequence: number;
      standardUnitCost: number | null;
    }[]
  > {
    this.logger.log(
      `Calculating material requirements for formula ${formulaId}, target ${targetLiters}L`,
    );

    const formula = await this.formulaRepository.findOne({
      where: { id: formulaId },
      relations: [
        'materials',
        'materials.materialProductCode',
        'materials.materialProductCode.product',
      ],
    });

    if (!formula) {
      throw new NotFoundException(`Formula with ID ${formulaId} not found`);
    }

    if (!formula.isActive) {
      throw new BadRequestException(
        `Cannot use inactive formula ${formula.formulaName}`,
      );
    }

    // Calculate planned quantities for each material
    const calculatedMaterials = formula.materials
      .filter((m) => m.isActive)
      .map((material) => ({
        materialProductCodeId: material.materialProductCodeId,
        materialCode: material.materialProductCode?.productCode || 'N/A',
        materialName:
          material.materialProductCode?.product?.name || 'Unknown Material',
        rumus: Number(material.rumus),
        unit: material.unit,
        plannedQuantity: material.calculatePlannedQuantity(targetLiters),
        sequence: material.sequence,
        standardUnitCost: material.standardUnitCost
          ? Number(material.standardUnitCost)
          : null,
      }))
      .sort((a, b) => a.sequence - b.sequence);

    this.logger.log(
      `Calculated ${calculatedMaterials.length} materials for formula ${formulaId}`,
    );

    return calculatedMaterials;
  }
}
