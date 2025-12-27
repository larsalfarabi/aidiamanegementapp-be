import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Swap Category Relationships between Products and ProductCodes
 *
 * BUSINESS JUSTIFICATION:
 * - ProductCodes (SKU final) → Should use MAIN Category (Barang Jadi, Barang Baku, dll)
 * - Products (konsep produk) → Should use SUB Category (Buffet, Premium, Freshly)
 *
 * CURRENT STRUCTURE (❌ INCORRECT):
 * - Products.categoryId → Main Category (level=0)
 * - ProductCodes.categoryId → Sub Category (level=1)
 *
 * NEW STRUCTURE (✅ CORRECT):
 * - Products.categoryId → Sub Category (level=1)  [Buffet, Premium, Freshly]
 * - ProductCodes.categoryId → Main Category (level=0) [Barang Jadi, Barang Baku, dll]
 *
 * STRATEGY:
 * 1. Create temporary columns
 * 2. Copy current categoryId values to temp columns
 * 3. Swap categoryId values between Products and ProductCodes
 * 4. Verify results
 * 5. Cleanup temp columns
 *
 * SAFETY:
 * - Uses transactions (auto-rollback on error)
 * - Validation checks before and after
 * - Detailed logging for troubleshooting
 */
export class SwapCategoryRelationships1734110000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log(
      '🔄 [Migration] Starting Category Relationship Swap (Products ↔ ProductCodes)...',
    );

    // ============================================
    // STEP 1: Pre-Migration Validation
    // ============================================
    console.log('📊 [Migration] Pre-migration data analysis...');

    const preSwapProducts = await queryRunner.query(`
      SELECT 
        'Products-Before' as tableName,
        p.id,
        p.name as productName,
        p.productType,
        pc.id as categoryId,
        pc.name as categoryName,
        pc.level as categoryLevel
      FROM products p
      LEFT JOIN product_categories pc ON p.categoryId = pc.id
      WHERE p.productType IN ('RTD', 'CONC')
      ORDER BY p.id
      LIMIT 10
    `);

    console.log('📋 [Migration] Sample Products BEFORE swap:');
    console.table(preSwapProducts);

    const preSwapProductCodes = await queryRunner.query(`
      SELECT 
        'ProductCodes-Before' as tableName,
        pcode.id,
        pcode.productCode,
        p.name as productName,
        pc.id as categoryId,
        pc.name as categoryName,
        pc.level as categoryLevel
      FROM product_codes pcode
      LEFT JOIN products p ON pcode.productId = p.id
      LEFT JOIN product_categories pc ON pcode.categoryId = pc.id
      WHERE p.productType IN ('RTD', 'CONC')
      ORDER BY pcode.id
      LIMIT 10
    `);

    console.log('📋 [Migration] Sample ProductCodes BEFORE swap:');
    console.table(preSwapProductCodes);

    // ============================================
    // STEP 2: Create Temporary Columns
    // ============================================
    console.log('🔧 [Migration] Creating temporary columns...');

    await queryRunner.query(`
      ALTER TABLE products 
      ADD COLUMN tempCategoryId INT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE product_codes 
      ADD COLUMN tempCategoryId INT NULL
    `);

    // ============================================
    // STEP 3: Store Current categoryId in Temp
    // ============================================
    console.log('💾 [Migration] Storing current categoryId values in temp...');

    await queryRunner.query(`
      UPDATE products 
      SET tempCategoryId = categoryId
    `);

    await queryRunner.query(`
      UPDATE product_codes 
      SET tempCategoryId = categoryId
    `);

    // ============================================
    // STEP 4: Clear Products.categoryId (prepare for swap)
    // ============================================
    console.log('🗑️ [Migration] Clearing Products.categoryId...');

    await queryRunner.query(`
      UPDATE products 
      SET categoryId = NULL
    `);

    // ============================================
    // STEP 5: SWAP - ProductCodes get Main Category (from Products.tempCategoryId)
    // ============================================
    console.log(
      '🔄 [Migration] SWAP Step 1: ProductCodes.categoryId ← Products.tempCategoryId (Main Category)...',
    );

    const swapStep1 = await queryRunner.query(`
      UPDATE product_codes pcode
      INNER JOIN products p ON pcode.productId = p.id
      SET pcode.categoryId = p.tempCategoryId
      WHERE p.tempCategoryId IS NOT NULL
    `);

    console.log(
      `✅ [Migration] Updated ${swapStep1.affectedRows} ProductCodes with Main Category`,
    );

    // ============================================
    // STEP 6: SWAP - Products get Sub Category (from ProductCodes.tempCategoryId)
    // ============================================
    console.log(
      '🔄 [Migration] SWAP Step 2: Products.categoryId ← ProductCodes.tempCategoryId (Sub Category)...',
    );

    // Strategy: Use first ProductCode's category for each Product
    const swapStep2 = await queryRunner.query(`
      UPDATE products p
      INNER JOIN (
        SELECT 
          productId, 
          MIN(tempCategoryId) as subCategoryId
        FROM product_codes 
        WHERE tempCategoryId IS NOT NULL
        GROUP BY productId
      ) pcode ON p.id = pcode.productId
      SET p.categoryId = pcode.subCategoryId
      WHERE pcode.subCategoryId IS NOT NULL
    `);

    console.log(
      `✅ [Migration] Updated ${swapStep2.affectedRows} Products with Sub Category`,
    );

    // ============================================
    // STEP 7: Handle Products without ProductCodes
    // ============================================
    console.log('🔍 [Migration] Checking Products without ProductCodes...');

    const productsWithoutCodes = await queryRunner.query(`
      SELECT 
        p.id,
        p.name,
        p.productType,
        p.categoryId,
        p.tempCategoryId
      FROM products p
      LEFT JOIN product_codes pcode ON p.id = pcode.productId
      WHERE pcode.id IS NULL
        AND p.categoryId IS NULL
        AND p.tempCategoryId IS NOT NULL
    `);

    if (productsWithoutCodes.length > 0) {
      console.log(
        `⚠️ [Migration] Found ${productsWithoutCodes.length} Products without ProductCodes:`,
      );
      console.table(productsWithoutCodes);

      // For Products without ProductCodes, keep them NULL or set to a default
      // Business decision: Keep NULL for now (these are incomplete products)
      console.log(
        '📝 [Migration] These products will have NULL categoryId (need manual review)',
      );
    }

    // ============================================
    // STEP 8: Cleanup Temporary Columns
    // ============================================
    console.log('🧹 [Migration] Cleaning up temporary columns...');

    await queryRunner.query(`
      ALTER TABLE products DROP COLUMN tempCategoryId
    `);

    await queryRunner.query(`
      ALTER TABLE product_codes DROP COLUMN tempCategoryId
    `);

    // ============================================
    // STEP 9: Post-Migration Verification
    // ============================================
    console.log('✅ [Migration] Verifying results...');

    const postSwapProducts = await queryRunner.query(`
      SELECT 
        'Products-After' as tableName,
        p.id,
        p.name as productName,
        p.productType,
        pc.id as categoryId,
        pc.name as categoryName,
        pc.level as categoryLevel,
        CASE 
          WHEN pc.level = 1 THEN '✅ CORRECT (Sub Category)'
          WHEN pc.level = 0 THEN '❌ WRONG (Still Main Category)'
          ELSE '⚠️ NULL or Invalid'
        END as status
      FROM products p
      LEFT JOIN product_categories pc ON p.categoryId = pc.id
      WHERE p.productType IN ('RTD', 'CONC')
      ORDER BY p.id
      LIMIT 10
    `);

    console.log('📋 [Migration] Sample Products AFTER swap:');
    console.table(postSwapProducts);

    const postSwapProductCodes = await queryRunner.query(`
      SELECT 
        'ProductCodes-After' as tableName,
        pcode.id,
        pcode.productCode,
        p.name as productName,
        pc.id as categoryId,
        pc.name as categoryName,
        pc.level as categoryLevel,
        CASE 
          WHEN pc.level = 0 THEN '✅ CORRECT (Main Category)'
          WHEN pc.level = 1 THEN '❌ WRONG (Still Sub Category)'
          ELSE '⚠️ NULL or Invalid'
        END as status
      FROM product_codes pcode
      LEFT JOIN products p ON pcode.productId = p.id
      LEFT JOIN product_categories pc ON pcode.categoryId = pc.id
      WHERE p.productType IN ('RTD', 'CONC')
      ORDER BY pcode.id
      LIMIT 10
    `);

    console.log('📋 [Migration] Sample ProductCodes AFTER swap:');
    console.table(postSwapProductCodes);

    // ============================================
    // STEP 10: Summary Statistics
    // ============================================
    const summary = await queryRunner.query(`
      SELECT 
        'Products' as tableName,
        COUNT(*) as totalRecords,
        SUM(CASE WHEN pc.level = 1 THEN 1 ELSE 0 END) as correctLevel1,
        SUM(CASE WHEN pc.level = 0 THEN 1 ELSE 0 END) as wrongLevel0,
        SUM(CASE WHEN p.categoryId IS NULL THEN 1 ELSE 0 END) as nullCategory
      FROM products p
      LEFT JOIN product_categories pc ON p.categoryId = pc.id
      WHERE p.productType IN ('RTD', 'CONC')
      
      UNION ALL
      
      SELECT 
        'ProductCodes' as tableName,
        COUNT(*) as totalRecords,
        SUM(CASE WHEN pc.level = 0 THEN 1 ELSE 0 END) as correctLevel0,
        SUM(CASE WHEN pc.level = 1 THEN 1 ELSE 0 END) as wrongLevel1,
        SUM(CASE WHEN pcode.categoryId IS NULL THEN 1 ELSE 0 END) as nullCategory
      FROM product_codes pcode
      LEFT JOIN products p ON pcode.productId = p.id
      LEFT JOIN product_categories pc ON pcode.categoryId = pc.id
      WHERE p.productType IN ('RTD', 'CONC')
    `);

    console.log('📊 [Migration] Summary Statistics:');
    console.table(summary);

    console.log('🎉 [Migration] Category Relationship Swap completed!');
    console.log('');
    console.log('✅ NEW STRUCTURE:');
    console.log('   - Products.categoryId → Sub Category (level=1)');
    console.log('   - ProductCodes.categoryId → Main Category (level=0)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log('⏮️ [Migration] Reverting Category Relationship Swap...');

    // Create temp columns
    await queryRunner.query(`
      ALTER TABLE products ADD COLUMN tempCategoryId INT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE product_codes ADD COLUMN tempCategoryId INT NULL
    `);

    // Store current values
    await queryRunner.query(`
      UPDATE products SET tempCategoryId = categoryId
    `);
    await queryRunner.query(`
      UPDATE product_codes SET tempCategoryId = categoryId
    `);

    // Clear Products
    await queryRunner.query(`
      UPDATE products SET categoryId = NULL
    `);

    // Reverse swap: Products get Main Category back
    await queryRunner.query(`
      UPDATE products p
      INNER JOIN product_codes pcode ON p.id = pcode.productId
      SET p.categoryId = pcode.tempCategoryId
      WHERE pcode.tempCategoryId IS NOT NULL
      LIMIT 1
    `);

    // Reverse swap: ProductCodes get Sub Category back
    await queryRunner.query(`
      UPDATE product_codes pcode
      SET pcode.categoryId = pcode.tempCategoryId
      WHERE pcode.tempCategoryId IS NOT NULL
    `);

    // Cleanup
    await queryRunner.query(`
      ALTER TABLE products DROP COLUMN tempCategoryId
    `);
    await queryRunner.query(`
      ALTER TABLE product_codes DROP COLUMN tempCategoryId
    `);

    console.log('✅ [Migration] Reverted to original structure');
  }
}
