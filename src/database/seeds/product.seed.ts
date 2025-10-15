import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Products } from '../../modules/products/entity/products.entity';
import { ProductCategories } from '../../modules/products/entity/product_categories.entity';
import { ProductSizes } from '../../modules/products/entity/product_sizes.entity';
import { ProductCodes } from '../../modules/products/entity/product_codes.entity';
import { Users } from '../../modules/users/entities/users.entity';

@Injectable()
export class ProductSeeder {
  constructor(
    @InjectRepository(Products)
    private productsRepository: Repository<Products>,
    @InjectRepository(ProductCategories)
    private categoriesRepository: Repository<ProductCategories>,
    @InjectRepository(ProductSizes)
    private sizesRepository: Repository<ProductSizes>,
    @InjectRepository(ProductCodes)
    private productCodesRepository: Repository<ProductCodes>,
    @InjectRepository(Users)
    private usersRepository: Repository<Users>,
  ) {}

  async run() {
    // Get admin user for createdBy/updatedBy
    const adminUser = await this.usersRepository.findOne({
      where: { email: 'msyamil404@gmail.com' },
    });
    if (!adminUser) {
      throw new Error('Admin user not found. Please run user seeder first.');
    }

    const categories = [
      {
        name: 'FRESHLY',
        description: 'Freshly juice series with high quality ingredients',
        createdBy: adminUser,
        updatedBy: adminUser,
      },
      {
        name: 'PREMIUM',
        description: 'Premium juice series with high quality ingredients',
        createdBy: adminUser,
        updatedBy: adminUser,
      },
      {
        name: 'BUFFET',
        description: 'Buffet juice series with high quality ingredients',
        createdBy: adminUser,
        updatedBy: adminUser,
      },
    ];

    // Store categories for later reference
    const createdCategories: { [key: string]: any } = {};

    for (let categoryData of categories) {
      // Create Categories (check if exists first)
      let category = await this.categoriesRepository.findOne({
        where: { name: categoryData.name },
      });
      if (!category) {
        category = await this.categoriesRepository.save({
          ...categoryData,
        });
        console.log(`✅ Category "${categoryData.name}" created successfully.`);
      } else {
        console.log(`ℹ️ Category "${categoryData.name}" already exists.`);
      }
      createdCategories[categoryData.name] = category;
    }

    const sizeValue = [
      { sizeValue: '250 ML', unitOfMeasure: 'ML', volumeMili: 250 },
      { sizeValue: '1 Liter', unitOfMeasure: 'LITER', volumeMili: 1000 },
      { sizeValue: '5 Liter', unitOfMeasure: 'LITER', volumeMili: 5000 },
    ];

    // Store sizes for later reference
    const createdSizes: { [key: string]: any } = {};

    for (let sizeData of sizeValue) {
      // Create Size (check if exists first)
      let size = await this.sizesRepository.findOne({
        where: { sizeValue: sizeData.sizeValue },
      });
      if (!size) {
        size = await this.sizesRepository.save({
          sizeValue: sizeData.sizeValue,
          unitOfMeasure: sizeData.unitOfMeasure,
          volumeMili: sizeData.volumeMili,
          createdBy: adminUser,
          updatedBy: adminUser,
        });
        console.log(`✅ Size "${sizeData.sizeValue}" created successfully.`);
      } else {
        console.log(`ℹ️ Size "${sizeData.sizeValue}" already exists.`);
      }
      createdSizes[sizeData.sizeValue] = size;
    }

    // Create Products
    const products = [
      {
        name: 'ORANGE JUICE PREMIUM RTD',
        code: 'BJ2OR1R',
        price: 7000,
        category: 'PREMIUM',
        size: '250 ML',
      },
      {
        name: 'APPLE JUICE FRESHLY RTD',
        code: 'BJ1AP1F',
        price: 5500,
        category: 'FRESHLY',
        size: '250 ML',
      },
      {
        name: 'MANGO JUICE BUFFET RTD',
        code: 'BJ3MG1B',
        price: 12000,
        category: 'BUFFET',
        size: '1 Liter',
      },
      {
        name: 'STRAWBERRY JUICE PREMIUM RTD',
        code: 'BJ2ST1R',
        price: 7500,
        category: 'PREMIUM',
        size: '250 ML',
      },
      {
        name: 'PINEAPPLE JUICE FRESHLY RTD',
        code: 'BJ1PA1F',
        price: 5000,
        category: 'FRESHLY',
        size: '250 ML',
      },
      {
        name: 'GUAVA JUICE BUFFET RTD',
        code: 'BJ3GV5B',
        price: 45000,
        category: 'BUFFET',
        size: '5 Liter',
      },
      {
        name: 'LEMON JUICE PREMIUM RTD',
        code: 'BJ2LN1R',
        price: 8000,
        category: 'PREMIUM',
        size: '250 ML',
      },
      {
        name: 'WATERMELON JUICE FRESHLY RTD',
        code: 'BJ1WM1F',
        price: 6000,
        category: 'FRESHLY',
        size: '250 ML',
      },
      {
        name: 'MIXED FRUIT JUICE BUFFET RTD',
        code: 'BJ3MX1B',
        price: 15000,
        category: 'BUFFET',
        size: '1 Liter',
      },
      {
        name: 'GRAPE JUICE PREMIUM RTD',
        code: 'BJ2GR1R',
        price: 8500,
        category: 'PREMIUM',
        size: '250 ML',
      },
    ];

    let createdProductsCount = 0;
    let existingProductsCount = 0;
    let createdCodesCount = 0;
    let existingCodesCount = 0;

    for (const productData of products) {
      // Create Product (check if exists first)
      let product = await this.productsRepository.findOne({
        where: { name: productData.name },
      });
      if (!product) {
        product = await this.productsRepository.save({
          name: productData.name,
          isActive: true,
          createdBy: adminUser,
          updatedBy: adminUser,
        });
        createdProductsCount++;
        console.log(`✅ Product "${productData.name}" created successfully.`);
      } else {
        existingProductsCount++;
        console.log(`ℹ️ Product "${productData.name}" already exists.`);
      }

      // Create Product Code (check if exists first)
      const existingProductCode = await this.productCodesRepository.findOne({
        where: { productCode: productData.code },
      });
      if (!existingProductCode) {
        // ✅ FIXED: Pass entity objects for relations, not just IDs
        await this.productCodesRepository.save({
          productCode: productData.code,
          productId: product, // Pass entity object
          categoryId: createdCategories[productData.category], // Pass entity object
          sizeId: createdSizes[productData.size], // Pass entity object
          baseUnitPrice: productData.price,
          isActive: true,
          createdBy: adminUser,
          updatedBy: adminUser,
        });
        createdCodesCount++;
        console.log(
          `✅ Product code "${productData.code}" created successfully.`,
        );
      } else {
        existingCodesCount++;
        console.log(`ℹ️ Product code "${productData.code}" already exists.`);
      }
    }

    console.log(
      `✅ Product seeding completed: ${createdProductsCount} products created, ${existingProductsCount} already existed`,
    );
    console.log(
      `✅ Product codes seeding completed: ${createdCodesCount} codes created, ${existingCodesCount} already existed`,
    );
  }
}
