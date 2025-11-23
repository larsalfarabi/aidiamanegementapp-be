import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveBatchSizeFromFormula1732100000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove batchSize and batchUnit columns from production_formulas
    // These are not needed in formula - quantity is determined at batch creation time

    // Check if columns exist before dropping (MySQL doesn't support DROP COLUMN IF EXISTS)
    const table = await queryRunner.getTable('production_formulas');

    if (table?.findColumnByName('batchSize')) {
      await queryRunner.query(`
        ALTER TABLE production_formulas
        DROP COLUMN batchSize;
      `);
      console.log('✅ Dropped batchSize column');
    } else {
      console.log('⚠️  batchSize column does not exist, skipping...');
    }

    if (table?.findColumnByName('batchUnit')) {
      await queryRunner.query(`
        ALTER TABLE production_formulas
        DROP COLUMN batchUnit;
      `);
      console.log('✅ Dropped batchUnit column');
    } else {
      console.log('⚠️  batchUnit column does not exist, skipping...');
    }

    console.log(
      'ℹ️  Batch quantity will now be specified during batch creation (plannedQuantity)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore columns if needed (for rollback)
    await queryRunner.query(`
      ALTER TABLE production_formulas
      ADD COLUMN batchSize DECIMAL(10, 2) DEFAULT 1.00 
        COMMENT 'Standard batch size (deprecated - use batch.plannedQuantity instead)',
      ADD COLUMN batchUnit VARCHAR(20) DEFAULT 'liter' 
        COMMENT 'Unit of measurement (deprecated - use batch.plannedQuantity instead)';
    `);

    console.log('⚠️  Restored batchSize and batchUnit columns (rollback)');
  }
}
