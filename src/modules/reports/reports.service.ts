import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { Orders } from '../orders/entity/orders.entity';
import { OrderItems } from '../orders/entity/order_items.entity';
import * as ExcelJS from 'exceljs';
import { Workbook } from 'exceljs';
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
import { ProductSalesExportQueryDto } from './dto/product-sales-export.dto';

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
    // Note: ProductCodes entity has incorrectly named relations (product, category, size are entities, not numbers)
    const queryBuilder = this.ordersRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.orderItems', 'orderItems')
      .leftJoinAndSelect('orderItems.productCode', 'productCode')
      .leftJoinAndSelect('productCode.product', 'product') // product is actually the Products entity
      .leftJoinAndSelect('productCode.category', 'category') // ✅ SWAPPED: productCode.category = Main Category (level 0)
      .leftJoinAndSelect('productCode.size', 'size') // size is actually the ProductSizes entity
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
    queryBuilder.orderBy('order.invoiceNumber', 'DESC');

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
  /**
   * ✅ OPTIMIZED: Get Customer Sales Report with SQL Aggregation
   * No longer fetching all rows into memory.
   * Uses GROUP BY to calculate totals efficiently.
   */
  async getCustomerSalesReport(
    query: CustomerSalesReportQueryDto,
  ): Promise<CustomerSalesReportResponseDto> {
    const { from, to, customerType, search, page, pageSize, limit } = query;

    // 1. Calculate Pagination Limit/Offset
    const take = pageSize || 10;
    const skip = limit || 0;

    // 2. Build Query using GROUP BY
    // We join OrderItems to calculate accurate totals (Units, DPP, NetSales)
    const queryBuilder = this.ordersRepository
      .createQueryBuilder('order')
      .leftJoin('order.customer', 'customer')
      .leftJoin('order.orderItems', 'orderItems')
      .select([
        'customer.id AS customerId',
        'customer.customerCode AS customerCode',
        'customer.customerName AS customerName',
        'customer.customerType AS customerType',
      ])
      // Aggregates
      .addSelect('COUNT(DISTINCT order.id)', 'totalInvoices')
      .addSelect('SUM(orderItems.quantity)', 'totalUnits')
      // Net Sales calculation (DPP - Discount)
      // DPP = Qty * Price
      // Discount = (DPP * Disc%) / 100
      // Net = DPP - Discount
      .addSelect('SUM(orderItems.quantity * orderItems.unitPrice)', 'totalDPP')
      .addSelect(
        'SUM((orderItems.quantity * orderItems.unitPrice) - ((orderItems.quantity * orderItems.unitPrice * orderItems.discountPercentage) / 100))',
        'totalNetSales',
      )
      .where('order.invoiceNumber IS NOT NULL')
      .andWhere('(order.isDeleted = :isDeleted OR order.isDeleted IS NULL)', {
        isDeleted: false,
      });

    // Filters
    if (from) {
      queryBuilder.andWhere('order.invoiceDate >= :from', { from });
    }
    if (to) {
      queryBuilder.andWhere('order.invoiceDate <= :to', { to });
    }
    if (customerType) {
      queryBuilder.andWhere('customer.customerType = :customerType', {
        customerType,
      });
    }
    if (search) {
      queryBuilder.andWhere('customer.customerName LIKE :search', {
        search: `%${search}%`,
      });
    }

    // Grouping & Sorting
    queryBuilder
      .groupBy('customer.id')
      .addGroupBy('customer.customerCode')
      .addGroupBy('customer.customerName')
      .addGroupBy('customer.customerType')
      .orderBy('totalNetSales', 'DESC'); // Default sort by Highest Sales

    // 3. Get Count (for Pagination) - needs separate query or count of distinct customers
    // getManyAndCount doesn't work well with GROUP BY for 'count'
    const countQuery = this.ordersRepository
      .createQueryBuilder('order')
      .leftJoin('order.customer', 'customer')
      .select('COUNT(DISTINCT customer.id)', 'total')
      .where('order.invoiceNumber IS NOT NULL')
      .andWhere('(order.isDeleted = :isDeleted OR order.isDeleted IS NULL)', {
        isDeleted: false,
      });

    // Apply same filters to count query
    if (from) countQuery.andWhere('order.invoiceDate >= :from', { from });
    if (to) countQuery.andWhere('order.invoiceDate <= :to', { to });
    if (customerType)
      countQuery.andWhere('customer.customerType = :customerType', {
        customerType,
      });
    if (search)
      countQuery.andWhere('customer.customerName LIKE :search', {
        search: `%${search}%`,
      });

    const countResult = await countQuery.getRawOne();
    const total = parseInt(countResult?.total || '0');

    // 4. Get Data
    const rawData = await queryBuilder.limit(take).offset(skip).getRawMany();

    // 5. Transform Aggregated Data
    const customers: CustomerSalesDataDto[] = rawData.map((row) => {
      const totalDPP = Number(row.totalDPP || 0);
      const totalNetSales = Number(row.totalNetSales || 0);

      // Calculate Average Discount % from totals
      // (TotalDPP - TotalNet) / TotalDPP * 100
      const totalDiscountAmount = totalDPP - totalNetSales;
      const totalDiscount =
        totalDPP > 0 ? (totalDiscountAmount / totalDPP) * 100 : 0;

      return {
        customerId: row.customerId,
        customerCode: row.customerCode,
        customerName: row.customerName,
        customerType: row.customerType,
        totalInvoices: Number(row.totalInvoices),
        totalUnits: Number(row.totalUnits),
        totalDPP: Number(totalDPP.toFixed(2)),
        totalDiscount: Number(totalDiscount.toFixed(2)),
        totalNetSales: Number(totalNetSales.toFixed(2)),
        invoices: [], // Lazy loaded later
      };
    });

    // 6. Get Summary (Fast Aggregate)
    // We can reuse the total calculation logic or simple query
    const summary = await this.getCustomerReportSummary(query);

    return {
      data: customers,
      summary,
      pagination: {
        total,
        page: page!,
        pageSize: pageSize!,
      },
    };
  }

  /**
   * Helper: Get Summary for Customer Reports
   */
  async getCustomerReportSummary(
    query: CustomerSalesReportQueryDto,
  ): Promise<CustomerSalesReportSummaryDto> {
    const { from, to, customerType, search } = query;

    const queryBuilder = this.ordersRepository
      .createQueryBuilder('order')
      .leftJoin('order.customer', 'customer')
      .leftJoin('order.orderItems', 'orderItems')
      .select([
        'COUNT(DISTINCT order.id) as totalInvoices',
        'COUNT(DISTINCT customer.id) as totalCustomers',
        'SUM((orderItems.quantity * orderItems.unitPrice) - ((orderItems.quantity * orderItems.unitPrice * orderItems.discountPercentage) / 100)) as totalRevenue',
        'SUM(orderItems.quantity * orderItems.unitPrice) as totalDPP',
      ])
      .where('order.invoiceNumber IS NOT NULL')
      .andWhere('(order.isDeleted = :isDeleted OR order.isDeleted IS NULL)', {
        isDeleted: false,
      });

    if (from) queryBuilder.andWhere('order.invoiceDate >= :from', { from });
    if (to) queryBuilder.andWhere('order.invoiceDate <= :to', { to });
    if (customerType)
      queryBuilder.andWhere('customer.customerType = :customerType', {
        customerType,
      });
    if (search)
      queryBuilder.andWhere('customer.customerName LIKE :search', {
        search: `%${search}%`,
      });

    const result = await queryBuilder.getRawOne();

    const totalRevenue = Number(result.totalRevenue || 0);
    const totalCustomers = Number(result.totalCustomers || 0);
    const totalDPP = Number(result.totalDPP || 0);

    const avgPerCustomer =
      totalCustomers > 0 ? totalRevenue / totalCustomers : 0;
    const totalDiscountAmount = totalDPP - totalRevenue;
    const avgDiscount =
      totalDPP > 0 ? (totalDiscountAmount / totalDPP) * 100 : 0;

    return {
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalInvoices: Number(result.totalInvoices || 0),
      totalCustomers,
      avgPerCustomer: Number(avgPerCustomer.toFixed(2)),
      avgDiscount: Number(avgDiscount.toFixed(2)),
    };
  }

  /**
   * ✅ NEW Endpoint for Lazy Loading: Get Invoices for Specific Customer
   */
  async getCustomerInvoices(
    customerId: number,
    query: CustomerSalesReportQueryDto,
  ): Promise<InvoiceDetailDto[]> {
    const { from, to } = query;

    const queryBuilder = this.ordersRepository
      .createQueryBuilder('order')
      .leftJoin('order.orderItems', 'orderItems')
      .select([
        'order.invoiceNumber AS invoiceNumber',
        'order.invoiceDate AS invoiceDate',
        'SUM(orderItems.quantity) AS unit',
        'SUM(orderItems.quantity * orderItems.unitPrice) AS dpp',
        'SUM((orderItems.quantity * orderItems.unitPrice) - ((orderItems.quantity * orderItems.unitPrice * orderItems.discountPercentage) / 100)) AS netSales',
      ])
      .where('order.customerId = :customerId', { customerId })
      .andWhere('order.invoiceNumber IS NOT NULL')
      .andWhere('(order.isDeleted = :isDeleted OR order.isDeleted IS NULL)', {
        isDeleted: false,
      });

    if (from) queryBuilder.andWhere('order.invoiceDate >= :from', { from });
    if (to) queryBuilder.andWhere('order.invoiceDate <= :to', { to });

    queryBuilder
      .groupBy('order.id')
      .addGroupBy('order.invoiceNumber')
      .addGroupBy('order.invoiceDate')
      .orderBy('order.invoiceNumber', 'DESC');

    const rawData = await queryBuilder.getRawMany();

    return rawData.map((row) => {
      const dpp = Number(row.dpp || 0);
      const netSales = Number(row.netSales || 0);
      const discountAmount = dpp - netSales;
      const discount = dpp > 0 ? (discountAmount / dpp) * 100 : 0;

      return {
        invoiceNumber: row.invoiceNumber,
        invoiceDate: row.invoiceDate,
        unit: Number(row.unit),
        dpp: Number(dpp.toFixed(2)),
        discount: Number(discount.toFixed(2)),
        netSales: Number(netSales.toFixed(2)),
      };
    });
  }

  // ============================================================================
  // CUSTOMER SALES EXCEL EXPORT
  // ============================================================================

  /**
   * Generate Excel file for Customer Sales Report
   * Returns buffer for immediate download or saves to temp storage for queued jobs
   */
  async generateCustomerSalesExcel(
    query: CustomerSalesReportQueryDto,
    metadata: {
      userName: string;
      exportedAt: string;
    },
  ): Promise<{ buffer: Buffer; recordCount: number; fileName: string }> {
    // Step 1: Fetch ALL data (bypass pagination for export)
    const { from, to, customerType, search } = query;

    // Build query without pagination
    const queryBuilder = this.ordersRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.orderItems', 'orderItems')
      .leftJoinAndSelect('orderItems.productCode', 'productCode')
      .leftJoinAndSelect('productCode.product', 'product')
      .leftJoinAndSelect('productCode.category', 'category') // ✅ SWAPPED: productCode.category = Main Category (level 0)
      .leftJoinAndSelect('productCode.size', 'size')
      .where('order.invoiceNumber IS NOT NULL')
      .andWhere('(order.isDeleted = :isDeleted OR order.isDeleted IS NULL)', {
        isDeleted: false,
      });

    // Apply filters
    if (from) {
      queryBuilder.andWhere('order.invoiceDate >= :from', { from });
    }
    if (to) {
      queryBuilder.andWhere('order.invoiceDate <= :to', { to });
    }
    if (customerType) {
      queryBuilder.andWhere('customer.customerType = :customerType', {
        customerType,
      });
    }
    if (search) {
      queryBuilder.andWhere('customer.customerName LIKE :search', {
        search: `%${search}%`,
      });
    }

    // Order by invoice date DESC (most recent first)
    queryBuilder.orderBy('order.invoiceNumber', 'DESC');

    const orders = await queryBuilder.getMany();

    // Validation: Check max records limit (10,000)
    const totalRecords = orders.reduce(
      (sum, order) => sum + order.orderItems.length,
      0,
    );
    if (totalRecords > 10000) {
      throw new BadRequestException(
        `Data terlalu besar (${totalRecords.toLocaleString('id-ID')} record). Maksimal 10,000 record. Silakan pilih periode yang lebih kecil.`,
      );
    }

    // Step 2: Transform to aggregated structure (1 row per invoice)
    // Human-Centered: Customer report shows totals per invoice, NOT per item
    interface ExcelRow {
      tanggal: Date;
      noInvoice: string;
      namaPelanggan: string;
      type: string;
      kode: string; // Empty for aggregated view
      namaBarang: string; // Always 'TOTAL' for aggregated view
      unit: number; // Total units in this invoice
      priceList: string; // Empty for aggregated view
      dpp: number; // Total DPP for this invoice
      disc: number; // Average discount percentage
      netSales: number; // Total net sales for this invoice
    }

    const rows: ExcelRow[] = [];
    let grandTotalUnit = 0;
    let grandTotalDPP = 0;
    let grandTotalNetSales = 0;

    // Aggregate per invoice (NOT per item)
    orders.forEach((order) => {
      let invoiceTotalUnit = 0;
      let invoiceTotalDPP = 0;
      let invoiceTotalNetSales = 0;
      let invoiceTotalDiscount = 0;
      let invoiceTotalPriceList = 0;

      order.orderItems.forEach((item) => {
        const dpp = item.quantity * item.unitPrice;
        const discountAmount = (dpp * item.discountPercentage) / 100;
        const netSales = dpp - discountAmount;

        invoiceTotalUnit += item.quantity;
        invoiceTotalDPP += dpp;
        invoiceTotalNetSales += netSales;
        invoiceTotalDiscount += item.discountPercentage;
        invoiceTotalPriceList += item.unitPrice;
      });

      // Calculate averages
      const itemCount = order.orderItems.length;
      const avgDiscount = itemCount > 0 ? invoiceTotalDiscount / itemCount : 0;
      const avgPriceList =
        itemCount > 0 ? invoiceTotalPriceList / itemCount : 0;

      // Add ONE row per invoice (aggregated)
      rows.push({
        tanggal: order.invoiceDate,
        noInvoice: order.invoiceNumber,
        namaPelanggan: order.customerName,
        type: order.customer.customerType,
        kode: '', // Empty for customer report (aggregated view)
        namaBarang: 'TOTAL', // Fixed label for customer report
        unit: invoiceTotalUnit,
        priceList: '', // Empty for customer report (aggregated view)
        dpp: invoiceTotalDPP,
        disc: avgDiscount,
        netSales: invoiceTotalNetSales,
      });

      grandTotalUnit += invoiceTotalUnit;
      grandTotalDPP += invoiceTotalDPP;
      grandTotalNetSales += invoiceTotalNetSales;
    });

    // Step 3: Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Laporan Penjualan', {
      properties: { defaultColWidth: 15 },
    });

    // Step 4: Add metadata header (rows 1-5)
    const periodText = this.formatPeriodText(from, to);

    worksheet.mergeCells('A1:K1');
    const titleRow = worksheet.getCell('A1');
    titleRow.value = 'LAPORAN PENJUALAN PER PELANGGAN';
    titleRow.font = { size: 16, bold: true };
    titleRow.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells('A2:K2');
    const periodRow = worksheet.getCell('A2');
    periodRow.value = `Periode: ${periodText}`;
    periodRow.font = { size: 12, bold: true };
    periodRow.alignment = { horizontal: 'center' };

    worksheet.mergeCells('A3:K3');
    const exportRow = worksheet.getCell('A3');
    exportRow.value = `Di-export pada: ${metadata.exportedAt}`;
    exportRow.font = { size: 10 };
    exportRow.alignment = { horizontal: 'center' };

    worksheet.mergeCells('A4:K4');
    const userRow = worksheet.getCell('A4');
    userRow.value = `Oleh: ${metadata.userName}`;
    userRow.font = { size: 10 };
    userRow.alignment = { horizontal: 'center' };

    // Empty row for spacing
    worksheet.addRow([]);

    // Step 5: Add column headers (row 6)
    const headerRow = worksheet.addRow([
      'Tanggal',
      'No Invoice',
      'Nama Pelanggan',
      'Type',
      'Kode',
      'Nama Barang',
      'Unit',
      'Price List',
      'DPP',
      'Disc',
      'Net Sales',
    ]);

    // Apply header styling to all 11 columns (A-K)
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (colNumber <= 11) {
        // Apply to columns A-K
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4472C4' }, // Blue background
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
    });
    headerRow.height = 25;

    // Step 6: Add data rows (Kode and Price List columns exist but values are empty)
    rows.forEach((row) => {
      const excelRow = worksheet.addRow([
        row.tanggal,
        row.noInvoice,
        row.namaPelanggan,
        row.type,
        row.kode, // Empty value
        row.namaBarang,
        row.unit,
        row.priceList, // Empty value
        row.dpp,
        row.disc,
        row.netSales,
      ]);

      // Format cells with 11 columns (Kode and Price List empty but formatted)
      excelRow.getCell(1).numFmt = 'dd-mmm-yy'; // Date format
      excelRow.getCell(7).numFmt = '#,##0'; // Unit (no decimals)
      excelRow.getCell(8).numFmt = 'Rp #,##0'; // Price List (empty value)
      excelRow.getCell(9).numFmt = 'Rp #,##0'; // DPP
      excelRow.getCell(10).numFmt = '0.00"%"'; // Discount percentage
      excelRow.getCell(11).numFmt = 'Rp #,##0'; // Net Sales
    });

    // Step 7: Add grand total footer (11 columns with empty Kode and Price List)
    const totalRow = worksheet.addRow([
      '',
      '',
      '',
      '',
      '', // Empty Kode column
      'GRAND TOTAL',
      grandTotalUnit,
      '', // Empty Price List column
      grandTotalDPP,
      '',
      grandTotalNetSales,
    ]);

    // Apply styling to all 11 columns (A-K)
    totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (colNumber <= 11) {
        // Apply to columns A-K
        cell.font = { bold: true, size: 12 };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFF2CC' }, // Light yellow background
        };

        // Special formatting for specific cells
        if (colNumber === 6) {
          // Column F: GRAND TOTAL label
          cell.alignment = { horizontal: 'right' };
        } else if (colNumber === 7) {
          // Column G: Total Unit
          cell.numFmt = '#,##0';
        } else if (colNumber === 9) {
          // Column I: Total DPP
          cell.numFmt = 'Rp #,##0';
        } else if (colNumber === 11) {
          // Column K: Total Net Sales
          cell.numFmt = 'Rp #,##0';
        }
      }
    });

    // Step 8: Format columns (11 columns total - Kode and Price List exist but values empty)
    worksheet.columns = [
      { key: 'tanggal', width: 12 }, // A
      { key: 'noInvoice', width: 22 }, // B
      { key: 'namaPelanggan', width: 35 }, // C
      { key: 'type', width: 15 }, // D
      { key: 'kode', width: 18 }, // E (column exists, values empty)
      { key: 'namaBarang', width: 40 }, // F
      { key: 'unit', width: 10 }, // G
      { key: 'priceList', width: 15 }, // H (column exists, values empty)
      { key: 'dpp', width: 15 }, // I
      { key: 'disc', width: 10 }, // J
      { key: 'netSales', width: 15 }, // K
    ];

    // Step 9: Freeze panes (header row stays visible when scrolling)
    worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 6 }]; // Freeze first 6 rows

    // Step 10: Add borders to all cells
    const borderStyle: Partial<ExcelJS.Border> = {
      style: 'thin',
      color: { argb: 'FF000000' },
    };

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber >= 6) {
        // Only data rows and header
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.border = {
            top: borderStyle,
            left: borderStyle,
            bottom: borderStyle,
            right: borderStyle,
          };
        });
      }
    });

    // Step 11: Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Step 12: Generate filename
    const fileName = this.generateExcelFileName(from, to);

    return {
      buffer: Buffer.from(buffer),
      recordCount: rows.length,
      fileName,
    };
  }

  /**
   * Format period text for display
   */
  private formatPeriodText(from?: Date, to?: Date): string {
    const formatDate = (date: Date) => {
      return new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(date);
    };

    if (from && to) {
      return `${formatDate(from)} - ${formatDate(to)}`;
    } else if (from) {
      return `Sejak ${formatDate(from)}`;
    } else if (to) {
      return `Sampai ${formatDate(to)}`;
    } else {
      return 'Semua Periode';
    }
  }

  /**
   * Generate Excel filename based on period
   */
  private generateExcelFileName(from?: Date, to?: Date): string {
    const now = new Date();
    const timestamp = new Intl.DateTimeFormat('id-ID', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .format(now)
      .replace(/\//g, '')
      .replace(/:/g, '')
      .replace(/, /g, '_');

    let periodPart = 'AllPeriod';

    if (from && to) {
      const formatShort = (date: Date) => {
        return new Intl.DateTimeFormat('id-ID', {
          month: 'short',
          year: 'numeric',
        })
          .format(date)
          .replace(/ /g, '');
      };

      if (
        from.getMonth() === to.getMonth() &&
        from.getFullYear() === to.getFullYear()
      ) {
        // Same month
        periodPart = formatShort(from);
      } else {
        // Different months
        periodPart = `${formatShort(from)}-${formatShort(to)}`;
      }
    } else if (from) {
      periodPart = `From${new Intl.DateTimeFormat('id-ID', { month: 'short', year: 'numeric' }).format(from).replace(/ /g, '')}`;
    } else if (to) {
      periodPart = `Until${new Intl.DateTimeFormat('id-ID', { month: 'short', year: 'numeric' }).format(to).replace(/ /g, '')}`;
    }

    return `Laporan_Pelanggan_${periodPart}_${timestamp}.xlsx`;
  }

  // ============================================================================
  // PRODUCT SALES EXCEL EXPORT
  // ============================================================================

  /**
   * Generate Excel file for Product Sales Report (Detail per Item)
   * Returns buffer for immediate download
   * Difference from customer export: Shows EACH order item as separate row
   */
  async generateProductSalesExcel(
    query: ProductSalesExportQueryDto,
    metadata: {
      userName: string;
      exportedAt: string;
    },
  ): Promise<{ buffer: Buffer; recordCount: number; fileName: string }> {
    const { from, to, customerType, productCategory, search, alertsOnly } =
      query;

    // Step 1: Fetch ALL data (bypass pagination for export)
    const queryBuilder = this.ordersRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.orderItems', 'orderItems')
      .leftJoinAndSelect('orderItems.productCode', 'productCode')
      .leftJoinAndSelect('productCode.product', 'product')
      .leftJoinAndSelect('product.category', 'category') // ✅ SWAPPED: productCode.category = Main Category (level 0)
      .leftJoinAndSelect('productCode.size', 'size')
      .where('order.invoiceNumber IS NOT NULL')
      .andWhere('(order.isDeleted = :isDeleted OR order.isDeleted IS NULL)', {
        isDeleted: false,
      });

    // Apply filters
    if (from) {
      queryBuilder.andWhere('order.invoiceDate >= :from', { from });
    }
    if (to) {
      queryBuilder.andWhere('order.invoiceDate <= :to', { to });
    }
    if (customerType) {
      queryBuilder.andWhere('customer.customerType = :customerType', {
        customerType,
      });
    }
    if (productCategory) {
      queryBuilder.andWhere('category.name = :productCategory', {
        productCategory,
      });
    }
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

    // Order by invoice date DESC (most recent first)
    queryBuilder.orderBy('order.invoiceNumber', 'DESC');

    const orders = await queryBuilder.getMany();

    // Validation: Check max records limit (10,000)
    const totalRecords = orders.reduce(
      (sum, order) => sum + order.orderItems.length,
      0,
    );
    if (totalRecords > 10000) {
      throw new BadRequestException(
        `Data terlalu besar (${totalRecords} record). Maksimal 10,000 record per export. Silakan persempit filter tanggal atau kategori.`,
      );
    }

    // Step 2: Transform to grouped structure (1 row per order item + TOTAL row per invoice)
    interface ExcelRow {
      tanggal: Date | null; // null for TOTAL rows
      noInvoice: string;
      namaPelanggan: string;
      type: string;
      kode: string;
      namaBarang: string;
      unit: number;
      priceList: number | null; // null for TOTAL rows
      dpp: number;
      disc: number | null; // null for TOTAL rows
      netSales: number;
      hasAnomalies?: boolean; // Flag for highlighting
      isSubtotal?: boolean; // Flag for invoice TOTAL rows
    }

    const rows: ExcelRow[] = [];
    let grandTotalUnit = 0;
    let grandTotalDPP = 0;
    let grandTotalNetSales = 0;

    // For data quality detection (reuse existing logic)
    const invoicesWithItems = orders.map((order) =>
      this.transformOrderToInvoiceDto(order),
    );
    const dataQualityIssues = this.detectDataQualityIssues(invoicesWithItems);

    // Create a map of invoice items with anomalies for quick lookup
    const anomalyMap = new Map<string, boolean>(); // key: `${invoiceId}-${productCode}`
    dataQualityIssues.forEach((issue) => {
      issue.affectedInvoices.forEach((invoiceNumber) => {
        const invoice = invoicesWithItems.find(
          (inv) => inv.invoiceNumber === invoiceNumber,
        );
        if (invoice) {
          invoice.items.forEach((item) => {
            if (
              item.hasPriceVariance ||
              item.isDuplicate ||
              item.isBelowCost ||
              item.hasNegativeQty
            ) {
              anomalyMap.set(`${invoice.invoiceId}-${item.productCode}`, true);
            }
          });
        }
      });
    });

    // Apply alertsOnly filter if requested
    let filteredOrders = orders;
    if (alertsOnly) {
      filteredOrders = orders.filter((order) => {
        const invoice = invoicesWithItems.find(
          (inv) => inv.invoiceId === order.id,
        );
        return invoice?.hasAnomalies;
      });
    }

    // Process each order and add items + subtotal row
    filteredOrders.forEach((order) => {
      let invoiceSubtotalUnit = 0;
      let invoiceSubtotalDPP = 0;
      let invoiceSubtotalNetSales = 0;

      // Add all items for this invoice
      order.orderItems.forEach((item) => {
        const dpp = item.quantity * item.unitPrice;
        const discountAmount = (dpp * item.discountPercentage) / 100;
        const netSales = dpp - discountAmount;

        // Construct product name from category + product + size
        const productName = item.productCode?.product?.name || 'N/A';
        const categoryName = item.productCode?.product?.category?.name || '';
        const sizeName = item.productCode?.size?.sizeValue || '';
        const productType =
          item.productCode?.product?.category?.name === 'Simple Syrup'
            ? ''
            : item.productCode?.product?.productType;
        const namaBarang = `${productName} ${categoryName.toUpperCase()} ${productType} @ ${sizeName}`;

        // Check if this item has anomalies
        const hasAnomalies = anomalyMap.has(
          `${order.id}-${item.productCode?.productCode}`,
        );

        rows.push({
          tanggal: order.invoiceDate,
          noInvoice: order.invoiceNumber,
          namaPelanggan: order.customerName,
          type: order.customer.customerType,
          kode: item.productCode?.productCode || 'N/A',
          namaBarang,
          unit: item.quantity,
          priceList: item.unitPrice,
          dpp,
          disc: item.discountPercentage,
          netSales,
          hasAnomalies,
          isSubtotal: false,
        });

        // Accumulate invoice subtotal
        invoiceSubtotalUnit += item.quantity;
        invoiceSubtotalDPP += dpp;
        invoiceSubtotalNetSales += netSales;

        // Accumulate grand total
        grandTotalUnit += item.quantity;
        grandTotalDPP += dpp;
        grandTotalNetSales += netSales;
      });

      // Add TOTAL row for this invoice (pemisah antar invoice)
      rows.push({
        tanggal: order.invoiceDate, // No date for subtotal row
        noInvoice: order.invoiceNumber,
        namaPelanggan: order.customerName,
        type: order.customer.customerType,
        kode: '',
        namaBarang: 'TOTAL',
        unit: invoiceSubtotalUnit,
        priceList: null, // No price list for subtotal
        dpp: invoiceSubtotalDPP,
        disc: null, // No discount for subtotal
        netSales: invoiceSubtotalNetSales,
        hasAnomalies: false,
        isSubtotal: true, // Mark as subtotal row for special styling
      });
    });

    // Step 3: Create Excel workbook
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Laporan Penjualan', {
      properties: { defaultColWidth: 15 },
    });

    // Step 4: Add metadata header (rows 1-5)
    const periodText = this.formatPeriodText(from, to);

    worksheet.mergeCells('A1:K1');
    const titleRow = worksheet.getCell('A1');
    titleRow.value = 'LAPORAN PENJUALAN PER PRODUK DETAIL';
    titleRow.font = { size: 16, bold: true };
    titleRow.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells('A2:K2');
    const periodRow = worksheet.getCell('A2');
    periodRow.value = `Periode: ${periodText}`;
    periodRow.font = { size: 12, bold: true };
    periodRow.alignment = { horizontal: 'center' };

    worksheet.mergeCells('A3:K3');
    const exportRow = worksheet.getCell('A3');
    exportRow.value = `Di-export pada: ${metadata.exportedAt}`;
    exportRow.font = { size: 10 };
    exportRow.alignment = { horizontal: 'center' };

    worksheet.mergeCells('A4:K4');
    const userRow = worksheet.getCell('A4');
    userRow.value = `Oleh: ${metadata.userName}`;
    userRow.font = { size: 10 };
    userRow.alignment = { horizontal: 'center' };

    // Empty row for spacing
    worksheet.addRow([]);

    // Step 5: Add column headers (row 6) - matching capture exactly
    const headerRow = worksheet.addRow([
      'Tanggal',
      'No Invoice',
      'Nama Pelanggan',
      'Type',
      'Kode',
      'Nama Barang',
      'Unit',
      'Price List',
      'DPP',
      'Disc',
      'Net Sales',
    ]);

    // Apply header styling only to columns A-K
    headerRow.eachCell(
      { includeEmpty: false },
      (cell: ExcelJS.Cell, colNumber: number) => {
        if (colNumber <= 11) {
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4472C4' }, // Blue background
          };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      },
    );
    headerRow.height = 25;

    // Step 6: Add data rows with formatting and conditional highlighting
    rows.forEach((row) => {
      const excelRow = worksheet.addRow([
        row.tanggal, // Will be null for TOTAL rows
        row.noInvoice,
        row.namaPelanggan,
        row.type,
        row.kode,
        row.namaBarang,
        row.unit,
        row.priceList, // Will be null for TOTAL rows
        row.dpp,
        row.disc, // Will be null for TOTAL rows
        row.netSales,
      ]);

      // Apply styling based on row type
      if (row.isSubtotal) {
        // SUBTOTAL row styling (bold font, no background for subtotal per invoice)
        excelRow.eachCell(
          { includeEmpty: true },
          (cell: ExcelJS.Cell, colNumber: number) => {
            if (colNumber <= 11) {
              cell.font = { bold: true };

              // Format numbers in subtotal row
              if (colNumber === 7) {
                cell.numFmt = '#,##0'; // Unit
              } else if (colNumber === 9) {
                cell.numFmt = 'Rp #,##0'; // DPP
              } else if (colNumber === 11) {
                cell.numFmt = 'Rp #,##0'; // Net Sales
              }
            }
          },
        );
      } else {
        // REGULAR item row - apply normal number formatting
        excelRow.getCell(1).numFmt = 'dd-mmm-yy'; // Date format
        excelRow.getCell(7).numFmt = '#,##0'; // Unit (integer)
        excelRow.getCell(8).numFmt = 'Rp #,##0'; // Price List (Rupiah)
        excelRow.getCell(9).numFmt = 'Rp #,##0'; // DPP
        excelRow.getCell(10).numFmt = '0.00"%"'; // Discount percentage
        excelRow.getCell(11).numFmt = 'Rp #,##0'; // Net Sales

        // Highlight rows with anomalies (light yellow background)
        if (row.hasAnomalies) {
          excelRow.eachCell(
            { includeEmpty: true },
            (cell: ExcelJS.Cell, colNumber: number) => {
              if (colNumber <= 11) {
                cell.fill = {
                  type: 'pattern',
                  pattern: 'solid',
                  fgColor: { argb: 'FFFFF9E6' }, // Very light yellow for alerts
                };
              }
            },
          );
        }
      }
    });

    // Step 7: Add grand total footer
    const totalRow = worksheet.addRow([
      'TOTAL', // Show 'TOTAL' text in date column (bold)
      '',
      '',
      '',
      '',
      'GRAND TOTAL',
      grandTotalUnit,
      '',
      grandTotalDPP,
      '',
      grandTotalNetSales,
    ]);

    // Apply styling only to columns A-K
    totalRow.eachCell(
      { includeEmpty: true },
      (cell: ExcelJS.Cell, colNumber: number) => {
        if (colNumber <= 11) {
          cell.font = { bold: true, size: 12 };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFF2CC' }, // Light yellow
          };

          // Conditional formatting per column
          if (colNumber === 1) {
            cell.alignment = { horizontal: 'center' }; // TOTAL text in date column
          } else if (colNumber === 6) {
            cell.alignment = { horizontal: 'right' }; // GRAND TOTAL label
          } else if (colNumber === 7) {
            cell.numFmt = '#,##0'; // Total Unit
          } else if (colNumber === 9) {
            cell.numFmt = 'Rp #,##0'; // Total DPP
          } else if (colNumber === 11) {
            cell.numFmt = 'Rp #,##0'; // Total Net Sales
          }
        }
      },
    );

    // Step 8: Format columns (auto-width) - REMOVED 'kode' column
    worksheet.columns = [
      { key: 'tanggal', width: 12 },
      { key: 'noInvoice', width: 22 },
      { key: 'namaPelanggan', width: 35 },
      { key: 'type', width: 15 },
      { key: 'namaBarang', width: 40 },
      { key: 'unit', width: 10 },
      { key: 'priceList', width: 15 },
      { key: 'dpp', width: 15 },
      { key: 'disc', width: 10 },
      { key: 'netSales', width: 15 },
    ];

    // Step 9: Freeze panes (first 6 rows)
    worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 6 }];

    // Step 10: Add borders to all cells
    const borderStyle: Partial<ExcelJS.Border> = {
      style: 'thin',
      color: { argb: 'FF000000' },
    };

    worksheet.eachRow(
      { includeEmpty: false },
      (row: ExcelJS.Row, rowNumber: number) => {
        if (rowNumber >= 6) {
          // Only data rows (skip metadata)
          row.eachCell({ includeEmpty: true }, (cell: ExcelJS.Cell) => {
            cell.border = {
              top: borderStyle,
              left: borderStyle,
              bottom: borderStyle,
              right: borderStyle,
            };
          });
        }
      },
    );

    // Step 11: Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Step 12: Generate filename
    const fileName = this.generateProductExcelFileName(from, to);

    return {
      buffer: Buffer.from(buffer),
      recordCount: rows.length,
      fileName,
    };
  }

  /**
   * Generate Excel filename for product sales report
   */
  private generateProductExcelFileName(from?: Date, to?: Date): string {
    const now = new Date();
    const timestamp = new Intl.DateTimeFormat('id-ID', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .format(now)
      .replace(/\//g, '')
      .replace(/:/g, '')
      .replace(/, /g, '_');

    let periodPart = 'AllPeriod';

    if (from && to) {
      const formatShort = (date: Date) => {
        return new Intl.DateTimeFormat('id-ID', {
          month: 'short',
          year: 'numeric',
        })
          .format(date)
          .replace(/ /g, '');
      };

      if (
        from.getMonth() === to.getMonth() &&
        from.getFullYear() === to.getFullYear()
      ) {
        periodPart = formatShort(from);
      } else {
        periodPart = `${formatShort(from)}-${formatShort(to)}`;
      }
    } else if (from) {
      periodPart = `From${new Intl.DateTimeFormat('id-ID', { month: 'short', year: 'numeric' }).format(from).replace(/ /g, '')}`;
    } else if (to) {
      periodPart = `Until${new Intl.DateTimeFormat('id-ID', { month: 'short', year: 'numeric' }).format(to).replace(/ /g, '')}`;
    }

    return `Laporan_Produk_${periodPart}_${timestamp}.xlsx`;
  }
}
