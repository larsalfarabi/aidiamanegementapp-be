import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddBarangOutProduksiToSnapshots1734700000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add barangOutProduksi column to daily_inventory_snapshots
    // This mirrors the column already present in daily_inventory table
    await queryRunner.addColumn(
      'daily_inventory_snapshots',
      new TableColumn({
        name: 'barangOutProduksi',
        type: 'decimal',
        precision: 10,
        scale: 2,
        default: 0,
        comment: 'Material out for production (materials only)',
      }),
    );

    console.log(
      '✅ Added barangOutProduksi column to daily_inventory_snapshots',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove barangOutProduksi column
    await queryRunner.dropColumn(
      'daily_inventory_snapshots',
      'barangOutProduksi',
    );

    console.log(
      '✅ Removed barangOutProduksi column from daily_inventory_snapshots',
    );
  }
}
