import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

/**
 * Migration: Add Production Bottling Output Table
 *
 * Purpose:
 * - Support multi-size bottling from single production batch
 * - Track bottling output per product size (SKU)
 * - Record waste per size during bottling process
 * - Enable flexible product distribution (one batch → many sizes)
 *
 * Business Context:
 * - One batch produces concentrate for a product concept
 * - Bottling distributes concentrate to multiple bottle sizes
 * - Example: 40L concentrate → 60 botol 600ml + 40 botol 1L
 * - Each size has separate quantity and waste tracking
 *
 * Impact:
 * - Replaces single actualQuantity with dynamic bottling outputs
 * - Each output creates separate PRODUCTION_IN inventory transaction
 * - Maintains material tracking at batch level
 * - Preserves backward compatibility for single-size batches
 *
 * Date: December 16, 2024
 * Database: MySQL
 */
export class AddProductionBottlingOutputTable1734300000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create production_bottling_outputs table
    await queryRunner.createTable(
      new Table({
        name: 'production_bottling_outputs',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'batchId',
            type: 'int',
            isNullable: false,
            comment: 'FK to production_batches - parent batch',
          },
          {
            name: 'productCodeId',
            type: 'int',
            isNullable: false,
            comment: 'FK to product_codes - specific size/SKU produced',
          },
          {
            name: 'quantity',
            type: 'decimal',
            precision: 12,
            scale: 3,
            isNullable: false,
            comment: 'Good output quantity for this size (in bottles/units)',
          },
          {
            name: 'wasteQuantity',
            type: 'decimal',
            precision: 12,
            scale: 3,
            default: 0,
            isNullable: false,
            comment: 'Waste quantity for this size (in bottles/units)',
          },
          {
            name: 'notes',
            type: 'text',
            isNullable: true,
            comment: 'Optional notes for this bottling output',
          },
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
            name: 'createdBy',
            type: 'int',
            isNullable: true,
            comment: 'FK to users - who created this output record',
          },
          {
            name: 'updatedBy',
            type: 'int',
            isNullable: true,
            comment: 'FK to users - who last updated this output',
          },
        ],
      }),
      true,
    );

    // Add foreign key: batchId → production_batches
    await queryRunner.createForeignKey(
      'production_bottling_outputs',
      new TableForeignKey({
        name: 'FK_bottling_outputs_batch',
        columnNames: ['batchId'],
        referencedTableName: 'production_batches',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE', // Delete outputs when batch deleted
        onUpdate: 'CASCADE',
      }),
    );

    // Add foreign key: productCodeId → product_codes
    await queryRunner.createForeignKey(
      'production_bottling_outputs',
      new TableForeignKey({
        name: 'FK_bottling_outputs_product_code',
        columnNames: ['productCodeId'],
        referencedTableName: 'product_codes',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT', // Prevent deletion if outputs exist
        onUpdate: 'CASCADE',
      }),
    );

    // Add foreign key: createdBy → users
    await queryRunner.createForeignKey(
      'production_bottling_outputs',
      new TableForeignKey({
        name: 'FK_bottling_outputs_created_by',
        columnNames: ['createdBy'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      }),
    );

    // Add foreign key: updatedBy → users
    await queryRunner.createForeignKey(
      'production_bottling_outputs',
      new TableForeignKey({
        name: 'FK_bottling_outputs_updated_by',
        columnNames: ['updatedBy'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      }),
    );

    // Add index on batchId for fast lookups
    await queryRunner.query(`
      CREATE INDEX idx_bottling_outputs_batch 
      ON production_bottling_outputs(batchId)
    `);

    // Add index on productCodeId for filtering by size
    await queryRunner.query(`
      CREATE INDEX idx_bottling_outputs_product_code 
      ON production_bottling_outputs(productCodeId)
    `);

    // Add DRAFT status to BatchStatus enum in production_batches
    await queryRunner.query(`
      ALTER TABLE \`production_batches\` 
      MODIFY COLUMN \`status\` ENUM(
        'DRAFT',
        'PLANNED',
        'IN_PROGRESS',
        'QC_PENDING',
        'COMPLETED',
        'CANCELLED',
        'REJECTED'
      ) NOT NULL DEFAULT 'PLANNED'
      COMMENT 'DRAFT=Saved but not finalized, PLANNED=Ready for production, IN_PROGRESS=Production started, QC_PENDING=Awaiting QC, COMPLETED=Finished & passed QC, CANCELLED=Production cancelled, REJECTED=Failed QC'
    `);

    // Add productionNotes column to production_batches for additional context
    await queryRunner.query(`
      ALTER TABLE \`production_batches\`
      ADD COLUMN \`productionNotes\` TEXT NULL 
      COMMENT 'General notes about production process, issues, observations'
      AFTER \`notes\`
    `);

    console.log('✅ Created production_bottling_outputs table with foreign keys');
    console.log('✅ Added DRAFT status to BatchStatus enum');
    console.log('✅ Added productionNotes column to production_batches');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove productionNotes column
    await queryRunner.query(`
      ALTER TABLE \`production_batches\`
      DROP COLUMN \`productionNotes\`
    `);

    // Revert BatchStatus enum (remove DRAFT)
    await queryRunner.query(`
      ALTER TABLE \`production_batches\` 
      MODIFY COLUMN \`status\` ENUM(
        'PLANNED',
        'IN_PROGRESS',
        'QC_PENDING',
        'COMPLETED',
        'CANCELLED',
        'REJECTED'
      ) NOT NULL DEFAULT 'PLANNED'
    `);

    // Drop foreign keys first
    await queryRunner.dropForeignKey(
      'production_bottling_outputs',
      'FK_bottling_outputs_updated_by',
    );
    await queryRunner.dropForeignKey(
      'production_bottling_outputs',
      'FK_bottling_outputs_created_by',
    );
    await queryRunner.dropForeignKey(
      'production_bottling_outputs',
      'FK_bottling_outputs_product_code',
    );
    await queryRunner.dropForeignKey(
      'production_bottling_outputs',
      'FK_bottling_outputs_batch',
    );

    // Drop table
    await queryRunner.dropTable('production_bottling_outputs');

    console.log('✅ Dropped production_bottling_outputs table');
    console.log('✅ Removed DRAFT status from BatchStatus enum');
    console.log('✅ Removed productionNotes column');
  }
}
