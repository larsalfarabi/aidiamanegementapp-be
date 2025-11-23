import AppDataSource from '../../config/typeorm.config';

async function checkProductCodesId() {
  try {
    await AppDataSource.initialize();
    
    const result = await AppDataSource.query(
      'SHOW COLUMNS FROM users WHERE Field = "id"'
    );
    
    console.log('Product Codes ID Column Info:');
    console.log(JSON.stringify(result, null, 2));
    
    await AppDataSource.destroy();
  } catch (error) {
    console.error('Error:', error);
    await AppDataSource.destroy();
    process.exit(1);
  }
}

checkProductCodesId();
