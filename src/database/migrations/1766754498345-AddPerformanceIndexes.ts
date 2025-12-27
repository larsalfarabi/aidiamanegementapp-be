import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPerformanceIndexes1766754498345 implements MigrationInterface {
    name = 'AddPerformanceIndexes1766754498345'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Orders Indexes
        await queryRunner.query(`CREATE INDEX \`IDX_ORDERS_CUSTOMER_ID\` ON \`orders\` (\`customerId\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_ORDERS_ORDER_DATE\` ON \`orders\` (\`orderDate\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_ORDERS_IS_DELETED\` ON \`orders\` (\`isDeleted\`)`);

        // Inventory Transactions Composite Index
        await queryRunner.query(`CREATE INDEX \`IDX_INV_TRANS_PROD_DATE\` ON \`inventory_transactions\` (\`productCodeId\`, \`businessDate\`)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX \`IDX_INV_TRANS_PROD_DATE\` ON \`inventory_transactions\``);
        await queryRunner.query(`DROP INDEX \`IDX_ORDERS_IS_DELETED\` ON \`orders\``);
        await queryRunner.query(`DROP INDEX \`IDX_ORDERS_ORDER_DATE\` ON \`orders\``);
        await queryRunner.query(`DROP INDEX \`IDX_ORDERS_CUSTOMER_ID\` ON \`orders\``);
    }

}
