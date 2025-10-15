import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Migration: Create Sample Tracking Table
 *
 * Purpose: Track sample giveaways for marketing/sales purposes
 *
 * Business Use Case:
 * - Give product samples to potential customers
 * - Track sample effectiveness (conversion to sales)
 * - Monitor sample budget and ROI
 * - Record sample returns (if not used)
 *
 * Note: This is an OPTIONAL feature for future implementation
 * Can be enabled later when business needs sample tracking
 *
 * Created: 2025-01-15
 */
export class CreateSampleTrackingTable1737007000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log('🎁 Creating sample_tracking table...');

    await queryRunner.createTable(
      new Table({
        name: 'sample_tracking',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          // Sample Info
          {
            name: 'sampleNumber',
            type: 'varchar',
            length: '50',
            isUnique: true,
            comment: 'Unique sample tracking number (e.g., SMP-20250115-001)',
          },
          {
            name: 'sampleDate',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            comment: 'When sample was given',
          },
          {
            name: 'businessDate',
            type: 'date',
            comment: 'Business date for daily inventory tracking',
          },
          // Product Reference
          {
            name: 'productCodeId',
            type: 'int',
            comment: 'Product given as sample',
          },
          {
            name: 'quantity',
            type: 'decimal',
            precision: 10,
            scale: 2,
            comment: 'Quantity of samples given',
          },
          // Recipient Info
          {
            name: 'recipientName',
            type: 'varchar',
            length: '200',
            comment: 'Name of person/company receiving sample',
          },
          {
            name: 'recipientPhone',
            type: 'varchar',
            length: '20',
            isNullable: true,
          },
          {
            name: 'recipientEmail',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'recipientAddress',
            type: 'text',
            isNullable: true,
          },
          // Sample Purpose
          {
            name: 'purpose',
            type: 'enum',
            enum: [
              'PROMOTION',
              'DEMO',
              'QUALITY_TEST',
              'PARTNERSHIP',
              'EVENT',
              'OTHER',
            ],
            default: "'PROMOTION'",
            comment: 'Purpose of sample distribution',
          },
          {
            name: 'eventName',
            type: 'varchar',
            length: '200',
            isNullable: true,
            comment: 'Event name if sample for event',
          },
          {
            name: 'expectedReturn',
            type: 'boolean',
            default: false,
            comment: 'Whether sample is expected to be returned',
          },
          // Return Tracking
          {
            name: 'returnDate',
            type: 'timestamp',
            isNullable: true,
            comment: 'When sample was returned (if applicable)',
          },
          {
            name: 'returnQuantity',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
            comment: 'Quantity returned',
          },
          {
            name: 'returnTransactionId',
            type: 'bigint',
            isNullable: true,
            comment: 'Link to inventory_transactions (SAMPLE_RETURN)',
          },
          // Follow-up
          {
            name: 'followUpDate',
            type: 'date',
            isNullable: true,
            comment: 'Scheduled follow-up date',
          },
          {
            name: 'convertedToSale',
            type: 'boolean',
            default: false,
            comment: 'Whether sample resulted in actual sale',
          },
          {
            name: 'orderId',
            type: 'int',
            isNullable: true,
            comment: 'Link to order if converted to sale',
          },
          // Status & Notes
          {
            name: 'status',
            type: 'enum',
            enum: ['PENDING', 'DISTRIBUTED', 'RETURNED', 'CONVERTED', 'CLOSED'],
            default: "'DISTRIBUTED'",
          },
          {
            name: 'notes',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'distributedBy',
            type: 'varchar',
            length: '100',
            isNullable: true,
            comment: 'Sales person who distributed sample',
          },
          // Link to Transaction
          {
            name: 'outTransactionId',
            type: 'bigint',
            isNullable: true,
            comment: 'Link to inventory_transactions (SAMPLE_OUT)',
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
      ALTER TABLE sample_tracking
      ADD CONSTRAINT FK_sample_tracking_productCodeId
      FOREIGN KEY (productCodeId) REFERENCES product_codes(id)
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
    `);

    await queryRunner.query(`
      ALTER TABLE sample_tracking
      ADD CONSTRAINT FK_sample_tracking_outTransactionId
      FOREIGN KEY (outTransactionId) REFERENCES inventory_transactions(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
    `);

    await queryRunner.query(`
      ALTER TABLE sample_tracking
      ADD CONSTRAINT FK_sample_tracking_returnTransactionId
      FOREIGN KEY (returnTransactionId) REFERENCES inventory_transactions(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
    `);

    await queryRunner.query(`
      ALTER TABLE sample_tracking
      ADD CONSTRAINT FK_sample_tracking_orderId
      FOREIGN KEY (orderId) REFERENCES orders(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
    `);

    await queryRunner.query(`
      ALTER TABLE sample_tracking
      ADD CONSTRAINT FK_sample_tracking_createdBy
      FOREIGN KEY (createdBy) REFERENCES users(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
    `);

    await queryRunner.query(`
      ALTER TABLE sample_tracking
      ADD CONSTRAINT FK_sample_tracking_updatedBy
      FOREIGN KEY (updatedBy) REFERENCES users(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
    `);

    // Create Indexes
    await queryRunner.createIndex(
      'sample_tracking',
      new TableIndex({
        name: 'IDX_sample_tracking_businessDate',
        columnNames: ['businessDate'],
      }),
    );

    await queryRunner.createIndex(
      'sample_tracking',
      new TableIndex({
        name: 'IDX_sample_tracking_productCodeId',
        columnNames: ['productCodeId'],
      }),
    );

    await queryRunner.createIndex(
      'sample_tracking',
      new TableIndex({
        name: 'IDX_sample_tracking_status',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createIndex(
      'sample_tracking',
      new TableIndex({
        name: 'IDX_sample_tracking_convertedToSale',
        columnNames: ['convertedToSale'],
      }),
    );

    await queryRunner.createIndex(
      'sample_tracking',
      new TableIndex({
        name: 'IDX_sample_tracking_followUpDate',
        columnNames: ['followUpDate'],
      }),
    );

    console.log('✅ sample_tracking table created with:');
    console.log('   - Recipient information tracking');
    console.log('   - Sample purpose and event tracking');
    console.log('   - Return tracking (optional)');
    console.log('   - Sales conversion tracking');
    console.log('   - Foreign keys: productCodeId, transactions, orderId');
    console.log(
      '   - Indexes: businessDate, productCodeId, status, conversion, followUp',
    );
    console.log('   - Note: OPTIONAL feature - can be used when needed');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log('⏪ Dropping sample_tracking table...');

    await queryRunner.dropTable('sample_tracking', true);

    console.log('⏪ sample_tracking table dropped');
  }
}
