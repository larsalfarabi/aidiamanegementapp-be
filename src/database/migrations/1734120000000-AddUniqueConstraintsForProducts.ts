import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

/**
 * Migration: Add Unique Constraints to Prevent Product Duplication
 *
 * Purpose:
 * - Prevent duplicate Products (same name + category + productType)
 * - Prevent duplicate ProductCodes (same product + mainCategory + size)
 *
 * Business Rules:
 * 1. Products: One unique combination of (name, categoryId, productType)
 *    Example: "ORANGE JUICE" + "Buffet" + "RTD" can only exist once
 *
 * 2. ProductCodes: One unique combination of (productId, categoryId, sizeId)
 *    Example: ORANGE JUICE-Buffet-RTD with "Barang Jadi" + "1000ML" can only exist once
 *
 * Impact:
 * - Formula dropdown will no longer show duplicates
 * - Product creation will fail if duplicate combination exists
 * - Database integrity is enforced at DB level
 */
export class AddUniqueConstraintsForProducts1734120000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ========================================
    // 1. CLEAN EXISTING DUPLICATES (if any)
    // ========================================

    console.log('🔍 Checking for duplicate Products...');

    // Find duplicate products (same name + categoryId + productType)
    // Note: Products table doesn't have soft delete, so check all active records
    const duplicateProducts = await queryRunner.query(`
      SELECT 
        name, 
        categoryId, 
        productType, 
        COUNT(*) as count,
        GROUP_CONCAT(id ORDER BY id) as duplicate_ids
      FROM products
      WHERE isActive = 1
      GROUP BY name, categoryId, productType
      HAVING COUNT(*) > 1
    `);

    if (duplicateProducts.length > 0) {
      console.log(
        `⚠️  Found ${duplicateProducts.length} duplicate product groups`,
      );
      console.table(duplicateProducts);

      // Keep the oldest record, deactivate the rest
      for (const dup of duplicateProducts) {
        const ids = dup.duplicate_ids.split(',');
        const keepId = ids[0]; // Keep first (oldest)
        const deactivateIds = ids.slice(1); // Deactivate the rest

        console.log(
          `📌 Keeping product ID ${keepId}, deactivating: ${deactivateIds.join(', ')}`,
        );

        await queryRunner.query(`
          UPDATE products 
          SET isActive = 0
          WHERE id IN (${deactivateIds.join(',')})
        `);
      }
    } else {
      console.log('✅ No duplicate Products found');
    }

    // Find duplicate product codes (same productId + categoryId + sizeId)
    const duplicateProductCodes = await queryRunner.query(`
      SELECT 
        productId, 
        categoryId, 
        sizeId,
        COUNT(*) as count,
        GROUP_CONCAT(id ORDER BY id) as duplicate_ids
      FROM product_codes
      WHERE isDeleted = 0
      GROUP BY productId, categoryId, sizeId
      HAVING COUNT(*) > 1
    `);

    if (duplicateProductCodes.length > 0) {
      console.log(
        `⚠️  Found ${duplicateProductCodes.length} duplicate product code groups`,
      );
      console.table(duplicateProductCodes);

      // Keep the oldest record, soft-delete the rest
      for (const dup of duplicateProductCodes) {
        const ids = dup.duplicate_ids.split(',');
        const keepId = ids[0]; // Keep first (oldest)
        const deleteIds = ids.slice(1); // Soft-delete the rest

        console.log(
          `📌 Keeping product code ID ${keepId}, soft-deleting: ${deleteIds.join(', ')}`,
        );

        await queryRunner.query(`
          UPDATE product_codes 
          SET isDeleted = 1
          WHERE id IN (${deleteIds.join(',')})
        `);
      }
    } else {
      console.log('✅ No duplicate ProductCodes found');
    }

    // ========================================
    // 2. ADD UNIQUE CONSTRAINTS
    // ========================================

    console.log('🔧 Adding unique constraints...');

    // Products: UNIQUE (name, categoryId, productType) for active records
    // MySQL partial indexes: Use WHERE clause in index definition
    try {
      await queryRunner.query(`
        CREATE UNIQUE INDEX IDX_UNIQUE_PRODUCT_NAME_CATEGORY_TYPE 
        ON products (name, categoryId, productType)
      `);
      console.log(
        '✅ Added unique constraint: products (name, categoryId, productType)',
      );
    } catch (error) {
      console.warn(
        '⚠️  Note: This constraint will enforce uniqueness on ALL records (including inactive)',
      );
      console.warn(
        '   Consider using application-level validation for inactive records',
      );
      throw error;
    }

    // ProductCodes: UNIQUE (productId, categoryId, sizeId) for non-deleted records
    try {
      await queryRunner.query(`
        CREATE UNIQUE INDEX IDX_UNIQUE_PRODUCTCODE_PRODUCT_CATEGORY_SIZE 
        ON product_codes (productId, categoryId, sizeId)
        WHERE isDeleted = 0
      `);
      console.log(
        '✅ Added unique constraint: product_codes (productId, categoryId, sizeId)',
      );
    } catch (error) {
      // MySQL doesn't support partial indexes with WHERE clause, create full unique index
      console.warn(
        '⚠️  MySQL does not support partial indexes, creating full unique index...',
      );
      await queryRunner.query(`
        CREATE UNIQUE INDEX IDX_UNIQUE_PRODUCTCODE_PRODUCT_CATEGORY_SIZE 
        ON product_codes (productId, categoryId, sizeId, isDeleted)
      `);
      console.log(
        '✅ Added unique constraint: product_codes (productId, categoryId, sizeId, isDeleted)',
      );
    }

    console.log('✅ Migration completed successfully!');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log('🔄 Reverting unique constraints...');

    // Remove unique indexes
    try {
      await queryRunner.query(`
        DROP INDEX IDX_UNIQUE_PRODUCTCODE_PRODUCT_CATEGORY_SIZE ON product_codes
      `);
      console.log(
        '✅ Dropped index: IDX_UNIQUE_PRODUCTCODE_PRODUCT_CATEGORY_SIZE',
      );
    } catch (error) {
      console.warn('⚠️  Index may not exist:', error.message);
    }

    try {
      await queryRunner.query(`
        DROP INDEX IDX_UNIQUE_PRODUCT_NAME_CATEGORY_TYPE ON products
      `);
      console.log('✅ Dropped index: IDX_UNIQUE_PRODUCT_NAME_CATEGORY_TYPE');
    } catch (error) {
      console.warn('⚠️  Index may not exist:', error.message);
    }

    console.log('✅ Rollback completed!');
  }
}
