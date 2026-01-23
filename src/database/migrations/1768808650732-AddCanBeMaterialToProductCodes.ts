import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCanBeMaterialToProductCodes1768808650732 implements MigrationInterface {
  name = 'AddCanBeMaterialToProductCodes1768808650732';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`product_codes\` ADD \`canBeMaterial\` tinyint NOT NULL DEFAULT 0 COMMENT 'Flag to determine if this finished good can be used as material'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`product_codes\` DROP COLUMN \`canBeMaterial\``,
    );
  }
}
