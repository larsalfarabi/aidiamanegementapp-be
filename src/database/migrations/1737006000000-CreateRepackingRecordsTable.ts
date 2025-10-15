import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Migration: Create Repacking Records Table
 *
 * Purpose: Track product repacking/conversion operations
 *
 * Business Workflow:
 * 1. User converts source product (e.g., 4x Bottle 250ML → 1x Bottle 1000ML)
 * 2. System creates repacking record
 * 3. Decrements source product (barangOutRepack++ in daily_inventory)
 * 4. Increments target product (barangMasuk++ in daily_inventory)
 * 5. Records loss/waste if conversion has loss
 * 6. Links to inventory_transactions for audit trail
 *
 * Use Cases:
 * - Repackaging from small to large bottles
 * - Repackaging from large to small bottles
 * - Tracking conversion efficiency
 * - Loss/waste analysis
 *
 * Created: 2025-01-15
 */
export class CreateRepackingRecordsTable1737006000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log('📦 Creating repacking_records table...');

    await queryRunner.createTable(
      new Table({
        name: 'repacking_records',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          // Repacking Info
          {
            name: 'repackingNumber',
            type: 'varchar',
            length: '50',
            isUnique: true,
            comment: 'Unique repacking number (e.g., REP-20250115-001)',
          },
          {
            name: 'repackingDate',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            comment: 'When repacking was performed',
          },
          {
            name: 'businessDate',
            type: 'date',
            comment: 'Business date for daily inventory tracking',
          },
          // Source Product (what we take from)
          {
            name: 'sourceProductCodeId',
            type: 'int',
            comment: 'Product being converted FROM (e.g., Bottle 250ML)',
          },
          {
            name: 'sourceQuantity',
            type: 'decimal',
            precision: 10,
            scale: 2,
            comment: 'Quantity taken from source product',
          },
          // Target Product (what we create)
          {
            name: 'targetProductCodeId',
            type: 'int',
            comment: 'Product being converted TO (e.g., Bottle 1000ML)',
          },
          {
            name: 'targetQuantity',
            type: 'decimal',
            precision: 10,
            scale: 2,
            comment: 'Quantity created of target product',
          },
          // Conversion Details
          {
            name: 'conversionRatio',
            type: 'decimal',
            precision: 10,
            scale: 4,
            comment: 'Conversion ratio (e.g., 4.0 means 4 small = 1 large)',
          },
          {
            name: 'expectedTargetQty',
            type: 'decimal',
            precision: 10,
            scale: 2,
            comment: 'Expected target quantity (based on conversion ratio)',
          },
          {
            name: 'lossQuantity',
            type: 'decimal',
            precision: 10,
            scale: 2,
            default: 0,
            comment: 'Loss/waste during conversion (in source units)',
          },
          {
            name: 'lossPercentage',
            type: 'decimal',
            precision: 5,
            scale: 2,
            default: 0,
            comment: 'Loss percentage = (lossQuantity / sourceQuantity) * 100',
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
              'Reason for repacking (customer request, quality control, etc.)',
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
            comment: 'Person who performed the repacking',
          },
          // Links to Transactions
          {
            name: 'sourceTransactionId',
            type: 'bigint',
            isNullable: true,
            comment: 'Link to inventory_transactions (REPACK_OUT for source)',
          },
          {
            name: 'targetTransactionId',
            type: 'bigint',
            isNullable: true,
            comment: 'Link to inventory_transactions (REPACK_IN for target)',
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
      ALTER TABLE repacking_records
      ADD CONSTRAINT FK_repacking_records_sourceProductCodeId
      FOREIGN KEY (sourceProductCodeId) REFERENCES product_codes(id)
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
    `);

    await queryRunner.query(`
      ALTER TABLE repacking_records
      ADD CONSTRAINT FK_repacking_records_targetProductCodeId
      FOREIGN KEY (targetProductCodeId) REFERENCES product_codes(id)
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
    `);

    await queryRunner.query(`
      ALTER TABLE repacking_records
      ADD CONSTRAINT FK_repacking_records_sourceTransactionId
      FOREIGN KEY (sourceTransactionId) REFERENCES inventory_transactions(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
    `);

    await queryRunner.query(`
      ALTER TABLE repacking_records
      ADD CONSTRAINT FK_repacking_records_targetTransactionId
      FOREIGN KEY (targetTransactionId) REFERENCES inventory_transactions(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
    `);

    await queryRunner.query(`
      ALTER TABLE repacking_records
      ADD CONSTRAINT FK_repacking_records_createdBy
      FOREIGN KEY (createdBy) REFERENCES users(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
    `);

    await queryRunner.query(`
      ALTER TABLE repacking_records
      ADD CONSTRAINT FK_repacking_records_updatedBy
      FOREIGN KEY (updatedBy) REFERENCES users(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
    `);

    // Create Indexes
    await queryRunner.createIndex(
      'repacking_records',
      new TableIndex({
        name: 'IDX_repacking_records_businessDate',
        columnNames: ['businessDate'],
      }),
    );

    await queryRunner.createIndex(
      'repacking_records',
      new TableIndex({
        name: 'IDX_repacking_records_sourceProductCodeId',
        columnNames: ['sourceProductCodeId'],
      }),
    );

    await queryRunner.createIndex(
      'repacking_records',
      new TableIndex({
        name: 'IDX_repacking_records_targetProductCodeId',
        columnNames: ['targetProductCodeId'],
      }),
    );

    await queryRunner.createIndex(
      'repacking_records',
      new TableIndex({
        name: 'IDX_repacking_records_status',
        columnNames: ['status'],
      }),
    );

    // Add foreign key constraint from inventory_transactions to repacking_records
    // (This creates the circular reference mentioned in the schema design)
    await queryRunner.query(`
      ALTER TABLE inventory_transactions
      ADD CONSTRAINT FK_inventory_transactions_repackingId
      FOREIGN KEY (repackingId) REFERENCES repacking_records(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
    `);

    console.log('✅ repacking_records table created with:');
    console.log('   - Conversion tracking (source → target)');
    console.log('   - Loss/waste calculation');
    console.log(
      '   - Foreign keys: sourceProductCodeId, targetProductCodeId, transactions',
    );
    console.log('   - Indexes: businessDate, source/target products, status');
    console.log('   - Bidirectional link with inventory_transactions');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log('⏪ Dropping repacking_records table...');

    // First remove the FK from inventory_transactions
    await queryRunner.query(`
      ALTER TABLE inventory_transactions
      DROP FOREIGN KEY FK_inventory_transactions_repackingId;
    `);

    await queryRunner.dropTable('repacking_records', true);

    console.log('⏪ repacking_records table dropped');
  }
}
