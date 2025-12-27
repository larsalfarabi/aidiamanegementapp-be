import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateStockOpnameTable1734400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'stock_opname_records',
        columns: [
          {
            name: 'id',
            type: 'bigint',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'sessionDate',
            type: 'date',
            comment: 'Session date (grouping for batch stock opname)',
          },
          {
            name: 'sessionId',
            type: 'varchar',
            length: '50',
            isNullable: true,
            comment:
              'Session identifier (optional, for multiple sessions per day)',
          },
          {
            name: 'productCodeId',
            type: 'int',
            comment: 'Foreign key to product_codes table',
          },
          {
            name: 'stokAkhir',
            type: 'decimal',
            precision: 10,
            scale: 2,
            comment: 'Stock akhir from system (reference from daily_inventory)',
          },
          {
            name: 'soFisik',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
            comment: 'Physical stock count (SO FISIK - manual entry)',
          },
          {
            name: 'selisih',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
            comment: 'Variance = SO FISIK - STCK AKHIR (auto-calculated)',
          },
          {
            name: 'keterangan',
            type: 'text',
            isNullable: true,
            comment: 'Remarks/notes for this stock opname entry',
          },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            default: "'DRAFT'",
            comment: 'Status: DRAFT (in-progress), COMPLETED (finalized)',
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'createdBy',
            type: 'int',
            comment: 'User who created this SO record',
          },
          {
            name: 'updatedBy',
            type: 'int',
            isNullable: true,
            comment: 'User who last updated this SO record',
          },
        ],
        foreignKeys: [
          {
            columnNames: ['productCodeId'],
            referencedTableName: 'product_codes',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['createdBy'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          },
          {
            columnNames: ['updatedBy'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          },
        ],
      }),
      true,
    );

    // Create indexes
    await queryRunner.createIndex(
      'stock_opname_records',
      new TableIndex({
        name: 'IDX_SO_SESSION_PRODUCT',
        columnNames: ['sessionDate', 'productCodeId'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'stock_opname_records',
      new TableIndex({
        name: 'IDX_SO_SESSION_USER',
        columnNames: ['sessionDate', 'createdBy'],
      }),
    );

    await queryRunner.createIndex(
      'stock_opname_records',
      new TableIndex({
        name: 'IDX_SO_PRODUCT',
        columnNames: ['productCodeId'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('stock_opname_records');
  }
}
