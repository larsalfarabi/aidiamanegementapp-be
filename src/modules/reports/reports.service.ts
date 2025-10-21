import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { Orders } from '../orders/entity/orders.entity';
import { OrderItems } from '../orders/entity/order_items.entity';
import {
  ProductSalesReportQueryDto,
  ProductSalesReportResponseDto,
  InvoiceWithItemsDto,
  OrderItemDetailDto,
  DataQualityIssueDto,
  ProductSalesReportSummaryDto,
} from './dto/product-sales-report.dto';
import {
  CustomerSalesReportQueryDto,
  CustomerSalesReportResponseDto,
  CustomerSalesDataDto,
  InvoiceDetailDto,
  CustomerSalesReportSummaryDto,
} from './dto/customer-sales-report.dto';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Orders)
    private readonly ordersRepository: Repository<Orders>,
    @InjectRepository(OrderItems)
    private readonly orderItemsRepository: Repository<OrderItems>,
  ) {}

  /**
   * Get Product Sales Report with pagination, filtering, and data quality validation
   * Optimized with JOIN queries to minimize database calls
   */
  async getProductSalesReport(
    query: ProductSalesReportQueryDto,
  ): Promise<ProductSalesReportResponseDto> {
    const {
      from,
      to,
      customerType,
      productCategory,
      search,
      alertsOnly,
      page,
      pageSize,
      limit,
    } = query;

    // Build query with optimized JOINs
    // Note: ProductCodes entity has incorrectly named relations (productId, categoryId, sizeId are entities, not numbers)
    const queryBuilder = this.ordersRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.orderItems', 'orderItems')
      .leftJoinAndSelect('orderItems.productCode', 'productCode')
      .leftJoinAndSelect('productCode.productId', 'product') // productId is actually the Products entity
      .leftJoinAndSelect('productCode.categoryId', 'category') // categoryId is actually the ProductCategories entity
      .leftJoinAndSelect('productCode.sizeId', 'size') // sizeId is actually the ProductSizes entity
      .where('order.invoiceNumber IS NOT NULL') // Only orders with invoices
      .andWhere('(order.isDeleted = :isDeleted OR order.isDeleted IS NULL)', {
        isDeleted: false,
      }); // Handle both false and NULL as "not deleted"

    // Date range filter
    if (from) {
      queryBuilder.andWhere('order.invoiceDate >= :from', { from });
    }
    if (to) {
      queryBuilder.andWhere('order.invoiceDate <= :to', { to });
    }

    // Customer type filter
    if (customerType) {
      queryBuilder.andWhere('customer.customerType = :customerType', {
        customerType,
      });
    }

    // Product category filter
    if (productCategory) {
      queryBuilder.andWhere('category.name = :productCategory', {
        productCategory,
      });
    }

    // Search filter (invoice number or customer name)
    if (search) {
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('order.invoiceNumber LIKE :search', {
            search: `%${search}%`,
          }).orWhere('customer.customerName LIKE :search', {
            search: `%${search}%`,
          });
        }),
      );
    }

    // Order by invoice date DESC
    queryBuilder.orderBy('order.invoiceDate', 'DESC');
    queryBuilder.addOrderBy('order.invoiceNumber', 'DESC');

    const [result, count] = await queryBuilder
      .take(pageSize)
      .skip(limit)
      .getManyAndCount();

    // Transform to DTO formatp
    const invoicesWithItems: InvoiceWithItemsDto[] = result.map((order) =>
      this.transformOrderToInvoiceDto(order),
    );

    // Detect data quality issues (per customer)
    const dataQualityIssues = this.detectDataQualityIssues(invoicesWithItems);

    // Mark invoices with anomalies
    invoicesWithItems.forEach((invoice) => {
      invoice.hasAnomalies =
        invoice.hasDuplicateItems ||
        invoice.items.some(
          (item) =>
            item.hasPriceVariance ||
            item.isDuplicate ||
            item.isBelowCost ||
            item.hasNegativeQty,
        );
    });

    // Filter by alerts only (if requested)
    let filteredInvoices = invoicesWithItems;
    if (alertsOnly) {
      filteredInvoices = invoicesWithItems.filter(
        (invoice) => invoice.hasAnomalies,
      );
    }

    // Calculate summary
    const summary = this.calculateSummary(filteredInvoices);

    return {
      data: filteredInvoices,
      summary,
      dataQualityIssues,
      pagination: {
        total: count,
        page: page!,
        pageSize: pageSize!,
      },
    };
  }

  /**
   * Transform Order entity to InvoiceWithItemsDto
   */
  private transformOrderToInvoiceDto(order: Orders): InvoiceWithItemsDto {
    const items: OrderItemDetailDto[] = order.orderItems.map((item) => {
      // Calculate DPP (Dasar Pengenaan Pajak)
      const dpp = item.quantity * item.unitPrice;
      const discountAmount = (dpp * item.discountPercentage) / 100;
      const netSales = dpp - discountAmount;

      // Construct product name from denormalized data
      const productName = item.productName; // Already denormalized

      return {
        productCode: item.productCodeValue,
        productName,
        unit: item.quantity,
        priceList: Number(item.unitPrice),
        dpp: Number(dpp),
        discount: Number(item.discountPercentage),
        netSales: Number(netSales),
      };
    });

    // Check for duplicate items in same invoice
    const hasDuplicateItems = this.checkDuplicateItems(items);

    // Calculate invoice totals
    const totalItems = items.length;
    const totalUnits = items.reduce((sum, item) => sum + item.unit, 0);
    const totalDPP = items.reduce((sum, item) => sum + item.dpp, 0);
    const totalNetSales = items.reduce((sum, item) => sum + item.netSales, 0);
    const avgDiscount =
      items.reduce((sum, item) => sum + item.discount, 0) / items.length || 0;

    return {
      invoiceId: order.id,
      invoiceNumber: order.invoiceNumber,
      invoiceDate: order.invoiceDate,
      customerId: order.customerId,
      customerName: order.customerName,
      customerType: order.customer.customerType,
      totalItems,
      totalUnits,
      totalDPP: Number(totalDPP),
      totalDiscount: Number(avgDiscount),
      totalNetSales: Number(totalNetSales),
      items,
      hasDuplicateItems,
    };
  }

  /**
   * Check for duplicate items in same invoice
   */
  private checkDuplicateItems(items: OrderItemDetailDto[]): boolean {
    const productCodes = items.map((item) => item.productCode);
    const uniqueCodes = new Set(productCodes);
    return productCodes.length !== uniqueCodes.size;
  }

  /**
   * Detect data quality issues - PRICE VARIANCE PER CUSTOMER
   * Only flag price differences within same customer
   */
  private detectDataQualityIssues(
    invoices: InvoiceWithItemsDto[],
  ): DataQualityIssueDto[] {
    const issues: DataQualityIssueDto[] = [];

    // Group by customer first
    const customerProductPrices = new Map<
      number,
      Map<string, { price: number; invoices: string[] }>
    >();

    invoices.forEach((invoice) => {
      if (!customerProductPrices.has(invoice.customerId)) {
        customerProductPrices.set(invoice.customerId, new Map());
      }
      const priceMap = customerProductPrices.get(invoice.customerId)!;

      invoice.items.forEach((item) => {
        const key = item.productCode;
        if (!priceMap.has(key)) {
          priceMap.set(key, {
            price: item.priceList,
            invoices: [invoice.invoiceNumber],
          });
        } else {
          const existing = priceMap.get(key)!;
          if (Math.abs(existing.price - item.priceList) > 0.01) {
            // Price variance detected in SAME customer
            item.hasPriceVariance = true;

            issues.push({
              type: 'price_variance',
              severity: 'warning',
              message: `${item.productName} di ${invoice.customerName} memiliki harga berbeda: Rp ${existing.price.toLocaleString('id-ID')} vs Rp ${item.priceList.toLocaleString('id-ID')}`,
              affectedInvoices: [...existing.invoices, invoice.invoiceNumber],
            });
          }
        }
      });
    });

    // Duplicate items in same invoice
    invoices.forEach((invoice) => {
      if (invoice.hasDuplicateItems) {
        // Mark duplicate items
        const seen = new Set<string>();
        invoice.items.forEach((item) => {
          if (seen.has(item.productCode)) {
            item.isDuplicate = true;
          }
          seen.add(item.productCode);
        });

        issues.push({
          type: 'duplicate',
          severity: 'error',
          message: `Invoice ${invoice.invoiceNumber} memiliki item duplikat`,
          affectedInvoices: [invoice.invoiceNumber],
        });
      }
    });

    // Check for negative quantities (returns)
    invoices.forEach((invoice) => {
      invoice.items.forEach((item) => {
        if (item.unit < 0) {
          item.hasNegativeQty = true;
          issues.push({
            type: 'negative_qty',
            severity: 'warning',
            message: `${item.productName} di ${invoice.invoiceNumber} memiliki quantity negatif (retur)`,
            affectedInvoices: [invoice.invoiceNumber],
          });
        }
      });
    });

    return issues;
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(
    invoices: InvoiceWithItemsDto[],
  ): ProductSalesReportSummaryDto {
    const totalRevenue = invoices.reduce(
      (sum, inv) => sum + inv.totalNetSales,
      0,
    );
    const totalItems = invoices.reduce((sum, inv) => sum + inv.totalItems, 0);
    const totalUnits = invoices.reduce((sum, inv) => sum + inv.totalUnits, 0);
    const avgUnitPrice = totalUnits > 0 ? totalRevenue / totalUnits : 0;
    const alertCount = invoices.filter((inv) => inv.hasAnomalies).length;

    return {
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalItems,
      totalUnits,
      avgUnitPrice: Number(avgUnitPrice.toFixed(2)),
      alertCount,
    };
  }

  // ============================================================================
  // CUSTOMER SALES REPORT
  // ============================================================================

  /**
   * Get Customer Sales Report with pagination, filtering, and aggregation
   * Groups data by customer with invoice details
   */
  async getCustomerSalesReport(
    query: CustomerSalesReportQueryDto,
  ): Promise<CustomerSalesReportResponseDto> {
    const { from, to, customerType, search, page, pageSize, limit } = query;

    // Step 1: Build base query to get orders with customer info
    const queryBuilder = this.ordersRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.orderItems', 'orderItems')
      .where('order.invoiceNumber IS NOT NULL') // Only orders with invoices
      .andWhere('(order.isDeleted = :isDeleted OR order.isDeleted IS NULL)', {
        isDeleted: false,
      }); // Handle both false and NULL

    // Date range filter
    if (from) {
      console.log('Date Filter - From:', from, 'Type:', typeof from);
      queryBuilder.andWhere('order.invoiceDate >= :from', { from });
    }
    if (to) {
      console.log('Date Filter - To:', to, 'Type:', typeof to);
      queryBuilder.andWhere('order.invoiceDate <= :to', { to });
    }

    // Customer type filter
    if (customerType) {
      queryBuilder.andWhere('customer.customerType = :customerType', {
        customerType,
      });
    }

    // Search filter (customer name)
    if (search) {
      queryBuilder.andWhere('customer.customerName LIKE :search', {
        search: `%${search}%`,
      });
    }

    // Order by customer name
    queryBuilder.orderBy('customer.customerName', 'ASC');
    queryBuilder.addOrderBy('order.invoiceDate', 'DESC');

    // Execute query
    const allOrders = await queryBuilder.getMany();

    console.log('\n=== CUSTOMER SALES QUERY RESULTS ===');
    console.log('Total Orders Found:', allOrders.length);

    // Step 2: Group orders by customer and aggregate
    const customerMap = new Map<number, CustomerSalesDataDto>();

    allOrders.forEach((order) => {
      const customerId = order.customerId;

      if (!customerMap.has(customerId)) {
        customerMap.set(customerId, {
          customerId,
          customerName: order.customerName,
          customerType: order.customer.customerType,
          totalInvoices: 0,
          totalUnits: 0,
          totalDPP: 0,
          totalDiscount: 0,
          totalNetSales: 0,
          invoices: [],
        });
      }

      const customerData = customerMap.get(customerId)!;

      // Calculate invoice totals
      let invoiceUnits = 0;
      let invoiceDPP = 0;
      let invoiceNetSales = 0;
      let totalDiscountAmount = 0;

      order.orderItems.forEach((item) => {
        const dpp = item.quantity * item.unitPrice;
        const discountAmount = (dpp * item.discountPercentage) / 100;
        const netSales = dpp - discountAmount;

        invoiceUnits += item.quantity;
        invoiceDPP += dpp;
        invoiceNetSales += netSales;
        totalDiscountAmount += discountAmount;
      });

      // Calculate average discount percentage for this invoice
      const avgDiscount =
        invoiceDPP > 0 ? (totalDiscountAmount / invoiceDPP) * 100 : 0;

      // Add invoice detail
      customerData.invoices.push({
        invoiceNumber: order.invoiceNumber,
        invoiceDate: order.invoiceDate,
        unit: invoiceUnits,
        dpp: Number(invoiceDPP.toFixed(2)),
        discount: Number(avgDiscount.toFixed(2)),
        netSales: Number(invoiceNetSales.toFixed(2)),
      });

      // Update customer totals
      customerData.totalInvoices++;
      customerData.totalUnits += invoiceUnits;
      customerData.totalDPP += invoiceDPP;
      customerData.totalNetSales += invoiceNetSales;
    });

    // Calculate average discount for each customer
    customerMap.forEach((customer) => {
      if (customer.totalDPP > 0) {
        const totalDiscountAmount = customer.totalDPP - customer.totalNetSales;
        customer.totalDiscount = Number(
          ((totalDiscountAmount / customer.totalDPP) * 100).toFixed(2),
        );
      }
      // Round totals
      customer.totalDPP = Number(customer.totalDPP.toFixed(2));
      customer.totalNetSales = Number(customer.totalNetSales.toFixed(2));
    });

    // Convert Map to Array and sort by totalNetSales DESC
    const allCustomers = Array.from(customerMap.values()).sort(
      (a, b) => b.totalNetSales - a.totalNetSales,
    );

    console.log('Unique Customers:', allCustomers.length);
    console.log('=== END RESULTS ===\n');

    // Step 3: Apply pagination
    const total = allCustomers.length;
    const startIndex = limit || 0;
    const endIndex = startIndex + (pageSize || 10);
    const paginatedCustomers = allCustomers.slice(startIndex, endIndex);

    // Step 4: Calculate summary
    const summary = this.calculateCustomerSummary(allCustomers);

    return {
      data: paginatedCustomers,
      summary,
      pagination: {
        total,
        page: page!,
        pageSize: pageSize!,
      },
    };
  }

  /**
   * Calculate summary statistics for customer sales report
   */
  private calculateCustomerSummary(
    customers: CustomerSalesDataDto[],
  ): CustomerSalesReportSummaryDto {
    const totalRevenue = customers.reduce((sum, c) => sum + c.totalNetSales, 0);
    const totalInvoices = customers.reduce(
      (sum, c) => sum + c.totalInvoices,
      0,
    );
    const totalCustomers = customers.length;
    const avgPerCustomer =
      totalCustomers > 0 ? totalRevenue / totalCustomers : 0;

    // Calculate weighted average discount
    const totalDPP = customers.reduce((sum, c) => sum + c.totalDPP, 0);
    const totalDiscountAmount = totalDPP - totalRevenue;
    const avgDiscount =
      totalDPP > 0 ? (totalDiscountAmount / totalDPP) * 100 : 0;

    return {
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalInvoices,
      totalCustomers,
      avgPerCustomer: Number(avgPerCustomer.toFixed(2)),
      avgDiscount: Number(avgDiscount.toFixed(2)),
    };
  }
}
