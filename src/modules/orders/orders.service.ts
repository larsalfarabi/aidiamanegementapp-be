import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
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
    private readonly inventoryTransactionService: InventoryTransactionService, // ✅ Inject inventory service
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

    for (const item of orderItems) {
      // ✅ FIXED: Proper query with explicit SELECT to get all nested data
      const productCodeData = await this.productCodesRepo
        .createQueryBuilder('pc')
        .select([
          'pc.id',
          'pc.productCode',
          'pc.isActive',
          'product.id',
          'product.name',
          'product.productType',
          'product.imageUrl',
          'category.id',
          'category.name',
          'size.id',
          'size.sizeValue',
          'size.unitOfMeasure',
          'size.baseUnit',
          'size.baseValue',
          'size.categoryType',
        ])
        .leftJoin('pc.product', 'product')
        .leftJoin('pc.category', 'category')
        .leftJoin('pc.size', 'size')
        .where('pc.id = :id', { id: item.productCodeId })
        .andWhere('pc.isActive = :isActive', { isActive: true })
        .getOne();

      if (!productCodeData) {
        throw new BadRequestException(
          `Product code with ID ${item.productCodeId} not found or inactive`,
        );
      }

      // ✅ Get base unit price from product (assuming it's in Product entity)
      // Default fallback if customer catalog not found
      let unitPrice = 0; // Will be set from customer catalog or base price
      let customerCatalogId = null;
      const discountPercentage = 0;

      // ✅ Try to find customer-specific pricing (MUST HAVE)
      const customerCatalog = await this.customerCatalogRepo.findOne({
        where: {
          customerId: customerId,
          productCodeId: item.productCodeId,
          isActive: true,
        },
      });

      if (!customerCatalog) {
        throw new BadRequestException(
          `Product ${productCodeData.productCode} is not in customer catalog. Please add to customer catalog first.`,
        );
      }

      // ✅ PRACTICAL APPROACH: Use pricing if catalog exists and isActive
      // Date validation is optional and only for informational purposes
      // This allows flexibility for backdated orders and historical data
      unitPrice = customerCatalog.customerPrice;
      customerCatalogId = customerCatalog.id;
      // discountPercentage = customerCatalog.discountPercentage || 0;

      // Optional: Log warning if outside effective date range (but don't block)
      if (customerCatalog.effectiveDate || customerCatalog.expiryDate) {
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        if (customerCatalog.effectiveDate) {
          const effectiveDate = new Date(customerCatalog.effectiveDate);
          effectiveDate.setHours(0, 0, 0, 0);
          if (effectiveDate > now) {
            console.warn(
              `[PRICING WARNING] Product ${productCodeData.productCode} - Effective date is in future: ${effectiveDate.toISOString()}`,
            );
          }
        }

        if (customerCatalog.expiryDate) {
          const expiryDate = new Date(customerCatalog.expiryDate);
          expiryDate.setHours(23, 59, 59, 999);
          if (expiryDate < now) {
            console.warn(
              `[PRICING WARNING] Product ${productCodeData.productCode} - Expiry date has passed: ${expiryDate.toISOString()}`,
            );
          }
        }
      }

      const lineTotal = unitPrice * item.quantity;
      const discountAmount = (lineTotal * discountPercentage) / 100;
      const lineTotalAfterDiscount = lineTotal - discountAmount;

      subtotal += lineTotalAfterDiscount;

      // ✅ FIXED: Extract relations properly from query result
      const product = productCodeData.product;
      const category = productCodeData.category;
      const size = productCodeData.size;

      // ✅ Build complete product name: Product + Category + ProductType + Size
      // Format: "PRODUCT_NAME CATEGORY_NAME PRODUCT_TYPE @ SIZE_VALUE"
      // Example: "Jus Mangga PREMIUM RTD @ 250 ML"
      let productName = 'Unknown Product';

      if (product && category && size) {
        const productPart = product.name || '';
        const categoryPart = category.name || '';
        const productType = product.productType || '';
        const sizePart = size.sizeValue.toUpperCase() || '';

        // Concatenate product + category + productType
        const baseName = [productPart, categoryPart, productType]
          .filter(Boolean)
          .join(' ');

        // Add size with @ symbol
        if (baseName && sizePart) {
          productName = `${baseName} @ ${sizePart}`;
        } else if (baseName) {
          productName = baseName;
        }
      } else if (product) {
        // Fallback to just product name if relations incomplete
        productName = product.name || 'Unknown Product';
      }

      // ✅ Log for debugging (can be removed in production)
      console.log(
        `[ORDER ITEM] Product Code: ${productCodeData.productCode}, Generated Name: ${productName}`,
      );

      calculatedItems.push({
        productCodeId: item.productCodeId,
        customerCatalogId,
        productCodeValue: productCodeData.productCode, // ✅ Correct string field
        productName, // ✅ Use formatted product name
        unitPrice,
        quantity: item.quantity,
        unit: size?.unitOfMeasure || 'PCS',
        lineTotal: lineTotalAfterDiscount,
        discountPercentage,
        discountAmount,
        notes: item.notes || '',
      });
    }

    // Calculate tax based on customer tax type
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
    // Validate customer
    const customer = await this.customersRepo.findOne({
      where: { id: createOrderDto.customerId, isActive: true },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found or inactive');
    }

    // Validate order items
    if (!createOrderDto.orderItems || createOrderDto.orderItems.length === 0) {
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

    // ✅ Generate invoice number based on invoice date (not current date)
    const invoiceNumber = await this.generateInvoiceNumber(invoiceDate);

    // Create order
    const order = new Orders();
    order.orderNumber = orderNumber;
    order.invoiceNumber = invoiceNumber; // ✅ Set invoice number at creation
    order.customerId = createOrderDto.customerId;
    order.customerCode = customer.customerCode;
    order.customerName = customer.customerName;
    order.customerAddress = customer.address;
    order.orderDate = orderDate;
    order.invoiceDate = invoiceDate; // ✅ Set invoice date (can be backdate)
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

    const saveResult = await this.ordersRepo.save(order);
    const savedOrder = Array.isArray(saveResult) ? saveResult[0] : saveResult;

    // Create order items one by one
    const createdOrderItems: OrderItems[] = [];
    for (const item of items) {
      const orderItem = this.orderItemsRepo.create({
        orderId: savedOrder.id,
        ...item,
      });
      const savedOrderItem = await this.orderItemsRepo.save(orderItem);
      // Handle both single item and array return from save
      const itemToAdd = Array.isArray(savedOrderItem)
        ? savedOrderItem[0]
        : savedOrderItem;
      createdOrderItems.push(itemToAdd);
    }

    // ✅ Record inventory transactions for each order item
    // This updates daily_inventory.dipesan and creates audit trail
    // BUT only for same-day orders (invoice date = today)
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
      // ✅ SAME-DAY ORDER: Record inventory transaction immediately
      this.logger.log(
        `[ORDER ${orderNumber}] Same-day order detected - recording inventory transactions`,
      );

      // ✅ FIX: Use original items array instead of createdOrderItems
      // to ensure we have correct productCodeId and quantity
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const orderItem = createdOrderItems[i];

        try {
          await this.inventoryTransactionService.recordSale(
            {
              productCodeId: item.productCodeId,
              quantity: item.quantity,
              orderId: savedOrder.id,
              invoiceDate: invoiceDate, // Pass Date object
              notes: createOrderDto.customerNotes,
            },
            userId,
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
      // ✅ FUTURE-DATED ORDER: Skip inventory transaction for now
      this.logger.log(
        `[ORDER ${orderNumber}] Future-dated order (invoice: ${invoiceDate.toISOString().split('T')[0]}) - skipping inventory transaction`,
      );
      this.logger.log(
        `[ORDER ${orderNumber}] Inventory will be reserved when invoice date arrives`,
      );
    }

    // Return created order with items
    const createdOrder = await this.findOne(savedOrder.id);

    return this._success('Order created successfully', createdOrder.data);
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

    // ✅ Check if invoice date is today (same-day order)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
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

    return this._success(`Data pesanan dengan ID ${id} berhasil dihapus.`);
  }
}
