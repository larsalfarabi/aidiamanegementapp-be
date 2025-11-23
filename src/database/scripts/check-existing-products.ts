import AppDataSource from '../../config/typeorm.config';

async function checkExistingProducts() {
  try {
    await AppDataSource.initialize();
    console.log('🔍 Checking existing products...\n');

    // Check Products
    const products = await AppDataSource.query(`
      SELECT p.id, p.name, p.productType, c.name as categoryName
      FROM products p
      LEFT JOIN product_categories c ON p.categoryId = c.id
      WHERE p.name LIKE '%ORANGE%' 
         OR p.name LIKE '%LEMON%'
         OR p.name LIKE '%VALENCIA%'
         OR p.name LIKE '%PUREE%'
         OR p.name LIKE '%FRUCTOSE%'
         OR p.name LIKE '%CITRIC%'
         OR p.name LIKE '%BOTOL%'
      ORDER BY p.name
      LIMIT 50
    `);

    console.log('📦 PRODUCTS:');
    console.log(JSON.stringify(products, null, 2));
    console.log(`\nTotal: ${products.length} products\n`);

    // Check Product Codes
    const productCodes = await AppDataSource.query(`
      SELECT pc.id, pc.productCode, p.name as productName, c.name as category, s.sizeValue
      FROM product_codes pc
      LEFT JOIN products p ON pc.productId = p.id
      LEFT JOIN product_categories c ON pc.categoryId = c.id
      LEFT JOIN product_sizes s ON pc.sizeId = s.id
      WHERE p.name LIKE '%ORANGE%' 
         OR p.name LIKE '%LEMON%'
         OR p.name LIKE '%VALENCIA%'
         OR p.name LIKE '%PUREE%'
         OR p.name LIKE '%FRUCTOSE%'
         OR p.name LIKE '%CITRIC%'
         OR p.name LIKE '%BOTOL%'
      ORDER BY p.name, s.sizeValue
      LIMIT 100
    `);

    console.log('🔖 PRODUCT CODES:');
    console.log(JSON.stringify(productCodes, null, 2));
    console.log(`\nTotal: ${productCodes.length} product codes\n`);

    // Check Categories
    const categories = await AppDataSource.query(`
      SELECT id, name, description, categoryType, level
      FROM product_categories
      WHERE name IN ('Barang Jadi', 'Barang Baku', 'Barang Kemasan', 'Barang Pembantu', 
                     'Buffet', 'Premium', 'Freshly')
      ORDER BY level, name
    `);

    console.log('📂 CATEGORIES:');
    console.log(JSON.stringify(categories, null, 2));
    console.log(`\nTotal: ${categories.length} categories\n`);

    // Check Product Sizes
    const sizes = await AppDataSource.query(`
      SELECT id, sizeValue, unitOfMeasure, categoryType
      FROM product_sizes
      WHERE sizeValue IN ('250 ML', '600 ML', '1 LITER', '5 LITER', 'KG', 'ML')
      ORDER BY sizeValue
    `);

    console.log('📏 PRODUCT SIZES:');
    console.log(JSON.stringify(sizes, null, 2));
    console.log(`\nTotal: ${sizes.length} sizes\n`);

    await AppDataSource.destroy();
    console.log('✅ Check completed!');
  } catch (error) {
    console.error('❌ Error:', error);
    await AppDataSource.destroy();
    process.exit(1);
  }
}

checkExistingProducts();
