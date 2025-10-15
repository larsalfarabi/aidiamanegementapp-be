import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Migration: Create Inventory Transactions Table
 *
 * Purpose: Enhanced transaction table with REPACK and SAMPLE types
 *
 * Enhanced Transaction Types:
 * - PRODUCTION_IN: Production results (barangMasuk++)
 * - SALE: Customer orders via invoice (dipesan++)
 * - REPACK_OUT: Source product for repacking (barangOutRepack++)
 * - REPACK_IN: Target product from repacking (barangMasuk++)
 * - SAMPLE_OUT: Sample giveaways (barangOutSample++)
 * - SAMPLE_RETURN: Sample returns (barangMasuk++)
 * - ADJUSTMENT: Stock corrections (adjust stokAwal)
 * - WASTE: Damaged/expired disposal
 *
 * Integration Points:
 * - Links to daily_inventory via productCodeId + businessDate
 * - Links to orders via orderId (for SALE transactions)
 * - Links to repacking_records via repackingId (for REPACK transactions)
 *
 * Created: 2025-01-15
 */
export class CreateInventoryTransactionsTable1737005000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log('📝 Creating inventory_transactions table...');

    // Drop if exists (safety for failed migrations)
    await queryRunner.query(`DROP TABLE IF EXISTS inventory_transactions`);

    await queryRunner.createTable(
      new Table({
        name: 'inventory_transactions',
        columns: [
          {
            name: 'id',
            type: 'bigint',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          // Transaction Info
          {
            name: 'transactionNumber',
            type: 'varchar',
            length: '50',
            isUnique: true,
            comment: 'Unique transaction number (e.g., TRX-20250115-001)',
          },
          {
            name: 'transactionDate',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            comment: 'When the transaction occurred',
          },
          {
            name: 'businessDate',
            type: 'date',
            comment: 'Business date for daily inventory tracking',
          },
          {
            name: 'transactionType',
            type: 'enum',
            enum: [
              'PRODUCTION_IN',
              'SALE',
              'REPACK_OUT',
              'REPACK_IN',
              'SAMPLE_OUT',
              'SAMPLE_RETURN',
              'ADJUSTMENT',
              'WASTE',
              'SALE_RETURN',
            ],
            comment: 'Type of inventory transaction',
          },
          // Product Reference
          {
            name: 'productCodeId',
            type: 'int',
            comment: 'Foreign key to product_codes table',
          },
          // Quantity
          {
            name: 'quantity',
            type: 'decimal',
            precision: 10,
            scale: 2,
            comment: 'Quantity (positive for IN, negative for OUT)',
          },
          {
            name: 'balanceAfter',
            type: 'decimal',
            precision: 10,
            scale: 2,
            comment: 'Stock balance after transaction (for verification)',
          },
          // Reference Documents
          {
            name: 'orderId',
            type: 'int',
            isNullable: true,
            comment: 'Link to orders table (for SALE transactions)',
          },
          {
            name: 'orderItemId',
            type: 'int',
            isNullable: true,
            comment: 'Link to order_items table (for SALE transactions)',
          },
          {
            name: 'repackingId',
            type: 'int',
            isNullable: true,
            comment:
              'Link to repacking_records table (for REPACK transactions)',
          },
          {
            name: 'productionBatchNumber',
            type: 'varchar',
            length: '100',
            isNullable: true,
            comment: 'Production batch number (for PRODUCTION_IN)',
          },
          {
            name: 'referenceNumber',
            type: 'varchar',
            length: '100',
            isNullable: true,
            comment: 'External reference (invoice number, waste report, etc.)',
          },
          // Status & Details
          {
            name: 'status',
            type: 'enum',
            enum: ['PENDING', 'COMPLETED', 'CANCELLED'],
            default: "'COMPLETED'",
          },
          {
            name: 'reason',
            type: 'text',
            isNullable: true,
            comment:
              'Reason for transaction (waste, adjustment, sample purpose)',
          },
          {
            name: 'notes',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'performedBy',
            type: 'varchar',
            length: '100',
            isNullable: true,
            comment: 'Person who performed the transaction',
          },
          // Audit Fields
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'deletedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'createdBy',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'updatedBy',
            type: 'int',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Create Foreign Keys
    await queryRunner.query(`
      ALTER TABLE inventory_transactions
      ADD CONSTRAINT FK_inventory_transactions_productCodeId
      FOREIGN KEY (productCodeId) REFERENCES product_codes(id)
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
    `);

    await queryRunner.query(`
      ALTER TABLE inventory_transactions
      ADD CONSTRAINT FK_inventory_transactions_orderId
      FOREIGN KEY (orderId) REFERENCES orders(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
    `);

    await queryRunner.query(`
      ALTER TABLE inventory_transactions
      ADD CONSTRAINT FK_inventory_transactions_orderItemId
      FOREIGN KEY (orderItemId) REFERENCES order_items(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
    `);

    await queryRunner.query(`
      ALTER TABLE inventory_transactions
      ADD CONSTRAINT FK_inventory_transactions_createdBy
      FOREIGN KEY (createdBy) REFERENCES users(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
    `);

    await queryRunner.query(`
      ALTER TABLE inventory_transactions
      ADD CONSTRAINT FK_inventory_transactions_updatedBy
      FOREIGN KEY (updatedBy) REFERENCES users(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
    `);

    // Create Indexes
    await queryRunner.createIndex(
      'inventory_transactions',
      new TableIndex({
        name: 'IDX_transactions_productCodeId_businessDate',
        columnNames: ['productCodeId', 'businessDate'],
      }),
    );

    await queryRunner.createIndex(
      'inventory_transactions',
      new TableIndex({
        name: 'IDX_transactions_transactionType_businessDate',
        columnNames: ['transactionType', 'businessDate'],
      }),
    );

    await queryRunner.createIndex(
      'inventory_transactions',
      new TableIndex({
        name: 'IDX_transactions_orderId',
        columnNames: ['orderId'],
      }),
    );

    await queryRunner.createIndex(
      'inventory_transactions',
      new TableIndex({
        name: 'IDX_transactions_repackingId',
        columnNames: ['repackingId'],
      }),
    );

    await queryRunner.createIndex(
      'inventory_transactions',
      new TableIndex({
        name: 'IDX_transactions_productionBatchNumber',
        columnNames: ['productionBatchNumber'],
      }),
    );

    await queryRunner.createIndex(
      'inventory_transactions',
      new TableIndex({
        name: 'IDX_transactions_businessDate',
        columnNames: ['businessDate'],
      }),
    );

    console.log('✅ inventory_transactions table created with:');
    console.log('   - Enhanced transaction types (REPACK, SAMPLE)');
    console.log(
      '   - Foreign keys: productCodeId, orderId, orderItemId, createdBy, updatedBy',
    );
    console.log(
      '   - Indexes: productCodeId+businessDate, transactionType+businessDate, orderId, repackingId',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log('⏪ Dropping inventory_transactions table...');

    await queryRunner.dropTable('inventory_transactions', true);

    console.log('⏪ inventory_transactions table dropped');
  }
}
