import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, DataSource, In } from 'typeorm';
import { Orders } from './entity/orders.entity';
import { OrderItems } from './entity/order_items.entity';
import { Customers } from '../customers/entity/customers.entity';
import { CustomerProductCatalogs } from '../customers/entity/customer_product_catalog.entity';
import { ProductCodes } from '../products/entity/product_codes.entity';
import BaseResponse from '../../common/response/base.response';
import {
  ResponsePagination,
  ResponseSuccess,
} from '../../common/interface/response.interface';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CreateOrderDto, OrderFilterDto } from './dto/orders.dto';
import { InvoiceNumberGenerator } from './utils/invoice-number-generator';
import { DeleteOrderDto } from './dto/orders.dto';
import { InventoryTransactionService } from '../inventory/services/inventory-transaction.service';


@Injectable()
export class OrdersService extends BaseResponse {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Orders)
    private readonly ordersRepo: Repository<Orders>,
    @InjectRepository(OrderItems)
    private readonly orderItemsRepo: Repository<OrderItems>,
    @InjectRepository(Customers)
    private readonly customersRepo: Repository<Customers>,
    @InjectRepository(CustomerProductCatalogs)
    private readonly customerCatalogRepo: Repository<CustomerProductCatalogs>,
    @InjectRepository(ProductCodes)
    private readonly productCodesRepo: Repository<ProductCodes>,
    private readonly inventoryTransactionService: InventoryTransactionService,

    private readonly dataSource: DataSource,
  ) {
    super();
  }

  /**
   * Generate order number in format: ORD-YYYYMMDD-XXX
   */
  private async generateOrderNumber(): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');

    const lastOrder = await this.ordersRepo
      .createQueryBuilder('order')
      .where('order.orderNumber LIKE :pattern', { pattern: `ORD-${dateStr}-%` })
      .orderBy('order.orderNumber', 'DESC')
      .getOne();

    let sequence = 1;
    if (lastOrder) {
      const lastSequence = parseInt(lastOrder.orderNumber.split('-')[2]);
      sequence = lastSequence + 1;
    }

    return `ORD-${dateStr}-${sequence.toString().padStart(3, '0')}`;
  }

  /**
   * Generate invoice number in format: SL/OJ-MKT/IX/25/0001
   */
  private async generateInvoiceNumber(invoiceDate: Date): Promise<string> {
    const month = invoiceDate.getMonth() + 1;
    const year = invoiceDate.getFullYear();

    // Find last invoice number for the same month/year
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);

    const lastInvoice = await this.ordersRepo
      .createQueryBuilder('order')
      .where('order.invoiceNumber IS NOT NULL')
      .andWhere('order.invoiceDate BETWEEN :start AND :end', {
        start: startOfMonth,
        end: endOfMonth,
      })
      .orderBy('order.invoiceNumber', 'DESC')
      .getOne();

    let sequence = 1;
    if (lastInvoice && lastInvoice.invoiceNumber) {
      const parsed = InvoiceNumberGenerator.parse(lastInvoice.invoiceNumber);
      if (parsed) {
        sequence = parseInt(parsed.sequence) + 1;
      }
    }

    return InvoiceNumberGenerator.generate(invoiceDate, sequence);
  }

  /**
   * Calculate pricing for order items
   * ✅ FIXED: Proper query for product codes and customer catalog pricing
   */
  private async calculateOrderPricing(
    customerId: number,
    orderItems: any[],
    customer: Customers,
  ): Promise<{
    items: any[];
    subtotal: number;
    taxAmount: number;
    grandTotal: number;
  }> {
    const calculatedItems = [];
    let subtotal = 0;

    // 1. Collect IDs
    const productCodeIds = orderItems.map((item) => item.productCodeId);

    // 2. Batch Fetch ProductCodes
    const productCodes = await this.productCodesRepo.find({
      where: { id: In(productCodeIds), isActive: true },
      relations: ['product', 'category', 'size'],
      select: {
        id: true,
        productCode: true,
        isActive: true,
        product: {
          id: true,
          name: true,
          productType: true,
          imageUrl: true,
        },
        category: {
          id: true,
          name: true,
        },
        size: {
          id: true,
          sizeValue: true,
          unitOfMeasure: true,
          baseUnit: true,
          baseValue: true,
          categoryType: true,
        },
      },
    });

    const productCodeMap = new Map(productCodes.map((pc) => [pc.id, pc]));

    // 3. Batch Fetch Customer Pricing
    const customerCatalogs = await this.customerCatalogRepo.find({
      where: {
        customerId: customerId,
        productCodeId: In(productCodeIds),
        isActive: true,
      },
    });

    const catalogMap = new Map(
      customerCatalogs.map((cc) => [cc.productCodeId, cc]),
    );

    for (const item of orderItems) {
      const productCodeData = productCodeMap.get(item.productCodeId);

      if (!productCodeData) {
        throw new BadRequestException(
          `Product code with ID ${item.productCodeId} not found or inactive`,
        );
      }

      // 4. Get pricing from Map
      const customerCatalog = catalogMap.get(item.productCodeId);

      if (!customerCatalog) {
        throw new BadRequestException(
          `Product ${productCodeData.productCode} is not in customer catalog. Please add to customer catalog first.`,
        );
      }

      // Pricing Logic
      const unitPrice = customerCatalog.customerPrice;
      const customerCatalogId = customerCatalog.id;
      const discountPercentage = 0; // customerCatalog.discountPercentage || 0;

      // Date Validation (Logging only)
      if (customerCatalog.effectiveDate || customerCatalog.expiryDate) {
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        if (
          customerCatalog.effectiveDate &&
          new Date(customerCatalog.effectiveDate) > now
        ) {
          console.warn(
            `[PRICING WARNING] Product ${productCodeData.productCode} - Effective date in future`,
          );
        }

        if (
          customerCatalog.expiryDate &&
          new Date(customerCatalog.expiryDate) < now
        ) {
          console.warn(
            `[PRICING WARNING] Product ${productCodeData.productCode} - Expiry date passed`,
          );
        }
      }

      const lineTotal = unitPrice * item.quantity;
      const discountAmount = (lineTotal * discountPercentage) / 100;
      const lineTotalAfterDiscount = lineTotal - discountAmount;

      subtotal += lineTotalAfterDiscount;

      // Relations
      const product = productCodeData.product;
      const category = productCodeData.category;
      const size = productCodeData.size;

      let productName = 'Unknown Product';

      if (product && category && size) {
        const baseName = [
          product.name || '',
          category.name || '',
          product.productType || '',
        ]
          .filter(Boolean)
          .join(' ');

        if (baseName && size.sizeValue) {
          productName = `${baseName} @ ${size.sizeValue.toUpperCase()}`;
        } else {
          productName = baseName || 'Unknown Product';
        }
      } else if (product) {
        productName = product.name || 'Unknown Product';
      }

      calculatedItems.push({
        productCodeId: item.productCodeId,
        customerCatalogId,
        productCodeValue: productCodeData.productCode,
        productName,
        unitPrice,
        quantity: item.quantity,
        unit: size?.unitOfMeasure || 'PCS',
        lineTotal: lineTotalAfterDiscount,
        discountPercentage,
        discountAmount,
        notes: item.notes || '',
      });
    }

    // Calculate tax
    const taxPercentage = customer.taxType === 'PPN' ? 11 : 0;
    const taxAmount = (subtotal * taxPercentage) / 100;
    const grandTotal = subtotal + taxAmount;

    return {
      items: calculatedItems,
      subtotal,
      taxAmount,
      grandTotal,
    };
  }

  /**
   * Create new order
   * ✅ UPDATED: Support invoice date input & generate invoice number immediately
   */
  async createOrder(createOrderDto: CreateOrderDto): Promise<ResponseSuccess> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Validate customer
      const customer = await queryRunner.manager.findOne(Customers, {
        where: { id: createOrderDto.customerId, isActive: true },
      });

      if (!customer) {
        throw new NotFoundException('Customer not found or inactive');
      }

      // Validate order items
      if (
        !createOrderDto.orderItems ||
        createOrderDto.orderItems.length === 0
      ) {
        throw new BadRequestException('Order must have at least one item');
      }

      // ✅ Handle order date (default to today)
      const orderDate = createOrderDto.orderDate
        ? new Date(createOrderDto.orderDate)
        : new Date();

      // ✅ Handle invoice date (allow backdate and future dates, default to order date)
      const invoiceDate = createOrderDto.invoiceDate
        ? new Date(createOrderDto.invoiceDate)
        : orderDate;

      // Calculate pricing
      const { items, subtotal, taxAmount, grandTotal } =
        await this.calculateOrderPricing(
          createOrderDto.customerId,
          createOrderDto.orderItems,
          customer,
        );

      // Generate order number
      const orderNumber = await this.generateOrderNumber();

      // ✅ Generate invoice number based on invoice date
      const invoiceNumber = await this.generateInvoiceNumber(invoiceDate);

      // Create order
      const order = new Orders();
      order.orderNumber = orderNumber;
      order.invoiceNumber = invoiceNumber;
      order.customerId = createOrderDto.customerId;
      order.customerCode = customer.customerCode;
      order.customerName = customer.customerName;
      order.customerAddress = customer.address;
      order.orderDate = orderDate;
      order.invoiceDate = invoiceDate;
      order.subtotal = subtotal;
      order.taxPercentage = customer.taxType === 'PPN' ? 11 : 0;
      order.taxAmount = taxAmount;
      order.grandTotal = grandTotal;
      order.paidAmount = 0;
      order.remainingAmount = grandTotal;
      order.customerNotes = createOrderDto.customerNotes || (null as any);
      order.internalNotes = createOrderDto.internalNotes || (null as any);
      order.paymentInfo = 'BCA 167-251-4341 a.n PT. AIDIA MAKMUR INDONESIA';
      order.createdBy = createOrderDto.createdBy as any;

      // ✅ Save using QueryRunner Manager
      // Handle potential array return
      const savedOrderResult = await queryRunner.manager.save(Orders, order);
      const savedOrder = Array.isArray(savedOrderResult)
        ? savedOrderResult[0]
        : savedOrderResult;

      // Create order items one by one
      const createdOrderItems: OrderItems[] = [];
      for (const item of items) {
        const orderItem = this.orderItemsRepo.create({
          orderId: savedOrder.id,
          ...item,
        });

        // ✅ Save using QueryRunner Manager
        const savedOrderItemResult = await queryRunner.manager.save(
          OrderItems,
          orderItem,
        );

        // ✅ FIX: Explicitly handle array return type to satisfy TypeScript
        const savedOrderItem = Array.isArray(savedOrderItemResult)
          ? savedOrderItemResult[0]
          : savedOrderItemResult;

        createdOrderItems.push(savedOrderItem);
      }

      // ✅ Record inventory transactions for each order item
      const userId =
        typeof createOrderDto.createdBy === 'object'
          ? createOrderDto.createdBy.id
          : createOrderDto.createdBy;

      if (!userId) {
        throw new BadRequestException('User ID is required for creating order');
      }

      // ✅ Check if invoice date is today (same-day order)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const invoiceDateOnly = new Date(invoiceDate);
      invoiceDateOnly.setHours(0, 0, 0, 0);

      const isSameDayOrder = invoiceDateOnly.getTime() === today.getTime();

      if (isSameDayOrder) {
        this.logger.log(
          `[ORDER ${orderNumber}] Same-day order detected - recording inventory transactions`,
        );

        for (const item of items) {
          try {
            // ✅ CRITICAL FIX: Pass queryRunner.manager as the 3rd argument
            await this.inventoryTransactionService.recordSale(
              {
                productCodeId: item.productCodeId,
                quantity: item.quantity,
                orderId: savedOrder.id,
                invoiceDate: invoiceDate,
                notes: createOrderDto.customerNotes,
              },
              userId,
              queryRunner.manager, // <--- External Transaction Manager
            );

            this.logger.log(
              `[ORDER ${orderNumber}] Inventory transaction recorded for product ${item.productCodeId}`,
            );
          } catch (error) {
            this.logger.error(
              `[ORDER ${orderNumber}] Failed to record inventory transaction for product ${item.productCodeId}: ${error.message}`,
            );
            throw new BadRequestException(
              `Failed to reserve inventory for product ${item.productName}: ${error.message}`,
            );
          }
        }
      } else {
        this.logger.log(
          `[ORDER ${orderNumber}] Future-dated order (invoice: ${invoiceDate.toISOString().split('T')[0]}) - skipping inventory transaction`,
        );
      }

      // ✅ Commit Transaction
      await queryRunner.commitTransaction();

      // --- Post-Transaction Logic ---
      try {
        const createdOrder = await this.findOne(savedOrder.id);

        // [ROLLED BACK] Emit notification disabled

        return this._success('Order created successfully', createdOrder.data);
      } catch (notifError) {
        this.logger.error(
          `Notification failed for order ${orderNumber}`,
          notifError,
        );
        return this._success(
          'Order created successfully (Notification pending)',
          savedOrder,
        );
      }
    } catch (error) {
      // ✅ Rollback Transaction on any error
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to create order', error);
      throw error;
    } finally {
      // ✅ Release connection
      await queryRunner.release();
    }
  }

  /**
   * Get all orders with filtering and pagination
   */
  async findAll(
    query: PaginationDto,
    filters: OrderFilterDto,
  ): Promise<ResponsePagination> {
    const { page, pageSize, limit } = query;

    const queryBuilder = this.ordersRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.orderItems', 'orderItems')
      .leftJoinAndSelect('orderItems.productCode', 'productCode')
      .leftJoinAndSelect('productCode.product', 'product')
      .orderBy('order.createdAt', 'DESC')
      .where('order.isDeleted = :isDeleted OR order.isDeleted IS NULL', {
        isDeleted: false,
      });

    // Apply filters
    if (filters.customerId) {
      queryBuilder.andWhere('order.customerId = :customerId', {
        customerId: filters.customerId,
      });
    }

    if (filters.orderNumber) {
      queryBuilder.andWhere('order.orderNumber LIKE :orderNumber', {
        orderNumber: `%${filters.orderNumber}%`,
      });
    }

    if (filters.startDate && filters.endDate) {
      queryBuilder.andWhere('order.orderDate BETWEEN :startDate AND :endDate', {
        startDate: filters.startDate,
        endDate: filters.endDate,
      });
    }

    const [result, count] = await queryBuilder
      .take(pageSize)
      .skip(limit)
      .getManyAndCount();

    return this._pagination(
      'Orders retrieved successfully',
      result,
      count,
      page!,
      pageSize!,
    );
  }

  /**
   * Get single order by ID
   */
  async findOne(id: number): Promise<ResponseSuccess> {
    const order = await this.ordersRepo.findOne({
      where: { id },
      relations: [
        'customer',
        'orderItems',
        'orderItems.productCode',
        'orderItems.productCode.product',
        'orderItems.productCode.category', // ✅ Add category relation
        'orderItems.productCode.size', // ✅ Add size relation
        'orderItems.customerCatalog',
        'createdBy',
        'updatedBy',
        'approvedBy',
      ],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return this._success('Order retrieved successfully', order);
  }
  /**
   * Get customer order history
   */
  async getCustomerOrderHistory(
    customerId: number,
    query: PaginationDto,
  ): Promise<ResponsePagination> {
    const { page, pageSize, limit } = query;

    const [result, count] = await this.ordersRepo.findAndCount({
      where: { customerId },
      relations: ['orderItems', 'orderItems.productCode'],
      order: { createdAt: 'DESC' },
      take: pageSize,
      skip: limit,
    });

    return this._pagination(
      'Customer order history retrieved successfully',
      result,
      count,
      page!,
      pageSize!,
    );
  }

  /**
   * Get order summary (for dashboard/reports)
   */
  async getOrderSummary(filters?: OrderFilterDto): Promise<ResponseSuccess> {
    const queryBuilder = this.ordersRepo
      .createQueryBuilder('order')
      .select([
        'COUNT(*) as totalOrders',
        'SUM(order.grandTotal) as totalRevenue',
        'SUM(order.remainingAmount) as totalOutstanding',
      ]);

    // Apply date filter if provided
    if (filters?.startDate && filters?.endDate) {
      queryBuilder.andWhere('order.orderDate BETWEEN :startDate AND :endDate', {
        startDate: filters.startDate,
        endDate: filters.endDate,
      });
    }

    const summary = await queryBuilder.getRawOne();

    return this._success('Order summary retrieved successfully', summary);
  }

  async delete(id: number, payload: DeleteOrderDto): Promise<ResponseSuccess> {
    // Validasi: Order hanya boleh dihapus jika tanggal invoice >= hari ini
    const orderCheck = await this.ordersRepo.findOne({
      where: { id },
      select: ['id', 'orderNumber', 'invoiceDate'],
    });

    if (!orderCheck) {
      throw new NotFoundException('Order tidak ditemukan');
    }

    // Validasi: Harus ada invoice date
    if (!orderCheck.invoiceDate) {
      throw new BadRequestException(
        'Order belum memiliki tanggal invoice dan tidak dapat dihapus.',
      );
    }

    // Validasi tanggal invoice
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const invoiceDate = new Date(orderCheck.invoiceDate);
    invoiceDate.setHours(0, 0, 0, 0);

    if (invoiceDate < today) {
      throw new BadRequestException(
        `Invoice tanggal ${invoiceDate.toLocaleDateString('id-ID')} sudah terlewat dan tidak dapat dihapus. Hanya invoice hari ini atau masa depan yang dapat dihapus.`,
      );
    }
    // First, get the order with its items to reverse inventory transactions
    const order = await this.ordersRepo.findOne({
      where: { id },
      relations: ['orderItems'],
    });

    if (!order) {
      throw new NotFoundException(
        `Data pesanan dengan ID ${id} tidak ditemukan`,
      );
    }

    // Check if already deleted
    if (order.isDeleted) {
      throw new BadRequestException(`Order ${id} is already deleted`);
    }

    // ✅ Reverse inventory transactions for each order item
    // This decrements daily_inventory.dipesan and creates cancellation audit trail
    // BUT only for same-day orders (where inventory was already reserved)
    const userId =
      typeof payload.deletedBy === 'object'
        ? payload.deletedBy.id
        : payload.deletedBy;

    if (!userId) {
      throw new BadRequestException('deletedBy user ID is required');
    }

    // ✅ Check if invoice date is today (same-day order) - reuse today variable from above
    const invoiceDateOnly = new Date(order.invoiceDate);
    invoiceDateOnly.setHours(0, 0, 0, 0);

    const isSameDayOrder = invoiceDateOnly.getTime() === today.getTime();

    if (isSameDayOrder) {
      // ✅ SAME-DAY ORDER: Reverse inventory transaction
      this.logger.log(
        `[ORDER ${order.orderNumber}] Same-day order - reversing inventory transactions`,
      );

      for (const orderItem of order.orderItems) {
        try {
          await this.inventoryTransactionService.reverseSale(
            order.id,
            orderItem.productCodeId,
            orderItem.quantity,
            userId,
            `Order ${order.orderNumber} cancelled/deleted`,
            order.invoiceDate, // ✅ CRITICAL: Pass invoice date to reverse correct daily_inventory
          );
        } catch (error) {
          // Log error but continue with deletion
          console.error(
            `[ORDER ${order.orderNumber}] Failed to reverse inventory transaction for product ${orderItem.productCodeId}:`,
            error.message,
          );
          // In production, you might want to:
          // 1. Alert admin about inventory inconsistency
          // 2. Create manual adjustment task
          // Note: We continue with soft delete even if reversal fails
        }
      }
    } else {
      // ✅ FUTURE-DATED ORDER: No need to reverse (was never reserved)
      this.logger.log(
        `[ORDER ${order.orderNumber}] Future-dated order - no inventory reversal needed`,
      );
    }

    // Perform soft delete
    const result = await this.ordersRepo.update(id, {
      isDeleted: true,
      deletedBy: payload.deletedBy,
    });

    if (result.affected === 0) {
      throw new NotFoundException(
        `Data pesanan dengan ID ${id} tidak ditemukan`,
      );
    }

    this.logger.log(
      `Order ${order.orderNumber} deleted and inventory reversed by user ${userId}`,
    );

    // ✅ Emit ORDER_CANCELLED notification
    // [ROLLED BACK] Emit notification disabled

    return this._success(`Data pesanan dengan ID ${id} berhasil dihapus.`);
  }
}
