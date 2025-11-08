import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductCategories } from '../entity/product_categories.entity';
import { CategoryType } from '../entity/product_categories.entity';

/**
 * Service untuk validasi dan helper methods terkait category hierarchy
 */
@Injectable()
export class CategoryHierarchyService {
  constructor(
    @InjectRepository(ProductCategories)
    private readonly categoryRepo: Repository<ProductCategories>,
  ) {}

  /**
   * Validate bahwa category dengan ID tertentu adalah main category (level 0)
   */
  async validateIsMainCategory(categoryId: number): Promise<ProductCategories> {
    const category = await this.categoryRepo.findOne({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException(
        `Category dengan ID ${categoryId} tidak ditemukan`,
      );
    }

    if (category.level !== 0 || category.categoryType !== CategoryType.MAIN) {
      throw new BadRequestException(
        `Category "${category.name}" bukan main category`,
      );
    }

    return category;
  }

  /**
   * Validate bahwa category adalah sub-category (level 1)
   * dan optional: validate bahwa parent-nya sesuai
   */
  async validateIsSubCategory(
    categoryId: number,
    expectedParentId?: number,
  ): Promise<ProductCategories> {
    const category = await this.categoryRepo.findOne({
      where: { id: categoryId },
      relations: ['parent'],
    });

    if (!category) {
      throw new NotFoundException(
        `Category dengan ID ${categoryId} tidak ditemukan`,
      );
    }

    if (category.level !== 1 || category.categoryType !== CategoryType.SUB) {
      throw new BadRequestException(
        `Category "${category.name}" bukan sub-category`,
      );
    }

    // Optional: validate parent relationship
    if (expectedParentId && category.parentId !== expectedParentId) {
      throw new BadRequestException(
        `Sub-category "${category.name}" bukan child dari main category ID ${expectedParentId}`,
      );
    }

    return category;
  }

  /**
   * Validate hierarchy: Sub-category harus child dari product's main category
   * Digunakan saat create/update ProductCodes
   */
  async validateCategoryHierarchy(
    mainCategoryId: number,
    subCategoryId: number,
  ): Promise<void> {
    const mainCategory = await this.validateIsMainCategory(mainCategoryId);
    const subCategory = await this.validateIsSubCategory(subCategoryId);

    if (subCategory.parentId !== mainCategory.id) {
      throw new BadRequestException(
        `Sub-category "${subCategory.name}" bukan bagian dari "${mainCategory.name}". ` +
          `Parent yang benar: "${subCategory.parent?.name || 'N/A'}"`,
      );
    }
  }

  /**
   * Get all sub-categories untuk main category tertentu
   */
  async getSubCategoriesByMainCategory(
    mainCategoryId: number,
  ): Promise<ProductCategories[]> {
    await this.validateIsMainCategory(mainCategoryId);

    return this.categoryRepo.find({
      where: {
        parentId: mainCategoryId,
        level: 1,
        categoryType: CategoryType.SUB,
        isActive: true,
      },
      order: { name: 'ASC' },
    });
  }

  /**
   * Check if category can be deleted (tidak punya children & tidak dipakai di products/product_codes)
   */
  async canDeleteCategory(categoryId: number): Promise<boolean> {
    const category = await this.categoryRepo.findOne({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException(
        `Category dengan ID ${categoryId} tidak ditemukan`,
      );
    }

    // Check for children
    const childrenCount = await this.categoryRepo.count({
      where: { parentId: categoryId },
    });

    if (childrenCount > 0) {
      throw new BadRequestException(
        `Category "${category.name}" masih memiliki ${childrenCount} sub-categories`,
      );
    }

    // TODO: Check usage in products & product_codes tables
    // Implementasi ini butuh inject ProductRepo & ProductCodeRepo
    // atau bisa pakai raw query

    return true;
  }

  /**
   * Get full path dari category (untuk breadcrumb)
   * Contoh: Barang Jadi > Freshly Premium
   */
  async getCategoryPath(categoryId: number): Promise<string[]> {
    const category = await this.categoryRepo.findOne({
      where: { id: categoryId },
      relations: ['parent', 'parent.parent'], // Support up to 3 levels
    });

    if (!category) {
      throw new NotFoundException(
        `Category dengan ID ${categoryId} tidak ditemukan`,
      );
    }

    const path: string[] = [category.name];

    if (category.parent) {
      path.unshift(category.parent.name);

      // If parent has parent (level 2+)
      if (category.parent.parent) {
        path.unshift(category.parent.parent.name);
      }
    }

    return path;
  }

  /**
   * Build tree structure dari semua categories (untuk UI tree view)
   */
  async buildCategoryTree(): Promise<any[]> {
    const allCategories = await this.categoryRepo.find({
      where: { isActive: true },
      order: { level: 'ASC', name: 'ASC' },
    });

    // Build map untuk quick lookup
    const categoryMap = new Map();
    allCategories.forEach((cat) => {
      categoryMap.set(cat.id, { ...cat, children: [] });
    });

    // Build tree
    const tree: any[] = [];
    categoryMap.forEach((cat) => {
      if (cat.parentId === null) {
        // Root level
        tree.push(cat);
      } else {
        // Add to parent's children
        const parent = categoryMap.get(cat.parentId);
        if (parent) {
          parent.children.push(cat);
        }
      }
    });

    return tree;
  }
}
