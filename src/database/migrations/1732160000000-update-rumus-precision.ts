import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateRumusPrecision1732160000000 implements MigrationInterface {
  name = 'UpdateRumusPrecision1732160000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log('🔄 Updating rumus column precision to DECIMAL(22,10)...');

    // Update rumus column precision from DECIMAL(15,2) to DECIMAL(22,10)
    await queryRunner.query(`
      ALTER TABLE formula_materials
      MODIFY COLUMN rumus DECIMAL(22, 10) DEFAULT 0.0000000000
        COMMENT 'Formula calculation value (ratio or quantity). Planned Qty = rumus × Target Production. Precision: 12 digits before decimal, 10 after';
    `);

    console.log('✅ Updated rumus column to DECIMAL(22,10)');
    console.log('   - Max value: 999,999,999,999.9999999999');
    console.log('   - Precision: 12 digits before decimal, 10 after decimal');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log('🔄 Reverting rumus column precision to DECIMAL(15,2)...');

    // Revert to original DECIMAL(15,2)
    await queryRunner.query(`
      ALTER TABLE formula_materials
      MODIFY COLUMN rumus DECIMAL(15, 2) DEFAULT 0.00
        COMMENT 'Formula calculation value (ratio or quantity). Planned Qty = rumus × Target Production';
    `);

    console.log('✅ Reverted rumus column to DECIMAL(15,2)');
  }
}
