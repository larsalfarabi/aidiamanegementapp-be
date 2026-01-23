import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddCanBeProducedToProducts1768808650733 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'products',
      new TableColumn({
        name: 'canBeProduced',
        type: 'boolean',
        default: false,
        isNullable: false,
        comment:
          'Flag to indicate if this product can be a production output (e.g. for Raw Materials)',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('products', 'canBeProduced');
  }
}
