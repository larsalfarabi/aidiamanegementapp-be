import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';

// Load environment variables
dotenv.config();

/**
 * TypeORM DataSource configuration for CLI (migrations, seeds, etc.)
 *
 * This file is separate from database.config.ts because TypeORM CLI
 * requires a DataSource instance, not TypeOrmModuleOptions.
 */
const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT!, 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,

  // Entity paths for TypeORM to discover
  entities: ['src/**/*.entity{.ts,.js}'],

  // Migration configuration
  migrations: ['src/database/migrations/**/*{.ts,.js}'],
  migrationsTableName: 'migrations',

  // Disable synchronize in production
  synchronize: false,

  // Enable logging for debugging
  logging: false,

  // Character set for MySQL
  charset: 'utf8mb4',

  // Timezone configuration
  timezone: '+07:00', // WIB (Asia/Jakarta)
});

// Export as default (required for TypeORM CLI)
export default AppDataSource;
