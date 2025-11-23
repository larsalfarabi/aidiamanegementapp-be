import AppDataSource from '../../config/typeorm.config';

async function cleanupProductionTables() {
  console.log('🧹 Cleaning up production tables...\n');

  try {
    await AppDataSource.initialize();
    console.log('✅ Database connected\n');

    const tables = [
      'production_stage_tracking',
      'production_material_usage',
      'production_batches',
      'formula_materials',
      'production_formulas',
    ];

    for (const table of tables) {
      try {
        await AppDataSource.query(`DROP TABLE IF EXISTS \`${table}\``);
        console.log(`✅ Dropped table: ${table}`);
      } catch (error) {
        console.log(`⚠️  Table ${table} doesn't exist or already dropped`);
      }
    }

    console.log('\n✅ Cleanup completed successfully!\n');
    console.log('Now you can run: bun run migration:run\n');
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  } finally {
    await AppDataSource.destroy();
  }
}

cleanupProductionTables();
