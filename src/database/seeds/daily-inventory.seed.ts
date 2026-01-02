import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DailyInventory } from '../../modules/inventory/entity/daily-inventory.entity';
import { ProductCodes } from '../../modules/products/entity/product_codes.entity';

@Injectable()
export class DailyInventorySeeder {
  constructor(
    @InjectRepository(DailyInventory)
    private dailyInventoryRepository: Repository<DailyInventory>,
    @InjectRepository(ProductCodes)
    private productCodesRepository: Repository<ProductCodes>,
  ) {}

  async run() {
    console.log('🚀 Starting Daily Inventory Initialization...');

    // 1. Get Today's Date (YYYY-MM-DD for businessDate)
    const today = new Date();
    // businessDate is stored as Date object but TypeORM/MySQL handles comparison.
    // Ideally we ensure time component is stripped or handled consistently.
    // The entity defines @Column({ type: 'date' }), so usually string 'YYYY-MM-DD' works or a Date object at midnight.
    const businessDateStr = today.toISOString().split('T')[0];
    const businessDate = new Date(businessDateStr);

    console.log(`📅 Business Date: ${businessDateStr}`);

    // 2. Fetch all active ProductCodes
    const productCodes = await this.productCodesRepository.find({
      where: { isActive: true },
    });

    if (productCodes.length === 0) {
      console.log('⚠️ No active product codes found. Skipping inventory init.');
      return;
    }

    console.log(`📦 Found ${productCodes.length} active product codes.`);

    let createdCount = 0;
    let skippedCount = 0;

    // 3. Loop through products and ensure daily inventory exists
    for (const code of productCodes) {
      // Check if inventory record exists for this product and date
      const existingRecord = await this.dailyInventoryRepository.findOne({
        where: {
          productCodeId: code.id,
          businessDate: businessDate, // TypeORM handles date column comparison
        },
      });

      if (existingRecord) {
        skippedCount++;
        // console.log(`  ℹ️  Inventory for ${code.productCode} already exists.`);
        continue;
      }

      // Create new record
      const newInventory = this.dailyInventoryRepository.create({
        productCodeId: code.id,
        businessDate: businessDate,
        stokAwal: 0,
        minimumStock: 10,
        maximumStock: 100,
        isActive: true,
        notes: 'Initial Setup via Seeder',
      });

      try {
        await this.dailyInventoryRepository.save(newInventory);
        console.log(`  ✅ Created inventory for ${code.productCode}`);
        createdCount++;
      } catch (error: any) {
        if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) {
          skippedCount++;
          // console.log(`  ℹ️  Inventory for ${code.productCode} already exists (caught conflict).`);
          continue;
        }
        console.error(
          `  ❌ Failed to create inventory for ${code.productCode}:`,
          error.message,
        );
      }
    }

    console.log('\n📊 Inventory Initialization Summary:');
    console.log(`  ✅ Created: ${createdCount}`);
    console.log(`  ⏭️  Skipped (Already Exists): ${skippedCount}`);
    console.log('  🏁 Completed.');
  }
}
