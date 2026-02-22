import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductPackagingMaterial1770605076140 implements MigrationInterface {
  name = 'ProductPackagingMaterial1770605076140';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create Table
    await queryRunner.query(`
            CREATE TABLE \`product_packaging_materials\` (
                \`id\` int NOT NULL AUTO_INCREMENT,
                \`createdAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`updatedAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                \`productCodeId\` int NOT NULL COMMENT 'Finished Good SKU that requires this packaging',
                \`materialProductCodeId\` int NOT NULL COMMENT 'Packaging Material SKU',
                \`quantity\` decimal(10,4) NOT NULL DEFAULT '1.0000' COMMENT 'Quantity of packaging used per 1 unit of finished good',
                \`isActive\` tinyint NOT NULL DEFAULT 1 COMMENT 'Is this packaging rule active?',
                \`createdBy\` int NULL,
                \`updatedBy\` int NULL,
                INDEX \`IDX_ppm_productCodeId\` (\`productCodeId\`),
                INDEX \`IDX_ppm_materialProductCodeId\` (\`materialProductCodeId\`),
                INDEX \`IDX_ppm_isActive\` (\`isActive\`),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB
        `);

    // Add Foreign Keys
    await queryRunner.query(`
            ALTER TABLE \`product_packaging_materials\` 
            ADD CONSTRAINT \`FK_ppm_productCodeId\` 
            FOREIGN KEY (\`productCodeId\`) REFERENCES \`product_codes\`(\`id\`) 
            ON DELETE NO ACTION ON UPDATE NO ACTION
        `);

    await queryRunner.query(`
            ALTER TABLE \`product_packaging_materials\` 
            ADD CONSTRAINT \`FK_ppm_materialProductCodeId\` 
            FOREIGN KEY (\`materialProductCodeId\`) REFERENCES \`product_codes\`(\`id\`) 
            ON DELETE NO ACTION ON UPDATE NO ACTION
        `);

    await queryRunner.query(`
            ALTER TABLE \`product_packaging_materials\` 
            ADD CONSTRAINT \`FK_ppm_createdBy\` 
            FOREIGN KEY (\`createdBy\`) REFERENCES \`users\`(\`id\`) 
            ON DELETE NO ACTION ON UPDATE NO ACTION
        `);

    await queryRunner.query(`
            ALTER TABLE \`product_packaging_materials\` 
            ADD CONSTRAINT \`FK_ppm_updatedBy\` 
            FOREIGN KEY (\`updatedBy\`) REFERENCES \`users\`(\`id\`) 
            ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop Foreign Keys
    await queryRunner.query(
      `ALTER TABLE \`product_packaging_materials\` DROP FOREIGN KEY \`FK_ppm_updatedBy\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_packaging_materials\` DROP FOREIGN KEY \`FK_ppm_createdBy\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_packaging_materials\` DROP FOREIGN KEY \`FK_ppm_materialProductCodeId\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_packaging_materials\` DROP FOREIGN KEY \`FK_ppm_productCodeId\``,
    );

    // Drop Table
    await queryRunner.query(`DROP TABLE \`product_packaging_materials\``);
  }
}
