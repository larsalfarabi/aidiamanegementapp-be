import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Migration: Remove orderStatus and paymentStatus columns from orders table
 *
 * Reason: These columns are no longer used in the business logic.
 * The system will track order state through invoiceDate instead.
 *
 * Created: 2025-01-15
 */
export class RemoveOrderStatusColumns1737000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop orderStatus column
    await queryRunner.dropColumn('orders', 'orderStatus');

    // Drop paymentStatus column
    await queryRunner.dropColumn('orders', 'paymentStatus');

    console.log(
      '✅ Successfully removed orderStatus and paymentStatus columns from orders table',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore orderStatus column
    await queryRunner.addColumn(
      'orders',
      new TableColumn({
        name: 'orderStatus',
        type: 'enum',
        enum: [
          'Draft',
          'Confirmed',
          'Processing',
          'Shipped',
          'Delivered',
          'Cancelled',
          'Completed',
        ],
        default: "'Draft'",
      }),
    );

    // Restore paymentStatus column
    await queryRunner.addColumn(
      'orders',
      new TableColumn({
        name: 'paymentStatus',
        type: 'enum',
        enum: ['Unpaid', 'Paid'],
        default: "'Unpaid'",
      }),
    );

    console.log(
      '⏪ Restored orderStatus and paymentStatus columns to orders table',
    );
  }
}
