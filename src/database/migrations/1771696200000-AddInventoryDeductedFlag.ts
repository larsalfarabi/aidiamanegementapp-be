import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AddInventoryDeductedFlag
 *
 * Adds `inventoryDeducted` boolean to orders table to track whether
 * inventory has been deducted for each order.
 *
 * Strategy:
 * 1. Add column with DEFAULT false (skip if already exists from synchronize)
 * 2. Add index for cron job queries
 * 3. SET true for orders that already have SALE inventory_transactions
 * 4. This ensures future-dated orders that never had stock deducted
 *    remain false and will be picked up by the backfill/cron.
 */
export class AddInventoryDeductedFlag1771696200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Check if column already exists (may have been auto-synced)
    const columnExists = await queryRunner.query(`
      SELECT COUNT(*) as cnt
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'orders'
      AND COLUMN_NAME = 'inventoryDeducted'
    `);

    if (Number(columnExists[0].cnt) === 0) {
      // Column doesn't exist — create it
      await queryRunner.query(`
        ALTER TABLE \`orders\`
        ADD COLUMN \`inventoryDeducted\` TINYINT(1) NOT NULL DEFAULT 0
        COMMENT 'Whether inventory has been deducted for this order'
      `);
      console.log('[MIGRATION] Column inventoryDeducted created');
    } else {
      console.log(
        '[MIGRATION] Column inventoryDeducted already exists (from synchronize), skipping ALTER',
      );
    }

    // Step 2: Check and add index
    const indexExists = await queryRunner.query(`
      SELECT COUNT(*) as cnt
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'orders'
      AND INDEX_NAME = 'IDX_orders_inventoryDeducted'
    `);

    if (Number(indexExists[0].cnt) === 0) {
      await queryRunner.query(`
        CREATE INDEX \`IDX_orders_inventoryDeducted\`
        ON \`orders\` (\`inventoryDeducted\`, \`invoiceDate\`)
      `);
      console.log('[MIGRATION] Index IDX_orders_inventoryDeducted created');
    }

    // Step 3: Set true for orders that have matching SALE transactions
    // This correctly identifies orders whose inventory was already processed
    const updateResult = await queryRunner.query(`
      UPDATE \`orders\` o
      SET o.\`inventoryDeducted\` = 1
      WHERE EXISTS (
        SELECT 1 FROM \`inventory_transactions\` it
        WHERE it.\`orderId\` = o.\`id\`
        AND it.\`transactionType\` = 'SALE'
      )
    `);

    console.log(
      `[MIGRATION] inventoryDeducted populated — ${updateResult.affectedRows || 'N/A'} orders marked as deducted`,
    );

    // Step 4: Show stats
    const stats = await queryRunner.query(
      'SELECT inventoryDeducted, COUNT(*) as cnt FROM orders GROUP BY inventoryDeducted',
    );
    console.log('[MIGRATION] Stats:', JSON.stringify(stats));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const indexExists = await queryRunner.query(`
      SELECT COUNT(*) as cnt
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'orders'
      AND INDEX_NAME = 'IDX_orders_inventoryDeducted'
    `);

    if (Number(indexExists[0].cnt) > 0) {
      await queryRunner.query(`
        DROP INDEX \`IDX_orders_inventoryDeducted\` ON \`orders\`
      `);
    }

    await queryRunner.query(`
      ALTER TABLE \`orders\` DROP COLUMN \`inventoryDeducted\`
    `);
  }
}
