import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Fix Product Category Levels
 *
 * PROBLEM:
 * Some Products incorrectly use SUB-CATEGORY (Buffet, Premium, Freshly)
 * instead of MAIN CATEGORY (Barang Jadi)
 *
 * CORRECT STRUCTURE:
 * - Products.categoryId → MAIN Category (level=0): Barang Jadi, Barang Baku, etc.
 * - ProductCodes.categoryId → SUB Category (level=1): Buffet, Premium, Freshly
 *
 * EXAMPLE INCORRECT DATA:
 * Products: ORANGE JUICE → categoryId = Buffet.id (level=1) ❌
 *
 * SHOULD BE:
 * Products: ORANGE JUICE → categoryId = Barang Jadi.id (level=0) ✅
 * ProductCodes: ORANGE-BUFFET-250ML → categoryId = Buffet.id (level=1) ✅
 *
 * STRATEGY:
 * 1. Identify Products with SUB-CATEGORY (level=1)
 * 2. Find parent MAIN CATEGORY via ProductCategories.parentId
 * 3. Update Products.categoryId to parent category
 * 4. Preserve sub-category info in ProductCodes (already correct if exists)
 *
 * SAFETY:
 * - Only updates Products with RTD/CONC productType (finished goods)
 * - Raw materials, packaging stay as-is
 * - Logs affected records before update
 */
export class FixProductCategoryLevels1734100000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log('🔍 [Migration] Starting Product Category Level Fix...');

    // ============================================
    // STEP 1: Identify affected Products
    // ============================================
    const affectedProducts = await queryRunner.query(`
      SELECT 
        p.id,
        p.name,
        p.productType,
        pc.id as currentCategoryId,
        pc.name as currentCategoryName,
        pc.level as currentLevel,
        pc.parentId,
        parent.id as parentCategoryId,
        parent.name as parentCategoryName,
        parent.level as parentLevel
      FROM products p
      INNER JOIN product_categories pc ON p.categoryId = pc.id
      LEFT JOIN product_categories parent ON pc.parentId = parent.id
      WHERE pc.level = 1  -- SUB-CATEGORY (Buffet, Premium, Freshly)
        AND p.productType IN ('RTD', 'CONC')  -- Only finished goods
        AND pc.parentId IS NOT NULL  -- Has parent category
    `);

    if (affectedProducts.length === 0) {
      console.log('✅ [Migration] No Products need category level fix');
      return;
    }

    console.log(
      `📊 [Migration] Found ${affectedProducts.length} Products with incorrect category level:`,
    );
    affectedProducts.forEach((product: any) => {
      console.log(`   - Product: "${product.name}" (${product.productType})`);
      console.log(
        `     Current: ${product.currentCategoryName} (level=${product.currentLevel})`,
      );
      console.log(
        `     Will fix to: ${product.parentCategoryName} (level=${product.parentLevel})`,
      );
    });

    // ============================================
    // STEP 2: Update Products to use MAIN CATEGORY
    // ============================================
    console.log('🔧 [Migration] Updating Products.categoryId...');

    await queryRunner.query(`
      UPDATE products p
      INNER JOIN product_categories pc ON p.categoryId = pc.id
      SET p.categoryId = pc.parentId,
          p.updatedAt = NOW()
      WHERE pc.level = 1
        AND p.productType IN ('RTD', 'CONC')
        AND pc.parentId IS NOT NULL
    `);

    console.log(
      `✅ [Migration] Updated ${affectedProducts.length} Products to use MAIN CATEGORY`,
    );

    // ============================================
    // STEP 3: Verify changes
    // ============================================
    const verification = await queryRunner.query(`
      SELECT 
        p.id,
        p.name,
        p.productType,
        pc.name as categoryName,
        pc.level as categoryLevel
      FROM products p
      INNER JOIN product_categories pc ON p.categoryId = pc.id
      WHERE p.productType IN ('RTD', 'CONC')
      ORDER BY pc.level, p.name
    `);

    console.log('📋 [Migration] Verification - Products with RTD/CONC:');
    verification.forEach((product: any) => {
      const status = product.categoryLevel === 0 ? '✅' : '⚠️ Still level 1';
      console.log(
        `   ${status} ${product.name} → ${product.categoryName} (level=${product.categoryLevel})`,
      );
    });

    // Check if any Products still have level=1
    const stillWrong = verification.filter((p: any) => p.categoryLevel === 1);
    if (stillWrong.length > 0) {
      console.warn(
        `⚠️ [Migration] ${stillWrong.length} Products still have SUB-CATEGORY (may be intentional if parentId is NULL)`,
      );
    } else {
      console.log('✅ [Migration] All RTD/CONC Products now use MAIN CATEGORY');
    }

    console.log('🎉 [Migration] Product Category Level Fix completed!');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log(
      '⚠️ [Migration Down] Cannot automatically revert category changes',
    );
    console.log('   Manual restoration required using backup data if needed');

    // Migration down is complex because we lost information about which
    // sub-category (Buffet/Premium/Freshly) each product originally had.
    // This would require:
    // 1. Backup table with original categoryId values
    // 2. Or infer from ProductCodes (if product has codes)
    //
    // For safety, we skip automatic down migration.
    // Users should restore from database backup if rollback needed.
  }
}
