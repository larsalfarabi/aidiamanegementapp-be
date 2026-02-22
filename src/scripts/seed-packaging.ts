import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ProductCodes } from '../modules/products/entity/product_codes.entity';
import { ProductPackagingMaterial } from '../modules/products/entity/product-packaging-material.entity';
import { DataSource } from 'typeorm';

async function bootstrap() {
  try {
    const app = await NestFactory.createApplicationContext(AppModule);
    const dataSource = app.get(DataSource);
    const packagingRepo = dataSource.getRepository(ProductPackagingMaterial);
    const productCodeRepo = dataSource.getRepository(ProductCodes);

    console.log('Starting Packaging Material Seeding...');

    // 1. Fetch Finished Goods (Active) based on Category 'Barang Jadi'
    // This aligns with the user's provided JSON check
    const finishedGoods = await productCodeRepo.find({
      where: {
        isActive: true,
        category: {
          name: 'Barang Jadi',
        },
      },
      relations: ['product', 'category', 'size'],
      order: { productCode: 'ASC' },
    });

    console.log(`Found ${finishedGoods.length} Finished Goods (Barang Jadi).`);

    // 2. Define Packaging Materials
    const materialCodes = [
      'BKBT5',
      'BKTTP5',
      'BKST5',
      'BKBT1',
      'BKTTP1',
      'BKST1',
      'BKKRTN1',
      'BKBT600',
      'BKTTP600',
      'BKST600',
      'BKKRTN600',
      'BKBT250',
      'BKTTP250',
      'BKST250',
      'BKKRTN250',
      'BKCUP120',
      'BKLD120',
    ];

    // Map Material Codes to IDs
    const materialMap = new Map<string, number>();
    for (const code of materialCodes) {
      const p = await productCodeRepo.findOne({ where: { productCode: code } });
      if (p) {
        materialMap.set(code, p.id);
      } else {
        console.warn(
          `Warning: Packaging Material ${code} not found in database!`,
        );
      }
    }

    const rules: { productCodeId: number; material: string; qty: number }[] =
      [];

    for (const item of finishedGoods) {
      const sizeValue = item.size?.sizeValue?.toUpperCase() || '';
      // const name = item.product?.name?.toUpperCase() || '';
      // const code = item.productCode?.toUpperCase() || '';

      // Logic: Match Size Value directly (More reliable as per JSON)

      // --- 5 LITER ---
      if (
        sizeValue.includes('5 LITER') ||
        sizeValue === '5L' ||
        sizeValue === '5 L'
      ) {
        if (materialMap.has('BKBT5'))
          rules.push({ productCodeId: item.id, material: 'BKBT5', qty: 1 });
        if (materialMap.has('BKTTP5'))
          rules.push({ productCodeId: item.id, material: 'BKTTP5', qty: 1 });
        if (materialMap.has('BKST5'))
          rules.push({ productCodeId: item.id, material: 'BKST5', qty: 1 });
      }

      // --- 1 LITER ---
      else if (
        sizeValue.includes('1 LITER') ||
        sizeValue === '1L' ||
        sizeValue === '1 L'
      ) {
        if (materialMap.has('BKBT1'))
          rules.push({ productCodeId: item.id, material: 'BKBT1', qty: 1 });
        if (materialMap.has('BKTTP1'))
          rules.push({ productCodeId: item.id, material: 'BKTTP1', qty: 1 });
        if (materialMap.has('BKST1'))
          rules.push({ productCodeId: item.id, material: 'BKST1', qty: 1 });
         if (materialMap.has('BKKRTN1'))
          rules.push({ productCodeId: item.id, material: 'BKKRTN1', qty: 0 });
      }

      // --- 250 ML ---
      else if (sizeValue.includes('250 ML') || sizeValue === '250ML') {
        if (materialMap.has('BKBT250'))
          rules.push({ productCodeId: item.id, material: 'BKBT250', qty: 1 });
        if (materialMap.has('BKTTP250'))
          rules.push({ productCodeId: item.id, material: 'BKTTP250', qty: 1 });
        if (materialMap.has('BKST250'))
          rules.push({ productCodeId: item.id, material: 'BKST250', qty: 1 });
          if (materialMap.has('BKKRTN250'))
          rules.push({ productCodeId: item.id, material: 'BKKRTN250', qty: 0 });
      }

      // --- 120 ML / CUP ---
      else if (sizeValue.includes('120 ML') || sizeValue.includes('120ML')) {
        if (materialMap.has('BKCUP120'))
          rules.push({ productCodeId: item.id, material: 'BKCUP120', qty: 1 });
        if (materialMap.has('BKLD120'))
          rules.push({ productCodeId: item.id, material: 'BKLD120', qty: 1 });
      }
    }

    console.log(`Found ${rules.length} packaging rules to create.`);

    for (const rule of rules) {
      const matId = materialMap.get(rule.material);
      if (!matId) continue;

      const existing = await packagingRepo.findOne({
        where: {
          productCodeId: rule.productCodeId,
          materialProductCodeId: matId,
        },
      });

      if (!existing) {
        const newRule = packagingRepo.create({
          productCodeId: rule.productCodeId,
          materialProductCodeId: matId,
          quantity: rule.qty,
          isActive: true,
          createdBy: 1, // System
        });
        await packagingRepo.save(newRule);
        console.log(
          `Created rule: Product Code ID ${rule.productCodeId} (Material ${rule.material})`,
        );
      }
    }

    console.log('Seeding Completed.');
    await app.close();
  } catch (error) {
    console.error('Seeding Failed:', error);
    process.exit(1);
  }
}

bootstrap();
