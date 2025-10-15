import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Inventory } from '../../modules/inventory/entity/inventory.entity';
import {
  InventoryTransactions,
  TransactionType,
} from '../../modules/inventory/entity/inventory_transactions.entity';
import { ProductCodes } from '../../modules/products/entity/product_codes.entity';
import { Users } from '../../modules/users/entities/users.entity';

@Injectable()
export class InventorySeeder {
  constructor(
    @InjectRepository(Inventory)
    private readonly inventoryRepo: Repository<Inventory>,
    @InjectRepository(InventoryTransactions)
    private readonly transactionRepo: Repository<InventoryTransactions>,
    @InjectRepository(ProductCodes)
    private readonly productCodesRepo: Repository<ProductCodes>,
    @InjectRepository(Users)
    private readonly usersRepo: Repository<Users>,
  ) {}

  async run(): Promise<void> {
    console.log('   📦 Clearing existing inventory data...');
    // Use clear() or createQueryBuilder().delete() to delete all records
    await this.transactionRepo.createQueryBuilder().delete().execute();
    await this.inventoryRepo.createQueryBuilder().delete().execute();

    console.log('   📦 Fetching product codes...');
    const productCodes = await this.productCodesRepo.find({
      take: 10, // Seed for first 10 products
    });

    if (productCodes.length === 0) {
      console.log('   ⚠️  No product codes found. Skipping inventory seeding.');
      return;
    }

    console.log('   📦 Fetching admin user...');
    const adminUser = await this.usersRepo.findOne({
      where: { email: 'msyamil404@gmail.com' },
    });

    if (!adminUser) {
      console.log('   ⚠️  Admin user not found. Skipping inventory seeding.');
      return;
    }

    console.log('   📦 Creating inventory records and transactions...');

    const inventories: Inventory[] = [];
    const transactions: InventoryTransactions[] = [];
    let transactionSeq = 1;

    for (const productCode of productCodes) {
      // Random initial stock between 50-500
      const initialStock = Math.floor(Math.random() * 450) + 50;

      // Random minimum stock (20% of initial)
      const minimumStock = Math.floor(initialStock * 0.2);

      // Random maximum stock (200% of initial)
      const maximumStock = Math.floor(initialStock * 2);

      // Create inventory record
      const inventory = this.inventoryRepo.create({
        productCodeId: productCode.id,
        quantityOnHand: initialStock,
        quantityReserved: 0,
        quantityAvailable: initialStock,
        minimumStock,
        maximumStock,
        lastTransactionDate: new Date(),
        lastTransactionType: TransactionType.PRODUCTION_IN,
        isActive: true,
        notes: 'Initial stock from seeder',
        createdBy: adminUser,
        updatedBy: adminUser,
      });

      const savedInventory = await this.inventoryRepo.save(inventory);
      inventories.push(savedInventory);

      // Create initial PRODUCTION_IN transaction
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');

      const transaction = this.transactionRepo.create({
        transactionNumber: `TRX-${dateStr}-${transactionSeq.toString().padStart(3, '0')}`,
        transactionDate: new Date(),
        transactionType: TransactionType.PRODUCTION_IN,
        productCodeId: productCode.id,
        inventoryId: savedInventory.id,
        quantity: initialStock,
        balanceAfter: initialStock,
        productionBatchNumber: `BATCH-${dateStr}-${transactionSeq.toString().padStart(3, '0')}`,
        status: 'COMPLETED',
        notes: `Initial production batch for ${productCode.productCode}`,
        performedBy: 'Production Team',
        createdBy: adminUser,
      });

      transactions.push(transaction);
      transactionSeq++;

      console.log(
        `   ✓ Created inventory for ${productCode.productCode}: ${initialStock} units`,
      );
    }

    await this.transactionRepo.save(transactions);

    console.log(`   ✅ Created ${inventories.length} inventory records`);
    console.log(
      `   ✅ Created ${transactions.length} initial production transactions`,
    );

    // Create some additional sample transactions (waste, adjustment)
    console.log('   📦 Creating sample transactions (waste, adjustments)...');

    const sampleTransactions: InventoryTransactions[] = [];
    const today2 = new Date();
    const dateStr2 = today2.toISOString().slice(0, 10).replace(/-/g, '');

    // Add waste transaction for first 3 products
    for (let i = 0; i < Math.min(3, inventories.length); i++) {
      const inventory = inventories[i];
      const wasteQty = Math.floor(Math.random() * 10) + 1;

      const wasteTransaction = this.transactionRepo.create({
        transactionNumber: `TRX-${dateStr2}-${transactionSeq.toString().padStart(3, '0')}`,
        transactionDate: new Date(),
        transactionType: TransactionType.WASTE,
        productCodeId: inventory.productCodeId,
        inventoryId: inventory.id,
        quantity: -wasteQty,
        balanceAfter: inventory.quantityOnHand - wasteQty,
        status: 'COMPLETED',
        reason: 'Botol bocor saat handling',
        notes: 'Found during quality inspection',
        performedBy: 'Warehouse Staff',
        createdBy: adminUser,
      });

      sampleTransactions.push(wasteTransaction);
      transactionSeq++;

      // Update inventory
      inventory.quantityOnHand -= wasteQty;
      inventory.quantityAvailable -= wasteQty;
      inventory.lastTransactionDate = new Date();
      inventory.lastTransactionType = TransactionType.WASTE;
      await this.inventoryRepo.save(inventory);

      console.log(
        `   ✓ Created WASTE transaction: -${wasteQty} units for product ${inventory.productCodeId}`,
      );
    }

    // Add adjustment transaction for 2 products
    for (let i = 0; i < Math.min(2, inventories.length); i++) {
      const inventory = inventories[i];
      const adjustmentQty = Math.random() > 0.5 ? 5 : -3;
      const type =
        adjustmentQty > 0
          ? TransactionType.ADJUSTMENT_IN
          : TransactionType.ADJUSTMENT_OUT;

      const adjustmentTransaction = this.transactionRepo.create({
        transactionNumber: `TRX-${dateStr2}-${transactionSeq.toString().padStart(3, '0')}`,
        transactionDate: new Date(),
        transactionType: type,
        productCodeId: inventory.productCodeId,
        inventoryId: inventory.id,
        quantity: adjustmentQty,
        balanceAfter: inventory.quantityOnHand + adjustmentQty,
        status: 'COMPLETED',
        reason: 'Stock opname monthly',
        notes: `Physical count adjustment: ${adjustmentQty > 0 ? '+' : ''}${adjustmentQty}`,
        performedBy: 'Warehouse Supervisor',
        createdBy: adminUser,
      });

      sampleTransactions.push(adjustmentTransaction);
      transactionSeq++;

      // Update inventory
      inventory.quantityOnHand += adjustmentQty;
      inventory.quantityAvailable += adjustmentQty;
      inventory.lastTransactionDate = new Date();
      inventory.lastTransactionType = type;
      await this.inventoryRepo.save(inventory);

      console.log(
        `   ✓ Created ${type} transaction: ${adjustmentQty > 0 ? '+' : ''}${adjustmentQty} units for product ${inventory.productCodeId}`,
      );
    }

    await this.transactionRepo.save(sampleTransactions);

    console.log(
      `   ✅ Created ${sampleTransactions.length} sample transactions`,
    );
    console.log('   🎉 Inventory seeding completed!');
  }
}
