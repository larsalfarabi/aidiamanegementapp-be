import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AddPreviousInvoiceNumber
 *
 * Adds `previousInvoiceNumber` column to orders table to store
 * the old invoice number when an order's invoice month changes during edit.
 * This enables traceability (Option B) for invoice number changes.
 *
 * Strategy:
 * 1. Add column safely (skip if already exists from synchronize)
 * 2. Column is nullable — only populated when invoice month changes during edit
 */
export class AddPreviousInvoiceNumber1771908260000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Check if column already exists (may have been auto-synced)
    const columnExists = await queryRunner.query(`
      SELECT COUNT(*) as cnt
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'orders'
      AND COLUMN_NAME = 'previousInvoiceNumber'
    `);

    if (Number(columnExists[0].cnt) === 0) {
      // Column doesn't exist — create it
      await queryRunner.query(`
        ALTER TABLE \`orders\`
        ADD COLUMN \`previousInvoiceNumber\` VARCHAR(50) NULL DEFAULT NULL
        COMMENT 'Nomor invoice sebelumnya (jika bulan berubah saat edit)'
        AFTER \`invoiceNumber\`
      `);
      console.log('[MIGRATION] Column previousInvoiceNumber created');
    } else {
      console.log(
        '[MIGRATION] Column previousInvoiceNumber already exists (from synchronize), skipping ALTER',
      );
    }

    // Step 2: Show current state
    const stats = await queryRunner.query(`
      SELECT
        COUNT(*) as totalOrders,
        SUM(CASE WHEN previousInvoiceNumber IS NOT NULL THEN 1 ELSE 0 END) as withPrevious
      FROM orders
    `);
    console.log('[MIGRATION] Stats:', JSON.stringify(stats));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const columnExists = await queryRunner.query(`
      SELECT COUNT(*) as cnt
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'orders'
      AND COLUMN_NAME = 'previousInvoiceNumber'
    `);

    if (Number(columnExists[0].cnt) > 0) {
      await queryRunner.query(`
        ALTER TABLE \`orders\` DROP COLUMN \`previousInvoiceNumber\`
      `);
      console.log('[MIGRATION] Column previousInvoiceNumber dropped');
    }
  }
}
