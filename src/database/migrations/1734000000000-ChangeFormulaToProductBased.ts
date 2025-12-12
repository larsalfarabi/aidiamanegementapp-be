import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Change Formula from ProductCode to Product-based
 *
 * CRITICAL CHANGE: Formula flexibility enhancement
 *
 * BEFORE:
 * - Formula tied to specific ProductCode (e.g., JAMBU-250ML)
 * - One formula = One product size only
 * - Inflexible for multi-size production
 *
 * AFTER:
 * - Formula tied to Product concept (e.g., MANGO JUICE - PREMIUM - RTD)
 * - One formula can produce multiple product sizes
 * - Bottling stage determines final product distribution
 *
 * Example:
 * Formula: MANGO JUICE - PREMIUM - RTD
 * Bottling Output:
 *   - 10 bottles × 1L
 *   - 5 bottles × 250ML
 *   - 10 bottles × 5L
 *
 * Database Changes:
 * 1. Add productId to production_formulas (nullable initially)
 * 2. Migrate data: productCodeId → productId (via productCode.product)
 * 3. Drop productCodeId column
 * 4. Make productId NOT NULL
 * 5. Update indexes
 *
 * Similar changes to production_batches for consistency
 */
export class ChangeFormulaToProductBased1734000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ============================================
    // STEP 1: Add new productId columns (nullable)
    // ============================================
    // Check if column exists first (handle partial migration)
    const formulasColumns = await queryRunner.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'production_formulas' 
        AND COLUMN_NAME = 'productId'
    `);

    if (formulasColumns.length === 0) {
      await queryRunner.query(`
        ALTER TABLE production_formulas 
        ADD COLUMN productId INT NULL 
        COMMENT 'Product concept (e.g., MANGO JUICE - PREMIUM - RTD)'
      `);
    }

    const batchesColumns = await queryRunner.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'production_batches' 
        AND COLUMN_NAME = 'productId'
    `);

    if (batchesColumns.length === 0) {
      await queryRunner.query(`
        ALTER TABLE production_batches 
        ADD COLUMN productId INT NULL 
        COMMENT 'Product concept for this batch'
      `);
    }

    // ============================================
    // STEP 2: Migrate existing data
    // ============================================
    // For formulas: Get productId from productCodeId
    await queryRunner.query(`
      UPDATE production_formulas pf
      INNER JOIN product_codes pc ON pf.productCodeId = pc.id
      SET pf.productId = pc.productId
      WHERE pf.productCodeId IS NOT NULL
    `);

    // For batches: Get productId from productCodeId
    await queryRunner.query(`
      UPDATE production_batches pb
      INNER JOIN product_codes pc ON pb.productCodeId = pc.id
      SET pb.productId = pc.productId
      WHERE pb.productCodeId IS NOT NULL
    `);

    // ============================================
    // STEP 3: Add foreign keys to Products
    // ============================================
    // Check if FK exists first
    const formulaFKs = await queryRunner.query(`
      SELECT CONSTRAINT_NAME 
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'production_formulas' 
        AND CONSTRAINT_NAME = 'fk_formula_product'
    `);

    if (formulaFKs.length === 0) {
      await queryRunner.query(`
        ALTER TABLE production_formulas
        ADD CONSTRAINT fk_formula_product
        FOREIGN KEY (productId) REFERENCES products(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
      `);
    }

    const batchFKs = await queryRunner.query(`
      SELECT CONSTRAINT_NAME 
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'production_batches' 
        AND CONSTRAINT_NAME = 'fk_batch_product'
    `);

    if (batchFKs.length === 0) {
      await queryRunner.query(`
        ALTER TABLE production_batches
        ADD CONSTRAINT fk_batch_product
        FOREIGN KEY (productId) REFERENCES products(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
      `);
    }

    // ============================================
    // STEP 4: Make productId NOT NULL
    // ============================================
    await queryRunner.query(`
      ALTER TABLE production_formulas 
      MODIFY COLUMN productId INT NOT NULL 
      COMMENT 'Product concept (e.g., MANGO JUICE - PREMIUM - RTD)'
    `);

    await queryRunner.query(`
      ALTER TABLE production_batches 
      MODIFY COLUMN productId INT NOT NULL 
      COMMENT 'Product concept for this batch'
    `);

    // ============================================
    // STEP 5: Drop old unique index and create new one
    // ============================================
    // Check if old index exists before dropping
    const oldIndexes = await queryRunner.query(`
      SELECT INDEX_NAME 
      FROM INFORMATION_SCHEMA.STATISTICS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'production_formulas' 
        AND INDEX_NAME = 'IDX_production_formulas_productCodeId_version'
    `);

    if (oldIndexes.length > 0) {
      await queryRunner.query(`
        ALTER TABLE production_formulas
        DROP INDEX IDX_production_formulas_productCodeId_version
      `);
    }

    // Check if new index already exists
    const newIndexes = await queryRunner.query(`
      SELECT INDEX_NAME 
      FROM INFORMATION_SCHEMA.STATISTICS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'production_formulas' 
        AND INDEX_NAME = 'IDX_production_formulas_productId_version'
    `);

    if (newIndexes.length === 0) {
      // Create new unique constraint on (productId, version)
      await queryRunner.query(`
        CREATE UNIQUE INDEX IDX_production_formulas_productId_version
        ON production_formulas (productId, version)
        COMMENT 'One version per product concept'
      `);
    }

    // ============================================
    // STEP 6: Keep productCodeId for backward compatibility
    // ============================================
    // NOTE: We keep productCodeId but make it nullable
    // This allows gradual migration and helps with data tracking
    await queryRunner.query(`
      ALTER TABLE production_formulas 
      MODIFY COLUMN productCodeId INT NULL 
      COMMENT 'Legacy: Original product code (kept for reference)'
    `);

    await queryRunner.query(`
      ALTER TABLE production_batches 
      MODIFY COLUMN productCodeId INT NULL 
      COMMENT 'Legacy: Can be null for multi-size batches (set during bottling)'
    `);

    // ============================================
    // STEP 7: Add new bottling output table
    // ============================================
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS production_bottling_output (
        id INT PRIMARY KEY AUTO_INCREMENT,
        batchId INT NOT NULL COMMENT 'Production batch reference',
        productCodeId INT NOT NULL COMMENT 'Specific product size/variant',
        plannedQuantity DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT 'Planned bottles for this size',
        actualQuantity DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT 'Actual bottles produced',
        qcPassedQuantity DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT 'Bottles that passed QC',
        qcRejectedQuantity DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT 'Bottles rejected by QC',
        notes TEXT NULL COMMENT 'Notes for this output line',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        createdBy INT NULL,
        updatedBy INT NULL,
        
        FOREIGN KEY (batchId) REFERENCES production_batches(id) ON DELETE CASCADE,
        FOREIGN KEY (productCodeId) REFERENCES product_codes(id) ON DELETE RESTRICT,
        FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (updatedBy) REFERENCES users(id) ON DELETE SET NULL,
        
        INDEX idx_bottling_batch (batchId),
        INDEX idx_bottling_product_code (productCodeId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 
      COMMENT='Bottling stage output: Multiple product sizes per batch'
    `);

    console.log(
      '✅ Migration completed: Formula now product-based with flexible bottling',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ============================================
    // ROLLBACK: Reverse all changes
    // ============================================

    // Drop bottling output table
    await queryRunner.query(`DROP TABLE IF EXISTS production_bottling_output`);

    // Drop new indexes
    await queryRunner.query(`
      ALTER TABLE production_formulas
      DROP INDEX IDX_production_formulas_productId_version
    `);

    // Drop foreign keys
    await queryRunner.query(`
      ALTER TABLE production_formulas
      DROP FOREIGN KEY fk_formula_product
    `);

    await queryRunner.query(`
      ALTER TABLE production_batches
      DROP FOREIGN KEY fk_batch_product
    `);

    // Drop productId columns
    await queryRunner.query(`
      ALTER TABLE production_formulas DROP COLUMN productId
    `);

    await queryRunner.query(`
      ALTER TABLE production_batches DROP COLUMN productId
    `);

    // Restore productCodeId to NOT NULL
    await queryRunner.query(`
      ALTER TABLE production_formulas 
      MODIFY COLUMN productCodeId INT NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE production_batches 
      MODIFY COLUMN productCodeId INT NOT NULL
    `);

    // Restore old unique index
    await queryRunner.query(`
      CREATE UNIQUE INDEX IDX_production_formulas_productCodeId_version
      ON production_formulas (productCodeId, version)
    `);

    console.log('✅ Rollback completed: Formula back to productCode-based');
  }
}
