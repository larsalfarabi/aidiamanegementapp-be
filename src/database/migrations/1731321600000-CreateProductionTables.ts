import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateProductionTables1731321600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create production_formulas table
    await queryRunner.createTable(
      new Table({
        name: 'production_formulas',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'formulaCode',
            type: 'varchar',
            length: '100',
            isUnique: true,
            comment: 'Unique formula code (e.g., FORMULA-JAMBU-250ML-v1.0)',
          },
          {
            name: 'formulaName',
            type: 'varchar',
            length: '200',
            comment: 'Formula name/description',
          },
          {
            name: 'version',
            type: 'varchar',
            length: '50',
            comment: 'Version number (e.g., 1.0, 1.1, 2.0)',
          },
          {
            name: 'productCodeId',
            type: 'int',
            comment: 'Finished product that this formula produces',
          },
          {
            name: 'batchSize',
            type: 'decimal',
            precision: 10,
            scale: 2,
            comment:
              'Standard batch size (quantity of finished goods per batch)',
          },
          {
            name: 'batchUnit',
            type: 'varchar',
            length: '20',
            comment:
              'Unit of measurement for batch size (BOTTLES, LITERS, etc.)',
          },
          {
            name: 'concentrateOutput',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
            comment: 'Expected concentrate output in liters (e.g., 500L)',
          },
          {
            name: 'expectedYield',
            type: 'decimal',
            precision: 5,
            scale: 2,
            default: 100,
            comment: 'Expected yield percentage (100% = no waste)',
          },
          {
            name: 'acceptableWaste',
            type: 'decimal',
            precision: 5,
            scale: 2,
            default: 0,
            comment:
              'Acceptable waste percentage (calculated: 100 - expectedYield)',
          },
          {
            name: 'productionTimeMinutes',
            type: 'int',
            isNullable: true,
            comment: 'Estimated production time in minutes',
          },
          {
            name: 'instructions',
            type: 'text',
            isNullable: true,
            comment: 'Production instructions/notes',
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
            comment: 'Is this formula currently active?',
          },
          {
            name: 'effectiveFrom',
            type: 'date',
            comment: 'Date when this formula becomes effective',
          },
          {
            name: 'effectiveTo',
            type: 'date',
            isNullable: true,
            comment: 'Date when this formula expires (null = no expiry)',
          },
          {
            name: 'createdBy',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'updatedBy',
            type: 'int',
            isNullable: true,
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
        ],
      }),
      true,
    );

    // Add indexes for production_formulas
    await queryRunner.createIndex(
      'production_formulas',
      new TableIndex({
        name: 'IDX_FORMULA_PRODUCT_VERSION',
        columnNames: ['productCodeId', 'version'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'production_formulas',
      new TableIndex({
        name: 'IDX_FORMULA_ACTIVE',
        columnNames: ['isActive'],
      }),
    );

    await queryRunner.createIndex(
      'production_formulas',
      new TableIndex({
        name: 'IDX_FORMULA_CODE',
        columnNames: ['formulaCode'],
      }),
    );

    // Add FK for production_formulas
    await queryRunner.createForeignKey(
      'production_formulas',
      new TableForeignKey({
        columnNames: ['productCodeId'],
        referencedTableName: 'product_codes',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
      }),
    );

    await queryRunner.createForeignKey(
      'production_formulas',
      new TableForeignKey({
        columnNames: ['createdBy'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    await queryRunner.createForeignKey(
      'production_formulas',
      new TableForeignKey({
        columnNames: ['updatedBy'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    // 2. Create formula_materials table
    await queryRunner.createTable(
      new Table({
        name: 'formula_materials',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'formulaId',
            type: 'int',
            comment: 'Foreign key to production_formulas',
          },
          {
            name: 'materialType',
            type: 'enum',
            enum: ['RAW_MATERIAL', 'CONCENTRATE', 'PACKAGING', 'ADDITIVE'],
            comment:
              'Type of material (RAW_MATERIAL, CONCENTRATE, PACKAGING, ADDITIVE)',
          },
          {
            name: 'materialProductCodeId',
            type: 'int',
            comment: 'Product code of the material (FK to product_codes)',
          },
          {
            name: 'quantityRequired',
            type: 'decimal',
            precision: 10,
            scale: 4,
            comment: 'Quantity required per batch',
          },
          {
            name: 'unit',
            type: 'varchar',
            length: '20',
            comment: 'Unit of measurement (KG, LITER, PCS, etc.)',
          },
          {
            name: 'standardUnitCost',
            type: 'decimal',
            precision: 15,
            scale: 2,
            isNullable: true,
            comment: 'Standard unit cost (Rp per KG/LITER/PCS) - optional',
          },
          {
            name: 'totalCost',
            type: 'decimal',
            precision: 15,
            scale: 2,
            isNullable: true,
            comment: 'Total cost for this material in one batch (calculated)',
          },
          {
            name: 'sequence',
            type: 'int',
            default: 1,
            comment: 'Sequence order in production process (1, 2, 3, ...)',
          },
          {
            name: 'notes',
            type: 'text',
            isNullable: true,
            comment: 'Notes about this material usage',
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
            comment: 'Is this material still active in formula?',
          },
          {
            name: 'createdBy',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'updatedBy',
            type: 'int',
            isNullable: true,
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
        ],
      }),
      true,
    );

    // Add indexes and FKs for formula_materials
    await queryRunner.createIndex(
      'formula_materials',
      new TableIndex({
        name: 'IDX_MATERIAL_FORMULA',
        columnNames: ['formulaId'],
      }),
    );

    await queryRunner.createIndex(
      'formula_materials',
      new TableIndex({
        name: 'IDX_MATERIAL_PRODUCT',
        columnNames: ['materialProductCodeId'],
      }),
    );

    await queryRunner.createIndex(
      'formula_materials',
      new TableIndex({
        name: 'IDX_MATERIAL_SEQUENCE',
        columnNames: ['sequence'],
      }),
    );

    await queryRunner.createForeignKey(
      'formula_materials',
      new TableForeignKey({
        columnNames: ['formulaId'],
        referencedTableName: 'production_formulas',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'formula_materials',
      new TableForeignKey({
        columnNames: ['materialProductCodeId'],
        referencedTableName: 'product_codes',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
      }),
    );

    // 3. Create production_batches table
    await queryRunner.createTable(
      new Table({
        name: 'production_batches',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'batchNumber',
            type: 'varchar',
            length: '50',
            isUnique: true,
            comment: 'Unique batch number (e.g., BATCH-20250111-001)',
          },
          {
            name: 'productionDate',
            type: 'date',
            comment: 'Production date (business date)',
          },
          {
            name: 'formulaId',
            type: 'int',
            comment: 'Formula used for this batch',
          },
          {
            name: 'productCodeId',
            type: 'int',
            comment: 'Finished product produced',
          },
          {
            name: 'plannedQuantity',
            type: 'decimal',
            precision: 10,
            scale: 2,
            comment:
              'Planned quantity to produce (based on formula batch size)',
          },
          {
            name: 'plannedConcentrate',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
            comment: 'Planned concentrate output in liters',
          },
          {
            name: 'actualConcentrate',
            type: 'decimal',
            precision: 10,
            scale: 2,
            default: 0,
            comment: 'Actual concentrate produced (in liters)',
          },
          {
            name: 'actualQuantity',
            type: 'decimal',
            precision: 10,
            scale: 2,
            default: 0,
            comment: 'Actual quantity produced (after bottling)',
          },
          {
            name: 'qcPassedQuantity',
            type: 'decimal',
            precision: 10,
            scale: 2,
            default: 0,
            comment: 'Quantity that passed QC',
          },
          {
            name: 'qcFailedQuantity',
            type: 'decimal',
            precision: 10,
            scale: 2,
            default: 0,
            comment: 'Quantity that failed QC',
          },
          {
            name: 'yieldPercentage',
            type: 'decimal',
            precision: 5,
            scale: 2,
            default: 0,
            comment:
              'Yield percentage = (actualQuantity / plannedQuantity) * 100',
          },
          {
            name: 'wasteQuantity',
            type: 'decimal',
            precision: 10,
            scale: 2,
            default: 0,
            comment: 'Total waste quantity (planned - actual)',
          },
          {
            name: 'wastePercentage',
            type: 'decimal',
            precision: 5,
            scale: 2,
            default: 0,
            comment:
              'Waste percentage = (wasteQuantity / plannedQuantity) * 100',
          },
          {
            name: 'qcStatus',
            type: 'enum',
            enum: ['PENDING', 'PASS', 'FAIL', 'PARTIAL'],
            default: "'PENDING'",
            comment: 'Quality Control status',
          },
          {
            name: 'qcDate',
            type: 'timestamp',
            isNullable: true,
            comment: 'When QC was performed',
          },
          {
            name: 'qcPerformedBy',
            type: 'int',
            isNullable: true,
            comment: 'User who performed QC',
          },
          {
            name: 'qcNotes',
            type: 'text',
            isNullable: true,
            comment: 'QC notes/feedback',
          },
          {
            name: 'totalMaterialCost',
            type: 'decimal',
            precision: 15,
            scale: 2,
            default: 0,
            comment: 'Total material cost for this batch',
          },
          {
            name: 'costPerUnit',
            type: 'decimal',
            precision: 15,
            scale: 2,
            default: 0,
            comment: 'Cost per unit (totalMaterialCost / qcPassedQuantity)',
          },
          {
            name: 'status',
            type: 'enum',
            enum: [
              'PLANNED',
              'IN_PROGRESS',
              'QC_PENDING',
              'COMPLETED',
              'CANCELLED',
              'REJECTED',
            ],
            default: "'PLANNED'",
            comment: 'Current batch status',
          },
          {
            name: 'startedAt',
            type: 'timestamp',
            isNullable: true,
            comment: 'When production started',
          },
          {
            name: 'completedAt',
            type: 'timestamp',
            isNullable: true,
            comment: 'When production completed',
          },
          {
            name: 'notes',
            type: 'text',
            isNullable: true,
            comment: 'Production notes',
          },
          {
            name: 'performedBy',
            type: 'varchar',
            length: '200',
            isNullable: true,
            comment: 'Person who performed the production (staff name)',
          },
          {
            name: 'inventoryTransactionId',
            type: 'int',
            isNullable: true,
            comment: 'Link to inventory_transactions (PRODUCTION_IN)',
          },
          {
            name: 'createdBy',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'updatedBy',
            type: 'int',
            isNullable: true,
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
        ],
      }),
      true,
    );

    // Add indexes for production_batches
    await queryRunner.createIndex(
      'production_batches',
      new TableIndex({
        name: 'IDX_BATCH_NUMBER',
        columnNames: ['batchNumber'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'production_batches',
      new TableIndex({
        name: 'IDX_BATCH_DATE',
        columnNames: ['productionDate'],
      }),
    );

    await queryRunner.createIndex(
      'production_batches',
      new TableIndex({
        name: 'IDX_BATCH_STATUS',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createIndex(
      'production_batches',
      new TableIndex({
        name: 'IDX_BATCH_FORMULA',
        columnNames: ['formulaId'],
      }),
    );

    await queryRunner.createIndex(
      'production_batches',
      new TableIndex({
        name: 'IDX_BATCH_PRODUCT',
        columnNames: ['productCodeId'],
      }),
    );

    // Add FKs for production_batches
    await queryRunner.createForeignKey(
      'production_batches',
      new TableForeignKey({
        columnNames: ['formulaId'],
        referencedTableName: 'production_formulas',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
      }),
    );

    await queryRunner.createForeignKey(
      'production_batches',
      new TableForeignKey({
        columnNames: ['productCodeId'],
        referencedTableName: 'product_codes',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
      }),
    );

    await queryRunner.createForeignKey(
      'production_batches',
      new TableForeignKey({
        columnNames: ['qcPerformedBy'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    // 4. Create production_material_usage table
    await queryRunner.createTable(
      new Table({
        name: 'production_material_usage',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'batchId',
            type: 'int',
            comment: 'Production batch that used this material',
          },
          {
            name: 'materialType',
            type: 'enum',
            enum: ['RAW_MATERIAL', 'CONCENTRATE', 'PACKAGING', 'ADDITIVE'],
            comment: 'Type of material used',
          },
          {
            name: 'materialProductCodeId',
            type: 'int',
            comment: 'Material product code used',
          },
          {
            name: 'plannedQuantity',
            type: 'decimal',
            precision: 10,
            scale: 4,
            comment: 'Planned quantity (from formula)',
          },
          {
            name: 'actualQuantity',
            type: 'decimal',
            precision: 10,
            scale: 4,
            comment: 'Actual quantity used',
          },
          {
            name: 'wasteQuantity',
            type: 'decimal',
            precision: 10,
            scale: 4,
            default: 0,
            comment: 'Waste quantity (planned - actual)',
          },
          {
            name: 'unit',
            type: 'varchar',
            length: '20',
            comment: 'Unit of measurement (KG, LITER, PCS)',
          },
          {
            name: 'unitCost',
            type: 'decimal',
            precision: 15,
            scale: 2,
            comment: 'Unit cost (Rp per KG/LITER/PCS)',
          },
          {
            name: 'totalCost',
            type: 'decimal',
            precision: 15,
            scale: 2,
            comment: 'Total cost (actualQuantity * unitCost)',
          },
          {
            name: 'notes',
            type: 'text',
            isNullable: true,
            comment: 'Notes about material usage',
          },
          {
            name: 'createdBy',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'updatedBy',
            type: 'int',
            isNullable: true,
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
        ],
      }),
      true,
    );

    // Add indexes for production_material_usage
    await queryRunner.createIndex(
      'production_material_usage',
      new TableIndex({
        name: 'IDX_USAGE_BATCH',
        columnNames: ['batchId'],
      }),
    );

    await queryRunner.createIndex(
      'production_material_usage',
      new TableIndex({
        name: 'IDX_USAGE_MATERIAL',
        columnNames: ['materialProductCodeId'],
      }),
    );

    await queryRunner.createForeignKey(
      'production_material_usage',
      new TableForeignKey({
        columnNames: ['batchId'],
        referencedTableName: 'production_batches',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'production_material_usage',
      new TableForeignKey({
        columnNames: ['materialProductCodeId'],
        referencedTableName: 'product_codes',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
      }),
    );

    // 5. Create production_stage_tracking table
    await queryRunner.createTable(
      new Table({
        name: 'production_stage_tracking',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'batchId',
            type: 'int',
            comment: 'Production batch being tracked',
          },
          {
            name: 'stage',
            type: 'enum',
            enum: ['PRODUCTION', 'BOTTLING', 'QC'],
            comment: 'Production stage (PRODUCTION, BOTTLING, QC)',
          },
          {
            name: 'stageSequence',
            type: 'int',
            comment: 'Stage sequence (1, 2, 3)',
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'],
            default: "'PENDING'",
            comment: 'Current status of this stage',
          },
          {
            name: 'startTime',
            type: 'timestamp',
            isNullable: true,
            comment: 'When stage started',
          },
          {
            name: 'endTime',
            type: 'timestamp',
            isNullable: true,
            comment: 'When stage completed',
          },
          {
            name: 'outputQuantity',
            type: 'decimal',
            precision: 10,
            scale: 2,
            default: 0,
            comment: 'Output quantity from this stage',
          },
          {
            name: 'outputUnit',
            type: 'varchar',
            length: '20',
            isNullable: true,
            comment:
              'Output unit (LITERS for PRODUCTION, BOTTLES for BOTTLING)',
          },
          {
            name: 'wasteQuantity',
            type: 'decimal',
            precision: 10,
            scale: 2,
            default: 0,
            comment: 'Waste quantity at this stage',
          },
          {
            name: 'wasteUnit',
            type: 'varchar',
            length: '20',
            isNullable: true,
            comment: 'Waste unit',
          },
          {
            name: 'qcPassedQty',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
            comment: 'Quantity that passed QC (QC stage only)',
          },
          {
            name: 'qcFailedQty',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
            comment: 'Quantity that failed QC (QC stage only)',
          },
          {
            name: 'performedBy',
            type: 'varchar',
            length: '200',
            isNullable: true,
            comment: 'Staff/person who performed this stage',
          },
          {
            name: 'notes',
            type: 'text',
            isNullable: true,
            comment: 'Notes about this stage execution',
          },
          {
            name: 'createdBy',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'updatedBy',
            type: 'int',
            isNullable: true,
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
        ],
      }),
      true,
    );

    // Add indexes for production_stage_tracking
    await queryRunner.createIndex(
      'production_stage_tracking',
      new TableIndex({
        name: 'IDX_STAGE_BATCH',
        columnNames: ['batchId'],
      }),
    );

    await queryRunner.createIndex(
      'production_stage_tracking',
      new TableIndex({
        name: 'IDX_STAGE_NAME',
        columnNames: ['stage'],
      }),
    );

    await queryRunner.createIndex(
      'production_stage_tracking',
      new TableIndex({
        name: 'IDX_STAGE_STATUS',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createForeignKey(
      'production_stage_tracking',
      new TableForeignKey({
        columnNames: ['batchId'],
        referencedTableName: 'production_batches',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse order
    await queryRunner.dropTable('production_stage_tracking', true);
    await queryRunner.dropTable('production_material_usage', true);
    await queryRunner.dropTable('production_batches', true);
    await queryRunner.dropTable('formula_materials', true);
    await queryRunner.dropTable('production_formulas', true);
  }
}
