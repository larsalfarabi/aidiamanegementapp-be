import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

const dropTables = async () => {
  const dataSource = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'DB_Sales_Aidia',
  });

  try {
    await dataSource.initialize();
    console.log('Connected to database');

    // Drop tables in correct order (child first)
    await dataSource.query('DROP TABLE IF EXISTS notification_reads');
    console.log('Dropped notification_reads table');

    await dataSource.query('DROP TABLE IF EXISTS notifications');
    console.log('Dropped notifications table');

    await dataSource.destroy();
    console.log('Done');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

dropTables();
