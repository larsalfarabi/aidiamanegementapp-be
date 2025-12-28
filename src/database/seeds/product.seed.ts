import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ProductCategories,
  CategoryType,
} from '../../modules/products/entity/product_categories.entity';
import { ProductSizes } from '../../modules/products/entity/product_sizes.entity';
import { Users } from '../../modules/users/entities/users.entity';

@Injectable()
export class ProductSeeder {
  constructor(
    @InjectRepository(ProductCategories)
    private categoriesRepository: Repository<ProductCategories>,
    @InjectRepository(ProductSizes)
    private sizesRepository: Repository<ProductSizes>,
    @InjectRepository(Users)
    private usersRepository: Repository<Users>,
  ) {}

  async run() {
    console.log(
      '🚀 Starting Product Category & Size Seeder (Products will be created via UI)...\n',
    );

    // Get admin user for createdBy/updatedBy
    const adminUser = await this.usersRepository.findOne({
      where: { email: 'msyamil404@gmail.com' },
    });
    if (!adminUser) {
      throw new Error('Admin user not found. Please run user seeder first.');
    }

    // ============================================================
    // STEP 1: CREATE MAIN CATEGORIES (Level 0)
    // ============================================================
    console.log('📂 Step 1: Creating Main Categories...');

    const mainCategories = [
      {
        name: 'Barang Jadi',
        description: 'Finished Goods - Produk siap jual',
        level: 0,
        categoryType: CategoryType.MAIN,
        parentId: undefined,
      },
      {
        name: 'Barang Kemasan',
        description: 'Packaging Materials - Bahan kemasan',
        level: 0,
        categoryType: CategoryType.MAIN,
        parentId: undefined,
      },
      {
        name: 'Barang Baku',
        description: 'Raw Materials - Bahan baku produksi',
        level: 0,
        categoryType: CategoryType.MAIN,
        parentId: undefined,
      },
      {
        name: 'Barang Pembantu',
        description: 'Supporting Materials - Bahan penunjang',
        level: 0,
        categoryType: CategoryType.MAIN,
        parentId: undefined,
      },
    ];

    const createdMainCategories: { [key: string]: any } = {};

    for (const categoryData of mainCategories) {
      let category = await this.categoriesRepository.findOne({
        where: { name: categoryData.name },
      });
      if (!category) {
        category = await this.categoriesRepository.save({
          ...categoryData,
          createdBy: adminUser,
          updatedBy: adminUser,
        });
        console.log(`  ✅ Main Category "${categoryData.name}" created`);
      } else {
        console.log(
          `  ℹ️  Main Category "${categoryData.name}" already exists`,
        );
      }
      createdMainCategories[categoryData.name] = category;
    }

    // ============================================================
    // STEP 2: CREATE SUB-CATEGORIES (Level 1) - Barang Jadi
    // ============================================================
    console.log('\n📂 Step 2: Creating Sub-Categories for Barang Jadi...');

    const subCategoriesBarangJadi = [
      {
        name: 'Freshly',
        description: 'Sub-kategori Freshly',
        level: 1,
        categoryType: CategoryType.SUB,
        parentId: createdMainCategories['Barang Jadi'].id,
      },
      {
        name: 'Buffet',
        description: 'Sub-kategori Buffet',
        level: 1,
        categoryType: CategoryType.SUB,
        parentId: createdMainCategories['Barang Jadi'].id,
      },
      {
        name: 'Premium',
        description: 'Sub-kategori Premium',
        level: 1,
        categoryType: CategoryType.SUB,
        parentId: createdMainCategories['Barang Jadi'].id,
      },
    ];

    const createdSubCategories: { [key: string]: any } = {};

    for (const subCatData of subCategoriesBarangJadi) {
      let subCat = await this.categoriesRepository.findOne({
        where: { name: subCatData.name },
      });
      if (!subCat) {
        subCat = await this.categoriesRepository.save({
          ...subCatData,
          createdBy: adminUser,
          updatedBy: adminUser,
        });
        console.log(`  ✅ Sub-Category "${subCatData.name}" created`);
      } else {
        console.log(`  ℹ️  Sub-Category "${subCatData.name}" already exists`);
      }
      createdSubCategories[subCatData.name] = subCat;
    }

    // ============================================================
    // STEP 3: CREATE PRODUCT SIZES (Redesigned Schema)
    // ============================================================
    console.log('\n📏 Step 3: Creating Product Sizes...');

    const productSizes = [
      // ✅ BARANG JADI - Volume (ML/LITER)
      {
        sizeValue: '250 ML',
        unitOfMeasure: 'ML',
        baseValue: 250,
        baseUnit: 'ML',
        categoryType: 'BARANG_JADI',
      },
      {
        sizeValue: '1 LITER',
        unitOfMeasure: 'LITER',
        baseValue: 1,
        baseUnit: 'LITER',
        categoryType: 'BARANG_JADI',
      },
      {
        sizeValue: '5 LITER',
        unitOfMeasure: 'LITER',
        baseValue: 5,
        baseUnit: 'LITER',
        categoryType: 'BARANG_JADI',
      },

      // ✅ BAHAN BAKU & PEMBANTU - Weight & Volume (KG, ML)
      {
        sizeValue: 'KG',
        unitOfMeasure: 'KG',
        baseValue: undefined,
        baseUnit: 'KG',
        categoryType: 'BAHAN_BAKU, BAHAN_PEMBANTU',
      },
      {
        sizeValue: 'ML',
        unitOfMeasure: 'ML',
        baseUnit: 'ML',
        categoryType: 'BAHAN_BAKU, BAHAN_PEMBANTU',
      },

      // ✅ BAHAN KEMASAN - Count Units (GLN, BTL, CUP, PCS)
      {
        sizeValue: 'GLN',
        unitOfMeasure: 'GLN',
        baseValue: undefined, // No numeric value needed for count units
        baseUnit: 'GLN',
        categoryType: 'BAHAN_KEMASAN',
      },
      {
        sizeValue: 'BTL',
        unitOfMeasure: 'BTL',
        baseValue: undefined, // No numeric value needed for count units
        baseUnit: 'BTL',
        categoryType: 'BAHAN_KEMASAN',
      },
      {
        sizeValue: 'CUP',
        unitOfMeasure: 'CUP',
        baseValue: undefined, // No numeric value needed for count units
        baseUnit: 'CUP',
        categoryType: 'BAHAN_KEMASAN',
      },
      {
        sizeValue: 'PCS',
        unitOfMeasure: 'PCS',
        baseValue: undefined, // Keep value for quantity-based PCS
        baseUnit: 'PCS',
        categoryType: 'BAHAN_KEMASAN',
      },
    ];

    for (const sizeData of productSizes) {
      let size = await this.sizesRepository.findOne({
        where: { sizeValue: sizeData.sizeValue },
      });
      if (!size) {
        size = await this.sizesRepository.save({
          ...sizeData,
          createdBy: adminUser,
          updatedBy: adminUser,
        });
        console.log(
          `  ✅ Product Size "${sizeData.sizeValue}" (${sizeData.baseUnit}) created`,
        );
      } else {
        console.log(
          `  ℹ️  Product Size "${sizeData.sizeValue}" already exists`,
        );
      }
    }

    console.log(`\n✅ Product Category & Size Seeder Completed Successfully!`);
    console.log(
      `📝 Note: Products will be created manually via UI by users.\n`,
    );
  }
}
