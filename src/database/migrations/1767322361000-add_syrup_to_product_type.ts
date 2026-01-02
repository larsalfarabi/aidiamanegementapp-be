import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSyrupToProductType1767322361000 implements MigrationInterface {
  name = 'AddSyrupToProductType1767322361000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ensure no NULL values exist before modifying column to NOT NULL
    await queryRunner.query(
      `UPDATE \`products\` SET \`productType\` = 'RTD' WHERE \`productType\` IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`products\` MODIFY COLUMN \`productType\` enum('RTD', 'CONC', 'SYRUP') NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert to original enum values
    // WARNING: This will fail if there are records with 'SYRUP'
    await queryRunner.query(
      `ALTER TABLE \`products\` MODIFY COLUMN \`productType\` enum('RTD', 'CONC') NOT NULL`,
    );
  }
}
