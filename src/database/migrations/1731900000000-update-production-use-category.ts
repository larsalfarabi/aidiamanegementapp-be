import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Update Production Module to use ProductCategories FK
 *
 * Purpose:
 * - Replace hardcoded MaterialType enum with dynamic FK to product_categories
 * - Ensures consistency between Production module and Product module
 * - Allows adding new material categories without code changes
 *
 * Changes:
 * 1. formula_materials: materialType enum → materialCategoryId FK
 * 2. production_material_usage: materialType enum → materialCategoryId FK
 *
 * Data Migration:
 * - RAW_MATERIAL → category "Bahan Baku"
 * - ADDITIVE → category "Bahan Pembantu"
 * - PACKAGING → category "Bahan Kemasan"
 * - CONCENTRATE → category "Concentrate"
 */
export class UpdateProductionUseCategory1731900000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ============================================================
    // STEP 1: Update formula_materials table
    // ============================================================

    // 1.1. Add new column materialCategoryId
    await queryRunner.query(`
      ALTER TABLE formula_materials 
      ADD COLUMN materialCategoryId INT NULL 
      COMMENT 'Material category (FK to product_categories, level=0 for main categories)'
    `);

    // 1.2. Migrate data: MaterialType enum → ProductCategories FK
    // Map: RAW_MATERIAL → "Bahan Baku"
    await queryRunner.query(`
      UPDATE formula_materials fm
      INNER JOIN product_categories pc ON pc.name = 'Bahan Baku' AND pc.level = 0
      SET fm.materialCategoryId = pc.id
      WHERE fm.materialType = 'RAW_MATERIAL'
    `);

    // Map: ADDITIVE → "Bahan Pembantu"
    await queryRunner.query(`
      UPDATE formula_materials fm
      INNER JOIN product_categories pc ON pc.name = 'Bahan Pembantu' AND pc.level = 0
      SET fm.materialCategoryId = pc.id
      WHERE fm.materialType = 'ADDITIVE'
    `);

    // Map: PACKAGING → "Bahan Kemasan"
    await queryRunner.query(`
      UPDATE formula_materials fm
      INNER JOIN product_categories pc ON pc.name = 'Bahan Kemasan' AND pc.level = 0
      SET fm.materialCategoryId = pc.id
      WHERE fm.materialType = 'PACKAGING'
    `);

    // Map: CONCENTRATE → "Concentrate"
    await queryRunner.query(`
      UPDATE formula_materials fm
      INNER JOIN product_categories pc ON pc.name = 'Concentrate' AND pc.level = 0
      SET fm.materialCategoryId = pc.id
      WHERE fm.materialType = 'CONCENTRATE'
    `);

    // 1.3. Drop old enum column
    await queryRunner.query(`
      ALTER TABLE formula_materials 
      DROP COLUMN materialType
    `);

    // 1.4. Add FK constraint
    await queryRunner.query(`
      ALTER TABLE formula_materials
      ADD CONSTRAINT FK_formula_materials_category
      FOREIGN KEY (materialCategoryId) 
      REFERENCES product_categories(id)
      ON DELETE RESTRICT
      ON UPDATE CASCADE
    `);

    // 1.5. Add index for performance
    await queryRunner.query(`
      CREATE INDEX IDX_formula_materials_category 
      ON formula_materials(materialCategoryId)
    `);

    // ============================================================
    // STEP 2: Update production_material_usage table
    // ============================================================

    // 2.1. Add new column materialCategoryId
    await queryRunner.query(`
      ALTER TABLE production_material_usage 
      ADD COLUMN materialCategoryId INT NULL
      COMMENT 'Material category (FK to product_categories)'
    `);

    // 2.2. Migrate data: MaterialType enum → ProductCategories FK
    await queryRunner.query(`
      UPDATE production_material_usage pmu
      INNER JOIN product_categories pc ON pc.name = 'Bahan Baku' AND pc.level = 0
      SET pmu.materialCategoryId = pc.id
      WHERE pmu.materialType = 'RAW_MATERIAL'
    `);

    await queryRunner.query(`
      UPDATE production_material_usage pmu
      INNER JOIN product_categories pc ON pc.name = 'Bahan Pembantu' AND pc.level = 0
      SET pmu.materialCategoryId = pc.id
      WHERE pmu.materialType = 'ADDITIVE'
    `);

    await queryRunner.query(`
      UPDATE production_material_usage pmu
      INNER JOIN product_categories pc ON pc.name = 'Bahan Kemasan' AND pc.level = 0
      SET pmu.materialCategoryId = pc.id
      WHERE pmu.materialType = 'PACKAGING'
    `);

    await queryRunner.query(`
      UPDATE production_material_usage pmu
      INNER JOIN product_categories pc ON pc.name = 'Concentrate' AND pc.level = 0
      SET pmu.materialCategoryId = pc.id
      WHERE pmu.materialType = 'CONCENTRATE'
    `);

    // 2.3. Drop old enum column
    await queryRunner.query(`
      ALTER TABLE production_material_usage 
      DROP COLUMN materialType
    `);

    // 2.4. Add FK constraint
    await queryRunner.query(`
      ALTER TABLE production_material_usage
      ADD CONSTRAINT FK_production_material_usage_category
      FOREIGN KEY (materialCategoryId) 
      REFERENCES product_categories(id)
      ON DELETE RESTRICT
      ON UPDATE CASCADE
    `);

    // 2.5. Add index for performance
    await queryRunner.query(`
      CREATE INDEX IDX_production_material_usage_category 
      ON production_material_usage(materialCategoryId)
    `);

    console.log(
      '✅ Production module successfully migrated to use ProductCategories',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ============================================================
    // ROLLBACK STEP 1: Revert production_material_usage
    // ============================================================

    // Drop FK and index
    await queryRunner.query(`
      ALTER TABLE production_material_usage 
      DROP FOREIGN KEY FK_production_material_usage_category
    `);

    await queryRunner.query(`
      DROP INDEX IDX_production_material_usage_category 
      ON production_material_usage
    `);

    // Add back enum column
    await queryRunner.query(`
      ALTER TABLE production_material_usage 
      ADD COLUMN materialType ENUM('RAW_MATERIAL', 'ADDITIVE', 'PACKAGING', 'CONCENTRATE') NULL
    `);

    // Reverse migrate data: ProductCategories FK → MaterialType enum
    await queryRunner.query(`
      UPDATE production_material_usage pmu
      INNER JOIN product_categories pc ON pmu.materialCategoryId = pc.id
      SET pmu.materialType = CASE pc.name
        WHEN 'Bahan Baku' THEN 'RAW_MATERIAL'
        WHEN 'Bahan Pembantu' THEN 'ADDITIVE'
        WHEN 'Bahan Kemasan' THEN 'PACKAGING'
        WHEN 'Concentrate' THEN 'CONCENTRATE'
      END
    `);

    // Drop new column
    await queryRunner.query(`
      ALTER TABLE production_material_usage 
      DROP COLUMN materialCategoryId
    `);

    // ============================================================
    // ROLLBACK STEP 2: Revert formula_materials
    // ============================================================

    // Drop FK and index
    await queryRunner.query(`
      ALTER TABLE formula_materials 
      DROP FOREIGN KEY FK_formula_materials_category
    `);

    await queryRunner.query(`
      DROP INDEX IDX_formula_materials_category 
      ON formula_materials
    `);

    // Add back enum column
    await queryRunner.query(`
      ALTER TABLE formula_materials 
      ADD COLUMN materialType ENUM('RAW_MATERIAL', 'ADDITIVE', 'PACKAGING', 'CONCENTRATE') NULL
    `);

    // Reverse migrate data
    await queryRunner.query(`
      UPDATE formula_materials fm
      INNER JOIN product_categories pc ON fm.materialCategoryId = pc.id
      SET fm.materialType = CASE pc.name
        WHEN 'Bahan Baku' THEN 'RAW_MATERIAL'
        WHEN 'Bahan Pembantu' THEN 'ADDITIVE'
        WHEN 'Bahan Kemasan' THEN 'PACKAGING'
        WHEN 'Concentrate' THEN 'CONCENTRATE'
      END
    `);

    // Drop new column
    await queryRunner.query(`
      ALTER TABLE formula_materials 
      DROP COLUMN materialCategoryId
    `);

    console.log('⚠️ Production module rolled back to use MaterialType enum');
  }
}
