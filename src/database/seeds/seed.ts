import { NestFactory } from '@nestjs/core';
import { SeederModule } from './seed.module';
import { PermissionSeeder } from './permission.seed';
import { RoleSeeder } from './role.seed';
import { UserSeeder } from './user.seed';
import { ProductSeeder } from './product.seed';

async function bootstrap() {
  console.log('🌱 Starting Database Seeding Process...');

  const app = await NestFactory.createApplicationContext(SeederModule);

  try {
    // 1. Seed Permissions first (foundational data)
    console.log('\n📝 Step 1: Seeding Permissions...');
    const permissionSeeder = app.get(PermissionSeeder);
    await permissionSeeder.run();

    // 2. Seed Roles with permissions (depends on permissions)
    console.log('\n👥 Step 2: Seeding Roles...');
    const roleSeeder = app.get(RoleSeeder);
    await roleSeeder.run();

    // 3. Seed Users with roles (depends on roles)
    console.log('\n🧑‍💼 Step 3: Seeding Users...');
    const userSeeder = app.get(UserSeeder);
    await userSeeder.run();

    // 4. Seed Products (depends on categories, sizes, and codes)
    console.log('\n📦 Step 4: Seeding Products...');
    const productSeeder = app.get(ProductSeeder);
    await productSeeder.run();


    console.log('\n🎉 Database seeding completed successfully!');
    console.log('\n📊 Summary:');
    console.log('✅ Permissions: Created/Verified');
    console.log('✅ Roles: Created with appropriate permissions');
    console.log('✅ Users: Created with assigned roles');
    console.log('✅ Products: Created with categories, sizes, and codes');
    console.log('✅ Customers: Created with product catalogs');
  } catch (error) {
    console.error('\n❌ Error during seeding process:');
    console.error('Error details:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    await app.close();
  }
}

bootstrap().catch((error) => {
  console.error('❌ Failed to start seeding process:', error);
  process.exit(1);
});
