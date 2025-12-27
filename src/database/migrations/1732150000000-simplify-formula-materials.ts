import { MigrationInterface, QueryRunner } from 'typeorm';

export class SimplifyFormulaMaterials1732150000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log('🔄 Simplifying formula_materials table...');

    // Check if old columns exist before migration
    const table = await queryRunner.getTable('formula_materials');

    // 1. Add new 'rumus' column
    await queryRunner.query(`
      ALTER TABLE formula_materials
      ADD COLUMN rumus DECIMAL(15, 2) DEFAULT 0.00
        COMMENT 'Formula calculation value (replaces quantityRequired and formulaRatio)';
    `);
    console.log('✅ Added rumus column');

    // 2. Migrate data: Use formulaRatio if exists, otherwise use quantityRequired
    if (table?.findColumnByName('formulaRatio')) {
      await queryRunner.query(`
        UPDATE formula_materials
        SET rumus = CAST(formulaRatio AS DECIMAL(15, 2))
        WHERE formulaRatio IS NOT NULL AND formulaRatio > 0;
      `);
      console.log('✅ Migrated formulaRatio → rumus');
    }

    if (table?.findColumnByName('quantityRequired')) {
      await queryRunner.query(`
        UPDATE formula_materials
        SET rumus = quantityRequired
        WHERE (rumus = 0 OR rumus IS NULL) AND quantityRequired > 0;
      `);
      console.log('✅ Migrated quantityRequired → rumus (fallback)');
    }

    // 3. Drop old columns
    if (table?.findColumnByName('quantityRequired')) {
      await queryRunner.query(`
        ALTER TABLE formula_materials
        DROP COLUMN quantityRequired;
      `);
      console.log('✅ Dropped quantityRequired column');
    }

    if (table?.findColumnByName('formulaRatio')) {
      await queryRunner.query(`
        ALTER TABLE formula_materials
        DROP COLUMN formulaRatio;
      `);
      console.log('✅ Dropped formulaRatio column');
    }

    // 4. Make unit column NOT NULL with default
    await queryRunner.query(`
      UPDATE formula_materials
      SET unit = 'KG'
      WHERE unit IS NULL OR unit = '';
    `);

    await queryRunner.query(`
      ALTER TABLE formula_materials
      MODIFY COLUMN unit VARCHAR(20) NOT NULL DEFAULT 'KG'
        COMMENT 'Unit of measurement (auto-populated from productSize)';
    `);
    console.log('✅ Updated unit column constraint');

    console.log(
      '✅ Migration completed: Simplified formula materials (rumus column)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log('🔄 Reverting formula_materials simplification...');

    // Restore old columns
    await queryRunner.query(`
      ALTER TABLE formula_materials
      ADD COLUMN quantityRequired DECIMAL(10, 4) DEFAULT 1.0000
        COMMENT 'Quantity required per batch (restored)',
      ADD COLUMN formulaRatio DECIMAL(12, 8) DEFAULT 0.00000000
        COMMENT 'Formula ratio for calculation (restored)';
    `);

    // Migrate data back: rumus → formulaRatio
    await queryRunner.query(`
      UPDATE formula_materials
      SET formulaRatio = CAST(rumus AS DECIMAL(12, 8)),
          quantityRequired = rumus
      WHERE rumus IS NOT NULL;
    `);

    // Drop rumus column
    await queryRunner.query(`
      ALTER TABLE formula_materials
      DROP COLUMN rumus;
    `);

    console.log('⚠️  Restored quantityRequired and formulaRatio columns');
  }
}
