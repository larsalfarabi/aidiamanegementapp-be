import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Orders } from '../../modules/orders/entity/orders.entity';
import { OrderItems } from '../../modules/orders/entity/order_items.entity';
import { Customers } from '../../modules/customers/entity/customers.entity';
import { CustomerProductCatalogs } from '../../modules/customers/entity/customer_product_catalog.entity';
import { ProductCodes } from '../../modules/products/entity/product_codes.entity';
import { Users } from '../../modules/users/entities/users.entity';
import { InvoiceNumberGenerator } from '../../modules/orders/utils/invoice-number-generator';

@Injectable()
export class OrderSeeder {
  constructor(
    @InjectRepository(Orders)
    private ordersRepository: Repository<Orders>,
    @InjectRepository(OrderItems)
    private orderItemsRepository: Repository<OrderItems>,
    @InjectRepository(Customers)
    private customersRepository: Repository<Customers>,
    @InjectRepository(CustomerProductCatalogs)
    private customerCatalogRepository: Repository<CustomerProductCatalogs>,
    @InjectRepository(ProductCodes)
    private productCodesRepository: Repository<ProductCodes>,
    @InjectRepository(Users)
    private usersRepository: Repository<Users>,
  ) {}

  async run() {
    // Get admin user
    const adminUser = await this.usersRepository.findOne({
      where: { email: 'msyamil404@gmail.com' },
    });
    if (!adminUser) {
      throw new Error('Admin user not found. Please run user seeder first.');
    }

    // Get customers and product codes
    const customers = await this.customersRepository.find({
      where: { isActive: true },
      take: 5, // Use first 5 customers
    });

    const productCodes = await this.productCodesRepository.find({
      where: { isActive: true },
    });

    const customerCatalogs = await this.customerCatalogRepository.find({
      where: { isActive: true },
    });

    if (customers.length === 0 || productCodes.length === 0) {
      throw new Error('Please run customer and product seeders first.');
    }

    // Helper function to generate order number
    const generateOrderNumber = (index: number) => {
      const date = new Date();
      date.setDate(date.getDate() - index); // Different dates for variety
      const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
      return `ORD-${dateStr}-${(index + 1).toString().padStart(3, '0')}`;
    };

    // Create sample orders
    const ordersData = [
      // Order 1 - Hotel Santika (Confirmed, Partial Payment)
      {
        customer: customers[0],
        items: [
          { productCodeId: productCodes[0].id, quantity: 50, unitPrice: 6500 },
          { productCodeId: productCodes[1].id, quantity: 30, unitPrice: 6500 },
          { productCodeId: productCodes[2].id, quantity: 25, unitPrice: 6500 },
        ],
        paidAmount: 500000,
        customerNotes: 'Untuk event hotel bulan ini',
        daysAgo: 5,
      },
      // Order 2 - KFC Sudirman (Processing, Unpaid)
      {
        customer: customers[1],
        items: [
          { productCodeId: productCodes[0].id, quantity: 100, unitPrice: 6300 },
          { productCodeId: productCodes[5].id, quantity: 80, unitPrice: 6300 },
        ],

        paidAmount: 0,
        customerNotes: 'Order rutin untuk outlet',
        daysAgo: 3,
      },
      // Order 3 - Catering Bunda Ayu (Delivered, Paid)
      {
        customer: customers[2],
        items: [
          { productCodeId: productCodes[0].id, quantity: 200, unitPrice: 6000 },
          { productCodeId: productCodes[2].id, quantity: 150, unitPrice: 6000 },
          { productCodeId: productCodes[4].id, quantity: 100, unitPrice: 6000 },
          { productCodeId: productCodes[6].id, quantity: 75, unitPrice: 6000 },
        ],

        paidAmount: 0, // Will be calculated
        customerNotes: 'Untuk acara wedding besar',
        daysAgo: 10,
      },
      // Order 4 - Toko Berkah Jaya (Pending, Unpaid)
      {
        customer: customers[3],
        items: [
          { productCodeId: productCodes[0].id, quantity: 24, unitPrice: 6700 },
          { productCodeId: productCodes[1].id, quantity: 24, unitPrice: 6700 },
        ],

        paidAmount: 0,
        customerNotes: 'Order mingguan',
        daysAgo: 1,
      },
      // Order 5 - Grand Hyatt (Draft, Unpaid)
      {
        customer: customers[4],
        items: [
          { productCodeId: productCodes[1].id, quantity: 60, unitPrice: 6400 },
          { productCodeId: productCodes[3].id, quantity: 40, unitPrice: 6400 },
          { productCodeId: productCodes[7].id, quantity: 30, unitPrice: 6400 },
        ],

        paidAmount: 0,
        customerNotes: 'Draft order untuk review',
        daysAgo: 0,
      },
    ];

    const createdOrders = [];

    for (let i = 0; i < ordersData.length; i++) {
      const orderData = ordersData[i];
      const orderDate = new Date();
      orderDate.setDate(orderDate.getDate() - orderData.daysAgo);

      const orderNumber = generateOrderNumber(i);

      // Check if order already exists
      const existingOrder = await this.ordersRepository.findOne({
        where: { orderNumber: orderNumber },
      });

      if (existingOrder) {
        console.log(`ℹ️ Order ${orderNumber} already exists, skipping...`);
        createdOrders.push(existingOrder);
        continue;
      }

      // Calculate totals
      let subtotal = 0;
      for (const item of orderData.items) {
        subtotal += item.quantity * item.unitPrice;
      }

      const taxPercentage = orderData.customer.taxType === 'PPN' ? 11 : 0;
      const taxAmount = (subtotal * taxPercentage) / 100;
      const grandTotal = subtotal + taxAmount;
      const paidAmount =
        orderData.paidAmount > grandTotal ? grandTotal : orderData.paidAmount;
      const remainingAmount = grandTotal - paidAmount;

      // Create order
      const orderEntity = new Orders();
      orderEntity.orderNumber = orderNumber;
      orderEntity.customerId = orderData.customer.id;
      orderEntity.customerCode = orderData.customer.customerCode;
      orderEntity.customerName = orderData.customer.customerName;
      orderEntity.customerAddress = orderData.customer.address;
      orderEntity.orderDate = orderDate;
      orderEntity.invoiceDate = orderDate;
      orderEntity.customerNotes = orderData.customerNotes || (null as any);
      orderEntity.subtotal = subtotal;
      orderEntity.taxPercentage = taxPercentage;
      orderEntity.taxAmount = taxAmount;
      orderEntity.grandTotal = grandTotal;
      orderEntity.paidAmount = paidAmount;
      orderEntity.remainingAmount = remainingAmount;

      orderEntity.internalNotes = `Sample order #${i + 1}`;
      orderEntity.paymentInfo =
        'BCA 167-251-4341 a.n PT. AIDIA MAKMUR INDONESIA';
      orderEntity.createdBy = adminUser as any;
      orderEntity.updatedBy = adminUser as any;
      orderEntity.approvedBy = adminUser as any;
      orderEntity.approvedAt = orderDate;

      orderEntity.invoiceNumber = InvoiceNumberGenerator.generate(
        orderDate,
        i + 1,
      );

      const saveResult = await this.ordersRepository.save(orderEntity);
      const savedOrder = Array.isArray(saveResult) ? saveResult[0] : saveResult;

      console.log(
        `✅ Order ${orderNumber} created successfully for ${orderData.customer.customerName}`,
      );

      // Create order items
      for (const itemData of orderData.items) {
        const productCode = productCodes.find(
          (pc) => pc.id === itemData.productCodeId,
        );
        if (!productCode) continue;

        // Get product name from database
        const productCodeWithProduct = await this.productCodesRepository
          .createQueryBuilder('pc')
          .select(['pc.productCode', 'p.name as productName'])
          .leftJoin('products', 'p', 'p.id = pc.productId')
          .where('pc.id = :id', { id: itemData.productCodeId })
          .getRawOne();

        // Find customer catalog if exists
        const customerCatalog = customerCatalogs.find(
          (cc) =>
            cc.customerId === orderData.customer.id &&
            cc.productCodeId === itemData.productCodeId,
        );

        const lineTotal = itemData.quantity * itemData.unitPrice;

        // Check if order item already exists
        const existingOrderItem = await this.orderItemsRepository.findOne({
          where: {
            orderId: savedOrder.id,
            productCodeId: itemData.productCodeId,
          },
        });

        if (!existingOrderItem) {
          const orderItem = this.orderItemsRepository.create({
            orderId: savedOrder.id,
            productCodeId: itemData.productCodeId,
            customerCatalogId: customerCatalog?.id || undefined,
            productCodeValue: productCode.productCode,
            productName:
              productCodeWithProduct?.productName || 'Unknown Product',
            unitPrice: itemData.unitPrice,
            quantity: itemData.quantity,
            unit: 'PCS',
            lineTotal: lineTotal,
            discountPercentage: 0,
            discountAmount: 0,
            notes: `Sample item for ${productCode.productCode}`,
            isActive: true,
          });

          await this.orderItemsRepository.save(orderItem);
        }
      }

      createdOrders.push(savedOrder);
    }

    console.log('✅ Order seeding completed');
    console.log(`✅ Created ${createdOrders.length} orders with items`);
    console.log('📊 Order status breakdown:');
    console.log(`   - Draft: 1`);
    console.log(`   - Pending: 1`);
    console.log(`   - Confirmed: 1`);
    console.log(`   - Processing: 1`);
    console.log(`   - Delivered: 1`);
  }
}
