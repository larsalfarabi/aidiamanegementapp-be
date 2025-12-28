import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

async function generateFullMigration() {
  console.log('🔄 Initializing DataSource (WITHOUT DB connection)...');

  const entitiesPath = path.join(
    process.cwd(),
    'src',
    'modules',
    '**',
    '*.entity.ts',
  );

  // Create a temporary DataSource WITHOUT connecting to DB
  const tempDataSource = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT!, 10),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    entities: [entitiesPath],
    synchronize: false,
    logging: false,
  });

  try {
    // We still need to initialize to load metadata, but we won't query the DB
    await tempDataSource.initialize();
    console.log('✅ DataSource initialized (Metadata only).');

    const entityMetadatas = tempDataSource.entityMetadatas;
    console.log(`📊 Found ${entityMetadatas.length} entities.`);

    if (entityMetadatas.length === 0) {
      console.error('❌ No entities found!');
      await tempDataSource.destroy();
      return;
    }

    console.log('🔨 Generating CREATE TABLE statements manually...');

    // Use the schema builder to create queries, but with dropSchema first
    const driver = tempDataSource.driver;
    const schemaBuilder = driver.createSchemaBuilder();

    // Force create all tables by getting the "build" query
    // This generates all CREATE statements
    const upQueries = await schemaBuilder.log();

    // If the DB is empty or we force it, we get all queries
    // But to be SURE, let's use a different method: direct entity metadata parsing

    // Alternative: Build statements from entity metadata directly
    const createStatements: string[] = [];

    for (const metadata of entityMetadatas) {
      const tableName = metadata.tableName;
      const columns = metadata.columns
        .map((col) => {
          let colDef = `\`${col.databaseName}\` ${col.type}`;

          if (col.length) colDef += `(${col.length})`;
          if (col.isNullable === false) colDef += ' NOT NULL';
          if (col.isGenerated && col.generationStrategy === 'increment')
            colDef += ' AUTO_INCREMENT';
          if (col.default !== undefined) colDef += ` DEFAULT ${col.default}`;

          return colDef;
        })
        .join(',\\n    ');

      const primaryColumns = metadata.primaryColumns
        .map((c) => `\`${c.databaseName}\``)
        .join(', ');
      const primaryKey = primaryColumns
        ? `,\\n    PRIMARY KEY (${primaryColumns})`
        : '';

      createStatements.push(
        `CREATE TABLE \`${tableName}\` (\\n    ${columns}${primaryKey}\\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      );
    }

    console.log(
      `✅ Generated ${createStatements.length} CREATE TABLE statements.`,
    );

    if (createStatements.length === 0) {
      console.error('❌ Failed to generate any CREATE statements!');
      await tempDataSource.destroy();
      return;
    }

    // Format for migration file
    const upSqls = createStatements
      .map((sql) => `        await queryRunner.query(\`${sql}\`);`)
      .join('\\n');

    const timestamp = new Date().getTime();
    const migrationName = 'InitialSchema';
    const fileName = `${timestamp}-${migrationName}.ts`;
    const filePath = path.join(
      __dirname,
      '..',
      'database',
      'migrations',
      fileName,
    );

    const fileContent = `import { MigrationInterface, QueryRunner } from "typeorm";

export class ${migrationName}${timestamp} implements MigrationInterface {
    name = '${migrationName}${timestamp}'

    public async up(queryRunner: QueryRunner): Promise<void> {
${upSqls}
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop all tables in reverse order
${entityMetadatas
  .map(
    (m) =>
      `        await queryRunner.query(\`DROP TABLE IF EXISTS \\\`${m.tableName}\\\`\`);`,
  )
  .reverse()
  .join('\\n')}
    }
}
`;

    fs.writeFileSync(filePath, fileContent);
    console.log(`✅ Migration file created at: ${filePath}`);
    console.log(`📝 File contains ${createStatements.length} tables.`);
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    if (tempDataSource.isInitialized) {
      await tempDataSource.destroy();
    }
  }
}

generateFullMigration();
