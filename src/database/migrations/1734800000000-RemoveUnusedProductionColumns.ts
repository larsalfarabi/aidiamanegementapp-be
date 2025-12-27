import { MigrationInterface, QueryRunner, TableForeignKey } from 'typeorm';

/**
 * Migration: Remove Unused Production Columns
 * Date: December 19, 2024
 *
 * Purpose:
 * Remove columns that are not used and not needed in production tables:
 * 1. production_formulas: concentrateOutput, productionTimeMinutes
 * 2. formula_materials: notes
 * 3. production_material_usage: materialCategoryId
 *
 * Rationale:
 * - concentrateOutput: Not used in current production workflow
 * - productionTimeMinutes: Time tracking handled elsewhere
 * - notes (formula_materials): No business need for material-level notes
 * - materialCategoryId: Redundant, category derived from product_codes relation
 */
export class RemoveUnusedProductionColumns1734800000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop columns from production_formulas (separate statements for MySQL compatibility)
    await queryRunner.query(`
      ALTER TABLE production_formulas
      DROP COLUMN concentrateOutput
    `);

    await queryRunner.query(`
      ALTER TABLE production_formulas
      DROP COLUMN productionTimeMinutes
    `);

    // 2. Drop column from formula_materials
    await queryRunner.query(`
      ALTER TABLE formula_materials
      DROP COLUMN notes
    `);

    // 3. Drop foreign key constraint first, then column from production_material_usage
    // Check if constraint exists, if yes drop it
    const table = await queryRunner.getTable('production_material_usage');
    const foreignKey = table?.foreignKeys.find(
      (fk) => fk.columnNames.indexOf('materialCategoryId') !== -1,
    );
    if (foreignKey) {
      await queryRunner.dropForeignKey('production_material_usage', foreignKey);
    }

    await queryRunner.query(`
      ALTER TABLE production_material_usage
      DROP COLUMN materialCategoryId
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Restore production_formulas columns
    await queryRunner.query(`
      ALTER TABLE production_formulas
      ADD COLUMN concentrateOutput DECIMAL(10, 2) NULL COMMENT 'Expected concentrate output in liters (e.g., 500L)'
    `);

    await queryRunner.query(`
      ALTER TABLE production_formulas
      ADD COLUMN productionTimeMinutes INT NULL COMMENT 'Estimated production time in minutes'
    `);

    // 2. Restore formula_materials column
    await queryRunner.query(`
      ALTER TABLE formula_materials
      ADD COLUMN notes TEXT NULL COMMENT 'Notes about this material usage'
    `);

    // 3. Restore production_material_usage column and constraint
    await queryRunner.query(`
      ALTER TABLE production_material_usage
      ADD COLUMN materialCategoryId INT NULL COMMENT 'Material category (FK to product_categories)'
    `);

    await queryRunner.createForeignKey(
      'production_material_usage',
      new TableForeignKey({
        columnNames: ['materialCategoryId'],
        referencedTableName: 'product_categories',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
  }
}
