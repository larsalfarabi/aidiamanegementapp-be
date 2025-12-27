import AppDataSource from '../../config/typeorm.config';

async function seedProductionData() {
  try {
    await AppDataSource.initialize();
    console.log('🚀 Starting Production Data Seeder...\n');

    // Get admin user
    const [adminUser] = await AppDataSource.query(
      `SELECT id FROM users WHERE email = 'msyamil404@gmail.com' LIMIT 1`,
    );
    if (!adminUser) {
      throw new Error('❌ Admin user not found. Please run user seeder first.');
    }
    const adminId = adminUser.id;
    console.log(`✅ Admin user found: ID ${adminId}\n`);

    // Get categories
    const [barangJadi] = await AppDataSource.query(
      `SELECT id FROM product_categories WHERE name = 'Barang Jadi'`,
    );
    const [barangBaku] = await AppDataSource.query(
      `SELECT id FROM product_categories WHERE name = 'Barang Baku'`,
    );
    const [barangKemasan] = await AppDataSource.query(
      `SELECT id FROM product_categories WHERE name = 'Barang Kemasan'`,
    );
    const [barangPembantu] = await AppDataSource.query(
      `SELECT id FROM product_categories WHERE name = 'Barang Pembantu'`,
    );
    const [buffet] = await AppDataSource.query(
      `SELECT id FROM product_categories WHERE name = 'Buffet'`,
    );
    const [premium] = await AppDataSource.query(
      `SELECT id FROM product_categories WHERE name = 'Premium'`,
    );

    // Get sizes
    const [size250ML] = await AppDataSource.query(
      `SELECT id FROM product_sizes WHERE sizeValue = '250 ML'`,
    );
    const [sizeKG] = await AppDataSource.query(
      `SELECT id FROM product_sizes WHERE sizeValue = 'KG'`,
    );
    const [sizeML] = await AppDataSource.query(
      `SELECT id FROM product_sizes WHERE sizeValue = 'ML'`,
    );
    const [sizeBTL] = await AppDataSource.query(
      `SELECT id FROM product_sizes WHERE sizeValue = 'BTL'`,
    );

    console.log('📦 Step 1: Creating Missing Products...\n');

    // ============================================================
    // CREATE RAW MATERIALS (Bahan Baku)
    // ============================================================
    const rawMaterialsData = [
      { name: 'ORANGE FRESH LOKAL', code: 'BBOF01' },
      { name: 'VALENCIA ORANGE', code: 'BBVO01' },
      { name: 'PUREE (SPECIAL)', code: 'BBPS01' },
      { name: 'LEMON FRESH', code: 'BBLF01' },
      { name: 'LEMON PREMIUM', code: 'BBLP01' },
      { name: 'ORANGE JUICE BUFFET RTD @ 5 LTR', code: 'BBOJ5L' },
    ];

    const rawMaterials: { [key: string]: number } = {};
    for (const material of rawMaterialsData) {
      // Check if product exists
      let [product] = await AppDataSource.query(
        `SELECT id FROM products WHERE name = ?`,
        [material.name],
      );

      if (!product) {
        await AppDataSource.query(
          `INSERT INTO products (name, categoryId, isActive, createdBy, updatedBy, createdAt, updatedAt) 
           VALUES (?, ?, 1, ?, ?, NOW(), NOW())`,
          [material.name, barangBaku.id, adminId, adminId],
        );
        [product] = await AppDataSource.query(
          `SELECT id FROM products WHERE name = ?`,
          [material.name],
        );
        console.log(`  ✅ Product "${material.name}" created`);
      }

      // Check if product code exists
      let [productCode] = await AppDataSource.query(
        `SELECT id FROM product_codes WHERE productCode = ?`,
        [material.code],
      );

      if (!productCode) {
        await AppDataSource.query(
          `INSERT INTO product_codes (productCode, productId, categoryId, sizeId, isActive, createdBy, updatedBy, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, 1, ?, ?, NOW(), NOW())`,
          [
            material.code,
            product.id,
            barangBaku.id,
            sizeKG.id,
            adminId,
            adminId,
          ],
        );
        [productCode] = await AppDataSource.query(
          `SELECT id FROM product_codes WHERE productCode = ?`,
          [material.code],
        );
        console.log(`  ✅ ProductCode "${material.code}" created`);
      }

      rawMaterials[material.name] = productCode.id;
    }

    // ============================================================
    // CREATE ADDITIVES (Bahan Pembantu)
    // ============================================================
    const additivesData = [
      { name: 'ORANGE FLOVER', code: 'BPOF01', sizeId: sizeKG.id },
      { name: 'LEMON FLOVER', code: 'BPLF01', sizeId: sizeKG.id },
      { name: 'FRUCTOSE', code: 'BPFR01', sizeId: sizeKG.id },
      { name: 'SUCRALOSE KENBO', code: 'BPSK01', sizeId: sizeKG.id },
      { name: 'SORBAT', code: 'BPSB01', sizeId: sizeKG.id },
      { name: 'SALT', code: 'BPSL01', sizeId: sizeKG.id },
      { name: 'CITRIC ACID', code: 'BPCA01', sizeId: sizeKG.id },
      { name: 'MALIC ACID', code: 'BPMA01', sizeId: sizeKG.id },
      { name: 'CMC', code: 'BPCM01', sizeId: sizeKG.id },
      { name: 'XANTHAN GUM (KATROL)', code: 'BPXG01', sizeId: sizeKG.id },
      { name: 'CLOUDY FIER', code: 'BPCF01', sizeId: sizeKG.id },
      { name: 'TATRAZIN (PEWARNA KUNING)', code: 'BPTK01', sizeId: sizeKG.id },
      { name: 'SUNSET YELLOW', code: 'BPSY01', sizeId: sizeKG.id },
      { name: 'AIR', code: 'BPAIR01', sizeId: sizeML.id }, // AIR uses ML
    ];

    const additives: { [key: string]: number } = {};
    for (const additive of additivesData) {
      let [product] = await AppDataSource.query(
        `SELECT id FROM products WHERE name = ?`,
        [additive.name],
      );

      if (!product) {
        await AppDataSource.query(
          `INSERT INTO products (name, categoryId, isActive, createdBy, updatedBy, createdAt, updatedAt)
           VALUES (?, ?, 1, ?, ?, NOW(), NOW())`,
          [additive.name, barangPembantu.id, adminId, adminId],
        );
        [product] = await AppDataSource.query(
          `SELECT id FROM products WHERE name = ?`,
          [additive.name],
        );
        console.log(`  ✅ Product "${additive.name}" created`);
      }

      let [productCode] = await AppDataSource.query(
        `SELECT id FROM product_codes WHERE productCode = ?`,
        [additive.code],
      );

      if (!productCode) {
        await AppDataSource.query(
          `INSERT INTO product_codes (productCode, productId, categoryId, sizeId, isActive, createdBy, updatedBy, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, 1, ?, ?, NOW(), NOW())`,
          [
            additive.code,
            product.id,
            barangPembantu.id,
            additive.sizeId,
            adminId,
            adminId,
          ],
        );
        [productCode] = await AppDataSource.query(
          `SELECT id FROM product_codes WHERE productCode = ?`,
          [additive.code],
        );
        console.log(`  ✅ ProductCode "${additive.code}" created`);
      }

      additives[additive.name] = productCode.id;
    }

    // ============================================================
    // CREATE PACKAGING (Botol)
    // ============================================================
    const packagingData = [
      { name: 'BOTOL 600 ML', code: 'BKBT600' },
      { name: 'BOTOL 1 LITER', code: 'BKBT1L' },
      { name: 'BOTOL 5 LITER', code: 'BKBT5L' },
    ];

    const packaging: { [key: string]: number } = {};
    for (const pkg of packagingData) {
      let [product] = await AppDataSource.query(
        `SELECT id FROM products WHERE name = ?`,
        [pkg.name],
      );

      if (!product) {
        await AppDataSource.query(
          `INSERT INTO products (name, categoryId, isActive, createdBy, updatedBy, createdAt, updatedAt)
           VALUES (?, ?, 1, ?, ?, NOW(), NOW())`,
          [pkg.name, barangKemasan.id, adminId, adminId],
        );
        [product] = await AppDataSource.query(
          `SELECT id FROM products WHERE name = ?`,
          [pkg.name],
        );
        console.log(`  ✅ Packaging "${pkg.name}" created`);
      }

      let [productCode] = await AppDataSource.query(
        `SELECT id FROM product_codes WHERE productCode = ?`,
        [pkg.code],
      );

      if (!productCode) {
        await AppDataSource.query(
          `INSERT INTO product_codes (productCode, productId, categoryId, sizeId, isActive, createdBy, updatedBy, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, 1, ?, ?, NOW(), NOW())`,
          [
            pkg.code,
            product.id,
            barangKemasan.id,
            sizeBTL.id,
            adminId,
            adminId,
          ],
        );
        [productCode] = await AppDataSource.query(
          `SELECT id FROM product_codes WHERE productCode = ?`,
          [pkg.code],
        );
        console.log(`  ✅ ProductCode "${pkg.code}" created`);
      }

      packaging[pkg.name] = productCode.id;
    }

    // Get existing BOTOL 250 ML
    const [botol250] = await AppDataSource.query(
      `SELECT id FROM product_codes WHERE productCode = 'BKBT250'`,
    );
    if (botol250) {
      packaging['BOTOL 250 ML'] = botol250.id;
    }

    // ============================================================
    // CREATE FINISHED PRODUCTS (Barang Jadi)
    // ============================================================
    const finishedProductsData = [
      { name: 'ORANGE BUFFET', categoryId: buffet.id },
      { name: 'ORANGE PREMIUM', categoryId: premium.id },
      { name: 'LEMON PREMIUM', categoryId: premium.id },
      { name: 'LEMON BUFFET', categoryId: buffet.id },
    ];

    const finishedProducts: { [key: string]: number } = {};
    for (const fp of finishedProductsData) {
      let [product] = await AppDataSource.query(
        `SELECT id FROM products WHERE name = ?`,
        [fp.name],
      );

      if (!product) {
        await AppDataSource.query(
          `INSERT INTO products (name, productType, categoryId, isActive, createdBy, updatedBy, createdAt, updatedAt)
           VALUES (?, 'RTD', ?, 1, ?, ?, NOW(), NOW())`,
          [fp.name, fp.categoryId, adminId, adminId],
        );
        [product] = await AppDataSource.query(
          `SELECT id FROM products WHERE name = ?`,
          [fp.name],
        );
        console.log(`  ✅ Finished Product "${fp.name}" created`);
      }

      finishedProducts[fp.name] = product.id;
    }

    console.log(
      '\n📋 Step 2: Creating Production Formula - ORANGE BUFFET 150L...\n',
    );

    // ============================================================
    // FORMULA 1: ORANGE BUFFET (150L)
    // ============================================================
    // Create ProductCode for this formula
    let [orangeBuffetPC] = await AppDataSource.query(
      `SELECT id FROM product_codes WHERE productCode = 'BJ3MG1R'`,
    );

    if (!orangeBuffetPC) {
      await AppDataSource.query(
        `INSERT INTO product_codes (productCode, productId, categoryId, sizeId, isActive, createdBy, updatedBy, createdAt, updatedAt)
         VALUES ('BJ3MG1R', ?, ?, ?, 1, ?, ?, NOW(), NOW())`,
        [
          finishedProducts['ORANGE BUFFET'],
          buffet.id,
          size250ML.id,
          adminId,
          adminId,
        ],
      );
      [orangeBuffetPC] = await AppDataSource.query(
        `SELECT id FROM product_codes WHERE productCode = 'BJ3MG1R'`,
      );
      console.log(`  ✅ ProductCode "BJ3MG1R" (ORANGE BUFFET 250ML) created`);
    }

    // Check if formula exists
    let [orangeBuffetFormula] = await AppDataSource.query(
      `SELECT id FROM production_formulas WHERE formulaName = 'ORANGE BUFFET - 150L'`,
    );

    if (!orangeBuffetFormula) {
      await AppDataSource.query(
        `INSERT INTO production_formulas 
        (formulaCode, formulaName, version, productCodeId, batchSize, batchUnit, expectedYield, effectiveFrom, instructions, isActive, createdBy, updatedBy, createdAt, updatedAt)
         VALUES ('F-OB-150L-001', 'ORANGE BUFFET - 150L', 1, ?, 150, 'liter', 95, '2024-12-18', 'Formula ORANGE BUFFET untuk produksi 150 liter', 1, ?, ?, NOW(), NOW())`,
        [orangeBuffetPC.id, adminId, adminId],
      );

      [orangeBuffetFormula] = await AppDataSource.query(
        `SELECT id FROM production_formulas WHERE formulaName = 'ORANGE BUFFET - 150L'`,
      );

      console.log(
        `  ✅ Formula "ORANGE BUFFET - 150L" created (ID: ${orangeBuffetFormula.id})`,
      );

      // Add materials
      const materials = [
        [
          orangeBuffetFormula.id,
          'RAW_MATERIAL',
          rawMaterials['ORANGE FRESH LOKAL'],
          10.5,
          0.07,
          'kg',
          1,
          'BUAH',
        ],
        [
          orangeBuffetFormula.id,
          'RAW_MATERIAL',
          rawMaterials['VALENCIA ORANGE'],
          1.2,
          0.008,
          'kg',
          2,
          'BUAH',
        ],
        [
          orangeBuffetFormula.id,
          'RAW_MATERIAL',
          rawMaterials['PUREE (SPECIAL)'],
          4.5,
          0.03,
          'kg',
          3,
          null,
        ],
        [
          orangeBuffetFormula.id,
          'RAW_MATERIAL',
          rawMaterials['LEMON FRESH'],
          2.0,
          0.013,
          'kg',
          4,
          'BUAH',
        ],
        [
          orangeBuffetFormula.id,
          'ADDITIVE',
          additives['ORANGE FLOVER'],
          0.07,
          0.0,
          'ml',
          5,
          null,
        ],
        [
          orangeBuffetFormula.id,
          'ADDITIVE',
          additives['FRUCTOSE'],
          12.0,
          0.08,
          'kg',
          6,
          null,
        ],
        [
          orangeBuffetFormula.id,
          'ADDITIVE',
          additives['SUCRALOSE KENBO'],
          0.01,
          0.0,
          'kg',
          7,
          null,
        ],
        [
          orangeBuffetFormula.id,
          'ADDITIVE',
          additives['SORBAT'],
          0.05,
          0.0,
          'kg',
          8,
          null,
        ],
        [
          orangeBuffetFormula.id,
          'ADDITIVE',
          additives['SALT'],
          0.06,
          0.0,
          'kg',
          9,
          null,
        ],
        [
          orangeBuffetFormula.id,
          'ADDITIVE',
          additives['CITRIC ACID'],
          0.6,
          0.004,
          'kg',
          10,
          null,
        ],
        [
          orangeBuffetFormula.id,
          'ADDITIVE',
          additives['MALIC ACID'],
          0.095,
          0.001,
          'kg',
          11,
          null,
        ],
        [
          orangeBuffetFormula.id,
          'ADDITIVE',
          additives['CMC'],
          0.08,
          0.001,
          'kg',
          12,
          null,
        ],
        [
          orangeBuffetFormula.id,
          'ADDITIVE',
          additives['XANTHAN GUM (KATROL)'],
          0.085,
          0.001,
          'kg',
          13,
          null,
        ],
        [
          orangeBuffetFormula.id,
          'ADDITIVE',
          additives['CLOUDY FIER'],
          0.9,
          0.006,
          'kg',
          14,
          null,
        ],
        [
          orangeBuffetFormula.id,
          'ADDITIVE',
          additives['TATRAZIN (PEWARNA KUNING)'],
          0.025,
          0.0,
          'kg',
          15,
          null,
        ],
        [
          orangeBuffetFormula.id,
          'ADDITIVE',
          additives['SUNSET YELLOW'],
          0.006,
          0.0,
          'kg',
          16,
          null,
        ],
        [
          orangeBuffetFormula.id,
          'ADDITIVE',
          additives['AIR'],
          114.825,
          0.766,
          'liter',
          17,
          null,
        ],
        [
          orangeBuffetFormula.id,
          'PACKAGING',
          packaging['BOTOL 250 ML'],
          0,
          0,
          'pcs',
          18,
          null,
        ],
        [
          orangeBuffetFormula.id,
          'PACKAGING',
          packaging['BOTOL 600 ML'],
          0,
          0,
          'pcs',
          19,
          null,
        ],
        [
          orangeBuffetFormula.id,
          'PACKAGING',
          packaging['BOTOL 1 LITER'],
          0,
          0,
          'pcs',
          20,
          null,
        ],
        [
          orangeBuffetFormula.id,
          'PACKAGING',
          packaging['BOTOL 5 LITER'],
          0,
          0,
          'pcs',
          21,
          null,
        ],
      ];

      for (const mat of materials) {
        await AppDataSource.query(
          `INSERT INTO formula_materials 
          (formulaId, materialType, materialProductCodeId, quantityRequired, formulaRatio, unit, sequence, notes, isActive, createdBy, updatedBy, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(), NOW())`,
          [...mat, adminId, adminId],
        );
      }

      console.log(
        `    ✅ Added ${materials.length} materials to ORANGE BUFFET formula`,
      );
    } else {
      console.log(`  ℹ️  Formula "ORANGE BUFFET - 150L" already exists`);
    }

    console.log('\n✅ Production Data Seeder Completed Successfully!\n');
    console.log('📊 Summary:');
    console.log(
      `  - Created/Verified raw materials: ${Object.keys(rawMaterials).length}`,
    );
    console.log(
      `  - Created/Verified additives: ${Object.keys(additives).length}`,
    );
    console.log(
      `  - Created/Verified packaging: ${Object.keys(packaging).length}`,
    );
    console.log(
      `  - Created/Verified finished products: ${Object.keys(finishedProducts).length}`,
    );
    console.log(`  - Created ORANGE BUFFET 150L formula with 21 materials\n`);

    await AppDataSource.destroy();
  } catch (error) {
    console.error('❌ Error:', error);
    await AppDataSource.destroy();
    process.exit(1);
  }
}

seedProductionData();
