import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customers } from '../../modules/customers/entity/customers.entity';
import { CustomerProductCatalogs } from '../../modules/customers/entity/customer_product_catalog.entity';
import { ProductCodes } from '../../modules/products/entity/product_codes.entity';
import { Users } from '../../modules/users/entities/users.entity';

@Injectable()
export class CustomerSeeder {
  constructor(
    @InjectRepository(Customers)
    private customersRepository: Repository<Customers>,
    @InjectRepository(CustomerProductCatalogs)
    private customerProductCatalogRepository: Repository<CustomerProductCatalogs>,
    @InjectRepository(ProductCodes)
    private productCodesRepository: Repository<ProductCodes>,
    @InjectRepository(Users)
    private usersRepository: Repository<Users>,
  ) {}

  async run() {
    // Get admin user for createdBy/updatedBy
    const adminUser = await this.usersRepository.findOne({
      where: { email: 'msyamil404@gmail.com' },
    });
    if (!adminUser) {
      throw new Error('Admin user not found. Please run user seeder first.');
    }

    // Get all product codes for catalog assignment
    const productCodes = await this.productCodesRepository.find({
      where: { isActive: true },
    });
    if (productCodes.length === 0) {
      throw new Error(
        'No product codes found. Please run product seeder first.',
      );
    }

    // Create Customers
    const customersData = [
      {
        customerCode: 'HTL001',
        customerName: 'Hotel Santika Premium Jakarta',
        address: 'Jl. MH Thamrin No. 45, Jakarta Pusat, DKI Jakarta 10350',
        contactPerson: 'Ibu Sarah Wijaya',
        companyName: 'PT Santika Indonesia Tbk',
        phoneNumber: '021-31927777',
        customerType: 'Hotel',
        taxType: 'PPN',
        isActive: true,
      },
      {
        customerCode: 'RST002',
        customerName: 'KFC Sudirman',
        address:
          'Plaza Indonesia, Jl. MH Thamrin Kav. 28-30, Jakarta Pusat 10350',
        contactPerson: 'Pak Budi Santoso',
        companyName: 'PT Fast Food Indonesia Tbk',
        phoneNumber: '021-29921234',
        customerType: 'Cafe & Resto',
        taxType: 'PPN',
        isActive: true,
      },
      {
        customerCode: 'CTR003',
        customerName: 'Catering Bunda Ayu',
        address: 'Jl. Raya Bogor KM 23, Cibinong, Bogor 16911',
        contactPerson: 'Ibu Ayu Lestari',
        companyName: 'CV Bunda Ayu Catering',
        phoneNumber: '081298765432',
        customerType: 'Catering',
        taxType: 'Non PPN',
        isActive: true,
      },
      {
        customerCode: 'RSL004',
        customerName: 'Toko Berkah Jaya',
        address: 'Jl. Pasar Minggu Raya No. 88, Jakarta Selatan 12560',
        contactPerson: 'Pak Ahmad Hidayat',
        companyName: 'UD Berkah Jaya',
        phoneNumber: '08567891234',
        customerType: 'Reseller',
        taxType: 'Non PPN',
        isActive: true,
      },
      {
        customerCode: 'HTL005',
        customerName: 'Grand Hyatt Jakarta',
        address: 'Jl. MH Thamrin Kav. 28-30, Jakarta Pusat 10350',
        contactPerson: 'Mr. James Wilson',
        companyName: 'PT Grand Hyatt Jakarta',
        phoneNumber: '021-23921234',
        customerType: 'Hotel',
        taxType: 'PPN',
        isActive: true,
      },
      {
        customerCode: 'RST006',
        customerName: 'Starbucks Plaza Senayan',
        address:
          'Plaza Senayan Lt. 1, Jl. Asia Afrika No. 8, Jakarta Selatan 10270',
        contactPerson: 'Ibu Maria Christina',
        companyName: 'PT Sari Coffee Indonesia',
        phoneNumber: '021-57901234',
        customerType: 'Cafe & Resto',
        taxType: 'PPN',
        isActive: true,
      },
      {
        customerCode: 'CTR007',
        customerName: 'Catering Nusantara',
        address: 'Jl. Raya Serpong KM 7, Tangerang Selatan 15310',
        contactPerson: 'Pak Indra Gunawan',
        companyName: 'PT Nusantara Catering Services',
        phoneNumber: '021-53121234',
        customerType: 'Catering',
        taxType: 'PPN',
        isActive: true,
      },
      {
        customerCode: 'RSL008',
        customerName: 'Minimarket Sumber Rejeki',
        address: 'Jl. HR Rasuna Said Blok X-5 Kav. 4-9, Jakarta Selatan 12940',
        contactPerson: 'Ibu Siti Nurhaliza',
        companyName: 'CV Sumber Rejeki',
        phoneNumber: '08123456789',
        customerType: 'Reseller',
        taxType: 'Non PPN',
        isActive: true,
      },
      {
        customerCode: 'RST009',
        customerName: 'Pizza Hut Kelapa Gading',
        address:
          'Mall Kelapa Gading 3 Lt. 2, Jl. Boulevard Raya, Jakarta Utara 14240',
        contactPerson: 'Pak Rizky Pratama',
        companyName: 'PT Sari Melati Kencana',
        phoneNumber: '021-45881234',
        customerType: 'Cafe & Resto',
        taxType: 'PPN',
        isActive: true,
      },
      {
        customerCode: 'HTL010',
        customerName: 'Hotel Borobudur Jakarta',
        address: 'Jl. Lapangan Banteng Selatan, Jakarta Pusat 10710',
        contactPerson: 'Ibu Dewi Sartika',
        companyName: 'PT Hotel Borobudur Inter Continental',
        phoneNumber: '021-38051234',
        customerType: 'Hotel',
        taxType: 'PPN',
        isActive: false,
      },
    ];

    const createdCustomers = [];
    let createdCustomersCount = 0;
    let existingCustomersCount = 0;

    for (const customerData of customersData) {
      // Check if customer already exists
      let customer = await this.customersRepository.findOne({
        where: { customerCode: customerData.customerCode },
      });

      if (!customer) {
        customer = await this.customersRepository.save({
          ...customerData,
          createdBy: adminUser,
          updatedBy: adminUser,
        });
        createdCustomersCount++;
        console.log(
          `✅ Customer "${customerData.customerName}" created successfully.`,
        );
      } else {
        existingCustomersCount++;
        console.log(
          `ℹ️ Customer "${customerData.customerName}" already exists.`,
        );
      }

      createdCustomers.push(customer);
    }

    console.log(
      `✅ Customer seeding completed: ${createdCustomersCount} customers created, ${existingCustomersCount} already existed`,
    );

    // Create Customer Product Catalogs
    const catalogData = [
      // Hotel Santika Premium Jakarta - Premium products with hotel discount
      {
        customerId: createdCustomers[0].id,
        productCodeIds: [1, 2, 3, 4, 5], // First 5 products
        customerPrice: 6500,
        discountPercentage: 7.14, // 500/7000 * 100
        effectiveDate: new Date('2025-01-01'),
        expiryDate: new Date('2025-12-31'),
        notes:
          'Harga khusus kontrak tahunan Hotel Santika - Premium juice selection',
      },
      // KFC Sudirman - Fast food chain, bulk order discount
      {
        customerId: createdCustomers[1].id,
        productCodeIds: [1, 2, 6, 10], // Orange, Apple, Strawberry, Lemon
        customerPrice: 6300,
        discountPercentage: 10.0,
        effectiveDate: new Date('2025-01-01'),
        expiryDate: new Date('2025-06-30'),
        notes: 'Harga promo semester pertama untuk KFC - Popular flavors only',
      },
      // Catering Bunda Ayu - Catering service, good volume discount
      {
        customerId: createdCustomers[2].id,
        productCodeIds: [1, 3, 5, 7], // Orange, Pineapple, Pink Guava, Soursop
        customerPrice: 6000,
        discountPercentage: 14.29,
        effectiveDate: new Date('2025-01-01'),
        expiryDate: null,
        notes:
          'Harga khusus catering tanpa batas waktu - Tropical fruit selection',
      },
      // Toko Berkah Jaya - Small reseller, modest discount
      {
        customerId: createdCustomers[3].id,
        productCodeIds: [1, 2, 4], // Orange, Apple, Mango - Basic flavors
        customerPrice: 6700,
        discountPercentage: 4.29,
        effectiveDate: new Date('2025-01-01'),
        expiryDate: new Date('2025-12-31'),
        notes: 'Harga reseller untuk toko kecil - Basic flavor selection',
      },
      // Grand Hyatt Jakarta - Luxury hotel, premium selection
      {
        customerId: createdCustomers[4].id,
        productCodeIds: [2, 4, 8, 9], // Apple, Mango, Kiwi, Naga - Exotic selection
        customerPrice: 6400,
        discountPercentage: 8.57,
        effectiveDate: new Date('2025-01-01'),
        expiryDate: new Date('2025-12-31'),
        notes: 'Harga khusus Grand Hyatt - Premium exotic fruit selection',
      },
      // Starbucks Plaza Senayan - Coffee shop, complementary juices
      {
        customerId: createdCustomers[5].id,
        productCodeIds: [2, 6, 10], // Apple, Strawberry, Lemon - Fresh & tangy
        customerPrice: 6600,
        discountPercentage: 5.71,
        effectiveDate: new Date('2025-01-01'),
        expiryDate: new Date('2025-09-30'),
        notes:
          'Harga untuk Starbucks - Fresh juice selection untuk coffee shop',
      },
      // Catering Nusantara - Large catering, best discount
      {
        customerId: createdCustomers[6].id,
        productCodeIds: [1, 2, 3, 4, 5, 6, 7], // Most products - variety for catering
        customerPrice: 5800,
        discountPercentage: 17.14,
        effectiveDate: new Date('2025-01-01'),
        expiryDate: new Date('2025-12-31'),
        notes: 'Harga terbaik untuk catering besar - Wide variety selection',
      },
      // Minimarket Sumber Rejeki - Small minimarket
      {
        customerId: createdCustomers[7].id,
        productCodeIds: [1, 2], // Orange, Apple - Popular basic flavors
        customerPrice: 6800,
        discountPercentage: 2.86,
        effectiveDate: new Date('2025-01-01'),
        expiryDate: new Date('2025-12-31'),
        notes: 'Harga minimarket kecil - Basic popular flavors only',
      },
      // Pizza Hut Kelapa Gading - Restaurant chain
      {
        customerId: createdCustomers[8].id,
        productCodeIds: [1, 3, 4, 6], // Orange, Pineapple, Mango, Strawberry
        customerPrice: 6350,
        discountPercentage: 9.29,
        effectiveDate: new Date('2025-01-01'),
        expiryDate: new Date('2025-12-31'),
        notes: 'Harga untuk Pizza Hut - Tropical & popular fruit selection',
      },
    ];

    // Create catalog entries
    let createdCatalogsCount = 0;
    let existingCatalogsCount = 0;

    for (const catalog of catalogData) {
      for (const productCodeId of catalog.productCodeIds) {
        // Check if catalog entry already exists
        const existingCatalog =
          await this.customerProductCatalogRepository.findOne({
            where: {
              customerId: catalog.customerId,
              productCodeId: productCodeId,
            },
          });

        if (!existingCatalog) {
          const catalogEntry = this.customerProductCatalogRepository.create({
            customerId: catalog.customerId,
            productCodeId: productCodeId,
            customerPrice: catalog.customerPrice,
            discountPercentage: catalog.discountPercentage,
            effectiveDate: catalog.effectiveDate,
            expiryDate: catalog.expiryDate || undefined,
            isActive: true,
            notes: catalog.notes,
            createdBy: adminUser,
            updatedBy: adminUser,
          });
          await this.customerProductCatalogRepository.save(catalogEntry);
          createdCatalogsCount++;
        } else {
          existingCatalogsCount++;
        }
      }
    }

    console.log(
      `✅ Customer product catalog seeding completed: ${createdCatalogsCount} catalogs created, ${existingCatalogsCount} already existed`,
    );
  }
}
