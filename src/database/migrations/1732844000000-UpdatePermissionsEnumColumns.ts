import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdatePermissionsEnumColumns1732844000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Update resource enum to include new values
    await queryRunner.query(`
      ALTER TABLE permissions 
      MODIFY COLUMN resource ENUM(
        'user', 'role', 'permission', 
        'customer', 'order', 'product', 
        'inventory', 'formula', 'batch', 
        'report', 'setting'
      ) NOT NULL
    `);

    // Update action enum to include new values
    await queryRunner.query(`
      ALTER TABLE permissions 
      MODIFY COLUMN action ENUM(
        'view', 'create', 'update', 'delete', 
        'manage', 'assign', 'export', 'import',
        'start', 'cancel', 'approve', 'adjust',
        'transfer', 'repack'
      ) NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert to original enums (only user, role, permission resources)
    await queryRunner.query(`
      ALTER TABLE permissions 
      MODIFY COLUMN resource ENUM('user', 'role', 'permission') NOT NULL
    `);

    // Revert to original actions
    await queryRunner.query(`
      ALTER TABLE permissions 
      MODIFY COLUMN action ENUM(
        'view', 'create', 'update', 'delete', 
        'manage', 'assign', 'export'
      ) NOT NULL
    `);
  }
}
