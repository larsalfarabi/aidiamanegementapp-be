import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Migration: Add formulaRatio column to formula_materials table
 * Purpose: Enable dynamic material quantity calculation based on target production
 * Formula: Planned Quantity = formulaRatio × Target Production (Liters)
 *
 * Example:
 * - Formula Ratio: 0.500000 (LEMON PREMIUM)
 * - Target Production: 40 Liters
 * - Calculated Quantity: 0.500000 × 40 = 20.000 ML/LTR
 */
export class AddFormulaRatioColumn1731398400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add formulaRatio column (nullable first for existing data)
    await queryRunner.addColumn(
      'formula_materials',
      new TableColumn({
        name: 'formulaRatio',
        type: 'decimal',
        precision: 12,
        scale: 8,
        isNullable: true,
        comment:
          'Formula ratio for calculation (e.g., 0.00006400). Planned Quantity = formulaRatio × Target Production (Liters)',
      }),
    );

    // 2. Update existing records - set initial ratio to 0
    // Note: Admin will need to update these manually with correct ratios
    await queryRunner.query(`
      UPDATE formula_materials
      SET formulaRatio = 0.00000000
      WHERE formulaRatio IS NULL
    `);

    // 3. Make column NOT NULL after setting defaults
    await queryRunner.changeColumn(
      'formula_materials',
      'formulaRatio',
      new TableColumn({
        name: 'formulaRatio',
        type: 'decimal',
        precision: 12,
        scale: 8,
        isNullable: false,
        default: 0,
        comment:
          'Formula ratio for calculation (e.g., 0.00006400). Planned Quantity = formulaRatio × Target Production (Liters)',
      }),
    );

    console.log(
      '✅ Migration complete: formulaRatio column added to formula_materials',
    );
    console.log(
      '⚠️  Note: Existing formulas have formulaRatio = 0. Update them manually.',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('formula_materials', 'formulaRatio');
    console.log('✅ Rollback complete: formulaRatio column removed');
  }
}
