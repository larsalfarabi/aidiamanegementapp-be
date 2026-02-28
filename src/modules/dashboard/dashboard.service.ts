import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Orders } from '../orders/entity/orders.entity';
import { OrderItems } from '../orders/entity/order_items.entity';
import { Customers } from '../customers/entity/customers.entity';
import { DailyInventory } from '../inventory/entity/daily-inventory.entity';
import {
  ProductionBatches,
  BatchStatus,
} from '../production/entities/production-batches.entity';
import { SalesChartDto } from './dto/sales-chart.dto';
import {
  DashboardStatsDto,
  DashboardStatsV2Dto,
  RecentActivityDto,
  TopProductDto,
  SalesByCustomerTypeDto,
  ProductionSummaryDto,
  LowStockSummaryDto,
  ActiveCustomersByTypeDto,
  AvailableMonthDto,
} from './dto/dashboard.dto';
import * as dayjs from 'dayjs';
import * as relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/id';

dayjs.extend(relativeTime);
dayjs.locale('id');

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Orders)
    private readonly ordersRepository: Repository<Orders>,
    @InjectRepository(OrderItems)
    private readonly orderItemsRepository: Repository<OrderItems>,
    @InjectRepository(Customers)
    private readonly customersRepository: Repository<Customers>,
    @InjectRepository(DailyInventory)
    private readonly dailyInventoryRepository: Repository<DailyInventory>,
    @InjectRepository(ProductionBatches)
    private readonly productionBatchesRepository: Repository<ProductionBatches>,
  ) {}

  /**
   * Get available months for dashboard filter based on existing orders
   * Uses simple GROUP BY to be efficient.
   */
  async getAvailableMonths(): Promise<AvailableMonthDto[]> {
    const dates = await this.ordersRepository
      .createQueryBuilder('order')
      .select('YEAR(order.invoiceDate)', 'year')
      .addSelect('MONTH(order.invoiceDate)', 'month')
      .where('order.invoiceNumber IS NOT NULL')
      .andWhere('(order.isDeleted IS NULL OR order.isDeleted = :isDeleted)', {
        isDeleted: false,
      })
      .groupBy('year, month')
      .orderBy('year', 'DESC')
      .addOrderBy('month', 'DESC')
      .getRawMany();

    return dates.map((d) => ({
      year: Number(d.year),
      month: Number(d.month),
    }));
  }

  /**
   * Helper to get start and end dates for a filter
   * If year/month provided, returns start/end of that month
   * If not, returns start/end of current month
   */
  private getDateRange(year?: number, month?: number) {
    let start: dayjs.Dayjs;
    let end: dayjs.Dayjs;

    if (year && month) {
      // Month is 1-indexed in UI usually, dayjs takes 0-11
      // We assume input is 1-12
      start = dayjs()
        .year(year)
        .month(month - 1)
        .startOf('month');
      end = start.endOf('month');
    } else {
      start = dayjs().startOf('month');
      end = dayjs().endOf('month');
    }

    return {
      start: start.toDate(), // Date object for TypeORM
      end: end.toDate(),
      startStr: start.format('YYYY-MM-DD'),
      endStr: end.format('YYYY-MM-DD'),
      startDayjs: start,
    };
  }

  async getSalesChartData(
    year?: number,
    month?: number,
  ): Promise<SalesChartDto[]> {
    // If specific month selected, show context ending at that month
    // Default: 12 months ending now

    let endDate = dayjs();
    if (year && month) {
      endDate = dayjs()
        .year(year)
        .month(month - 1)
        .endOf('month');
    }

    const months = 12;
    const startDate = endDate.subtract(months - 1, 'month').startOf('month');

    // Opt for Range Query (Index Friendly)
    const salesData = await this.ordersRepository
      .createQueryBuilder('order')
      .select("DATE_FORMAT(order.invoiceDate, '%Y-%m')", 'month')
      .addSelect('SUM(order.subtotal)', 'total')
      .where('order.invoiceDate >= :startDate', {
        startDate: startDate.toDate(),
      })
      .andWhere('order.invoiceDate <= :endDate', { endDate: endDate.toDate() })
      .andWhere('order.invoiceNumber IS NOT NULL')
      .andWhere('(order.isDeleted IS NULL OR order.isDeleted = :isDeleted)', {
        isDeleted: false,
      })
      .groupBy("DATE_FORMAT(order.invoiceDate, '%Y-%m')")
      .getRawMany();

    const salesMap = new Map<string, number>();
    salesData.forEach((record) => {
      salesMap.set(record.month, Number(record.total));
    });

    const result: SalesChartDto[] = [];
    for (let i = 0; i < months; i++) {
      const currentMonth = startDate.add(i, 'month');
      const key = currentMonth.format('YYYY-MM');
      const amount = salesMap.get(key) || 0;

      result.push({
        date: currentMonth.format('MMM'),
        amount: Number(amount),
      });
    }

    return result;
  }

  async getStats(year?: number, month?: number): Promise<DashboardStatsDto> {
    // Legacy support or alias
    const statsV2 = await this.getStatsV2(year, month);
    return {
      todayRevenue: statsV2.todayRevenue,
      newOrders: statsV2.todayOrders,
      lowStock: statsV2.lowStockCount,
      activeCustomers: statsV2.newCustomersThisMonth, // Mapping approximate
    };
  }

  async getTopProducts(
    limit: number,
    year?: number,
    month?: number,
  ): Promise<TopProductDto[]> {
    const { start, end, endStr } = this.getDateRange(year, month);

    const topItems = await this.orderItemsRepository
      .createQueryBuilder('item')
      .select('item.productName', 'name')
      .addSelect('item.productCodeId', 'id')
      .addSelect('cat.name', 'category')
      .addSelect('COALESCE(inv.stokAkhir, 0)', 'stock')
      .addSelect('SUM(item.quantity)', 'sold')
      .addSelect('SUM(item.lineTotal)', 'revenue')
      .leftJoin('orders', 'o', 'o.id = item.orderId') // Need to join orders to filter by date
      .leftJoin('product_codes', 'pc', 'pc.id = item.productCodeId')
      .leftJoin('products', 'p', 'p.id = pc.productId')
      .leftJoin('product_categories', 'cat', 'cat.id = p.categoryId')
      .leftJoin(
        'daily_inventory',
        'inv',
        'inv.productCodeId = item.productCodeId AND inv.businessDate = :today',
        { today: endStr }, // Use end date of period for stock reference logic
      )
      .where('o.invoiceDate >= :startDate', { startDate: start })
      .andWhere('o.invoiceDate <= :endDate', { endDate: end })
      .andWhere('o.invoiceNumber IS NOT NULL')
      .andWhere('(o.isDeleted IS NULL OR o.isDeleted = :isDeleted)', {
        isDeleted: false,
      })

      .groupBy('item.productCodeId')
      .addGroupBy('item.productName')
      .addGroupBy('cat.name')
      .addGroupBy('inv.stokAkhir')

      .orderBy('sold', 'DESC')
      .limit(limit)
      .getRawMany();

    return topItems.map((item) => ({
      id: String(item.id),
      name: item.name,
      category: item.category || 'General',
      sold: Number(item.sold),
      revenue: Number(item.revenue),
      stock: Number(item.stock),
    }));
  }

  async getRecentActivities(limit: number): Promise<RecentActivityDto[]> {
    // Activities usually just show latest, regardless of filter (unless specifically requested to filter logs)
    // Decision: Keep it global (Latest) unless explicitly requested.
    const recentOrders = await this.ordersRepository.find({
      order: { createdAt: 'DESC' } as any,
      take: limit,
      relations: ['updatedBy'],
    });

    return recentOrders.map((order) => ({
      id: order.id ? String(order.id) : order.orderNumber,
      type: 'order',
      title: 'Pesanan Baru #' + order.orderNumber,
      description: `Pelanggan ${order.customerName || 'Umum'} membeli senilai Rp${Number(order.grandTotal).toLocaleString('id-ID')}`,
      timestamp: dayjs(order.createdAt).fromNow(),
      user: {
        name: order.updatedBy?.firstName || 'System',
        initials: (order.updatedBy?.firstName || 'S')
          .substring(0, 2)
          .toUpperCase(),
      },
    }));
  }

  // ============================================
  // Dashboard V2 Methods - Enhanced Stats
  // ============================================

  async getStatsV2(
    year?: number,
    month?: number,
  ): Promise<DashboardStatsV2Dto> {
    const { startDayjs, start, end } = this.getDateRange(year, month);

    const isCurrentMonth = dayjs().isSame(startDayjs, 'month');
    const targetDay = isCurrentMonth
      ? dayjs()
      : startDayjs.endOf('month').startOf('day'); // Last day of past month

    // Range for "Day" queries
    const todayStart = targetDay.toDate();
    const todayEnd = targetDay.endOf('day').toDate();
    const yesterdayStart = targetDay.subtract(1, 'day').toDate();
    const yesterdayEnd = targetDay.subtract(1, 'day').endOf('day').toDate();

    try {
      // Today's revenue (Optimized Index Usage)
      const todayRevenueResult = await this.ordersRepository
        .createQueryBuilder('order')
        .select('SUM(order.subtotal)', 'total')
        .where('order.invoiceDate >= :start', { start: todayStart })
        .andWhere('order.invoiceDate < :end', { end: todayEnd }) // Less than next day
        .andWhere('order.invoiceNumber IS NOT NULL')
        .andWhere('(order.isDeleted IS NULL OR order.isDeleted = :isDeleted)', {
          isDeleted: false,
        })
        .getRawOne();

      // Yesterday's revenue
      const yesterdayRevenueResult = await this.ordersRepository
        .createQueryBuilder('order')
        .select('SUM(order.subtotal)', 'total')
        .where('order.invoiceDate >= :start', { start: yesterdayStart })
        .andWhere('order.invoiceDate < :end', { end: yesterdayEnd })
        .andWhere('order.invoiceNumber IS NOT NULL')
        .andWhere('(order.isDeleted IS NULL OR order.isDeleted = :isDeleted)', {
          isDeleted: false,
        })
        .getRawOne();

      const todayRevenue = Number(todayRevenueResult?.total || 0);
      const yesterdayRevenue = Number(yesterdayRevenueResult?.total || 0);
      const revenueChange =
        yesterdayRevenue > 0
          ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100
          : 0;

      // Today's orders count
      const todayOrdersResult = await this.ordersRepository
        .createQueryBuilder('order')
        .where('order.invoiceDate >= :start', { start: todayStart })
        .andWhere('order.invoiceDate < :end', { end: todayEnd })
        .andWhere('order.invoiceNumber IS NOT NULL')
        .andWhere('(order.isDeleted IS NULL OR order.isDeleted = :isDeleted)', {
          isDeleted: false,
        })
        .getCount();

      // Monthly revenue (Selected Month)
      const monthlyRevenueResult = await this.ordersRepository
        .createQueryBuilder('order')
        .select('SUM(order.subtotal)', 'total')
        .where('order.invoiceDate >= :start', { start })
        .andWhere('order.invoiceDate <= :end', { end })
        .andWhere('order.invoiceNumber IS NOT NULL')
        .andWhere('(order.isDeleted IS NULL OR order.isDeleted = :isDeleted)', {
          isDeleted: false,
        })
        .getRawOne();

      const monthlyRevenue = Number(monthlyRevenueResult?.total || 0);

      // Low stock count - Current State (Snapshot)
      // Historical low stock is hard to reconstruct. Showing CURRENT low stock is safer.
      let lowStockResult = 0;
      const checkDate = dayjs().format('YYYY-MM-DD'); // Always check current
      try {
        lowStockResult = await this.dailyInventoryRepository
          .createQueryBuilder('inv')
          .where('inv.businessDate = :today', { today: checkDate })
          .andWhere('inv.isActive = :isActive', { isActive: true })
          .andWhere('inv.minimumStock > 0')
          .andWhere('inv.stokAkhir <= inv.minimumStock')
          .getCount();

        if (lowStockResult === 0) {
          // fallback to yesterday if cron hasn't run
          const yesterdayCheck = dayjs()
            .subtract(1, 'day')
            .format('YYYY-MM-DD');
          lowStockResult = await this.dailyInventoryRepository
            .createQueryBuilder('inv')
            .where('inv.businessDate = :yesterday', {
              yesterday: yesterdayCheck,
            })
            .andWhere('inv.isActive = :isActive', { isActive: true })
            .andWhere('inv.minimumStock > 0')
            .andWhere('inv.stokAkhir <= inv.minimumStock')
            .getCount();
        }
      } catch (e) {
        console.error('Error fetching low stock:', e);
        lowStockResult = 0;
      }

      // New customers this month (Range Query)
      const newCustomersResult = await this.customersRepository
        .createQueryBuilder('customer')
        .where('customer.createdAt >= :start', { start })
        .andWhere('customer.createdAt <= :end', { end })
        .andWhere(
          '(customer.isDeleted IS NULL OR customer.isDeleted = :isDeleted)',
          { isDeleted: false },
        )
        .getCount();

      // Active production batches (Current State)
      let activeBatchesResult = 0;
      let qcPendingResult = 0;
      try {
        activeBatchesResult = await this.productionBatchesRepository
          .createQueryBuilder('batch')
          .where('batch.status = :status', { status: BatchStatus.IN_PROGRESS })
          .getCount();

        // QC Pending batches
        qcPendingResult = await this.productionBatchesRepository
          .createQueryBuilder('batch')
          .where('batch.status = :status', { status: BatchStatus.QC_PENDING })
          .getCount();
      } catch (e) {
        console.error('Error fetching batch status:', e);
      }

      return {
        todayRevenue,
        yesterdayRevenue,
        revenueChange: Math.round(revenueChange * 100) / 100,
        todayOrders: todayOrdersResult,
        monthlyRevenue,
        lowStockCount: lowStockResult,
        newCustomersThisMonth: newCustomersResult,
        activeBatches: activeBatchesResult,
        qcPendingBatches: qcPendingResult,
      };
    } catch (error) {
      console.error('Error in getStatsV2:', error);
      return {
        todayRevenue: 0,
        yesterdayRevenue: 0,
        revenueChange: 0,
        todayOrders: 0,
        monthlyRevenue: 0,
        lowStockCount: 0,
        newCustomersThisMonth: 0,
        activeBatches: 0,
        qcPendingBatches: 0,
      };
    }
  }

  async getSalesByCustomerType(
    year?: number,
    month?: number,
  ): Promise<SalesByCustomerTypeDto[]> {
    const { start, end } = this.getDateRange(year, month);

    try {
      // Join with customers table using customerId
      const salesByType = await this.ordersRepository
        .createQueryBuilder('order')
        .select('customer.customerType', 'type')
        .addSelect('SUM(order.subtotal)', 'revenue')
        .addSelect('COUNT(order.id)', 'orderCount')
        .innerJoin('order.customer', 'customer')
        .where('order.invoiceDate >= :start', { start })
        .andWhere('order.invoiceDate <= :end', { end })
        .andWhere('order.invoiceNumber IS NOT NULL')
        .andWhere('(order.isDeleted IS NULL OR order.isDeleted = :isDeleted)', {
          isDeleted: false,
        })
        .andWhere('customer.customerType IS NOT NULL')
        .groupBy('customer.customerType')
        .getRawMany();

      if (!salesByType?.length) {
        return [];
      }

      const totalRevenue = salesByType.reduce(
        (sum, item) => sum + Number(item.revenue || 0),
        0,
      );

      return salesByType.map((item) => ({
        type: item.type || 'Lainnya',
        revenue: Number(item.revenue || 0),
        percentage:
          totalRevenue > 0
            ? Math.round((Number(item.revenue || 0) / totalRevenue) * 10000) /
              100
            : 0,
        orderCount: Number(item.orderCount || 0),
      }));
    } catch (error) {
      console.error('Error in getSalesByCustomerType:', error);
      return [];
    }
  }

  async getProductionSummary(): Promise<ProductionSummaryDto> {
    const today = dayjs().format('YYYY-MM-DD');

    // In-progress batches
    const inProgressBatches = await this.productionBatchesRepository
      .createQueryBuilder('batch')
      .where('batch.status = :status', { status: BatchStatus.IN_PROGRESS })
      .getCount();

    // QC Pending batches
    const qcPendingBatches = await this.productionBatchesRepository
      .createQueryBuilder('batch')
      .where('batch.status = :status', { status: BatchStatus.QC_PENDING })
      .getCount();

    // Completed today
    const completedToday = await this.productionBatchesRepository
      .createQueryBuilder('batch')
      .where('batch.status = :status', { status: BatchStatus.COMPLETED })
      .andWhere('DATE(batch.completedAt) = :today', { today })
      .getCount();

    // Recent batches (last 5)
    const recentBatches = await this.productionBatchesRepository
      .createQueryBuilder('batch')
      .leftJoinAndSelect('batch.product', 'product')
      .orderBy('batch.createdAt', 'DESC')
      .take(5)
      .getMany();

    return {
      inProgressBatches,
      qcPendingBatches,
      completedToday,
      recentBatches: recentBatches.map((batch) => ({
        id: batch.id,
        batchNumber: batch.batchNumber,
        productName: batch.product?.name || 'Unknown',
        status: batch.status,
        productionDate: dayjs(batch.productionDate).format('DD MMM YYYY'),
      })),
    };
  }

  async getLowStockItems(limit: number = 5): Promise<LowStockSummaryDto> {
    const today = dayjs().format('YYYY-MM-DD');

    // Count total low stock
    const count = await this.dailyInventoryRepository
      .createQueryBuilder('inv')
      .where('inv.businessDate = :today', { today })
      .andWhere('inv.isActive = :isActive', { isActive: true })
      .andWhere('inv.minimumStock > 0')
      .andWhere('inv.stokAkhir <= inv.minimumStock')
      .getCount();

    // Get top critical items
    const items = await this.dailyInventoryRepository
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.productCode', 'pc')
      .leftJoin('pc.product', 'product')
      .leftJoin('pc.category', 'mainCategory')
      .addSelect('product.name')
      .addSelect('mainCategory.name')
      .where('inv.businessDate = :today', { today })
      .andWhere('inv.isActive = :isActive', { isActive: true })
      .andWhere('inv.minimumStock > 0')
      .andWhere('inv.stokAkhir <= inv.minimumStock')
      .orderBy('inv.stokAkhir', 'ASC')
      .take(limit)
      .getMany();

    return {
      count,
      items: items.map((item) => ({
        productCodeId: item.productCodeId,
        productCode: item.productCode?.productCode || '',
        productName: item.productCode?.product?.name || 'Unknown',
        currentStock: Number(item.stokAkhir),
        minimumStock: Number(item.minimumStock),
        mainCategory: item.productCode?.category?.name || 'Unknown',
      })),
    };
  }

  async getActiveCustomersByType(
    year?: number,
    month?: number,
  ): Promise<ActiveCustomersByTypeDto> {
    const { start, end } = this.getDateRange(year, month);

    try {
      const customersByType = await this.ordersRepository
        .createQueryBuilder('order')
        .select('customer.customerType', 'type')
        .addSelect('COUNT(DISTINCT order.customerId)', 'customerCount')
        .innerJoin('order.customer', 'customer')
        .where('order.invoiceDate >= :start', { start })
        .andWhere('order.invoiceDate <= :end', { end })
        .andWhere('order.invoiceNumber IS NOT NULL')
        .andWhere('(order.isDeleted IS NULL OR order.isDeleted = :isDeleted)', {
          isDeleted: false,
        })
        .andWhere('customer.customerType IS NOT NULL')
        .groupBy('customer.customerType')
        .getRawMany();

      const result: ActiveCustomersByTypeDto = {
        hotel: 0,
        cafeResto: 0,
        catering: 0,
        reseller: 0,
        total: 0,
      };

      customersByType.forEach((row) => {
        const count = Number(row.customerCount || 0);
        result.total += count;

        switch (row.type) {
          case 'Hotel':
            result.hotel = count;
            break;
          case 'Cafe & Resto':
            result.cafeResto = count;
            break;
          case 'Catering':
            result.catering = count;
            break;
          case 'Reseller':
            result.reseller = count;
            break;
        }
      });

      return result;
    } catch (error) {
      console.error('Error in getActiveCustomersByType:', error);
      return {
        hotel: 0,
        cafeResto: 0,
        catering: 0,
        reseller: 0,
        total: 0,
      };
    }
  }
}
