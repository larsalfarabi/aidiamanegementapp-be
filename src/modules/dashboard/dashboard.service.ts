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

  async getSalesChartData(): Promise<SalesChartDto[]> {
    const months = 12;
    const endDate = dayjs();
    const startDate = dayjs()
      .subtract(months - 1, 'month')
      .startOf('month');

    const salesData = await this.ordersRepository
      .createQueryBuilder('order')
      .select("DATE_FORMAT(order.orderDate, '%Y-%m')", 'month')
      .addSelect('SUM(order.grandTotal)', 'total')
      .where('order.orderDate >= :startDate', { startDate: startDate.toDate() })
      .andWhere('order.isDeleted IS NULL OR order.isDeleted = :isDeleted', {
        isDeleted: false,
      })
      .groupBy("DATE_FORMAT(order.orderDate, '%Y-%m')")
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

  async getStats(): Promise<DashboardStatsDto> {
    const today = dayjs().format('YYYY-MM-DD');

    // Revenue today
    const revenueResult = await this.ordersRepository
      .createQueryBuilder('order')
      .select('SUM(order.grandTotal)', 'total')
      .where('DATE(order.orderDate) = :today', { today })
      .andWhere('order.isDeleted IS NULL OR order.isDeleted = :isDeleted', {
        isDeleted: false,
      })
      .getRawOne();

    // New Orders today
    const newOrders = await this.ordersRepository.count({
      where: {
        orderDate: dayjs(today).toDate() as any,
        isDeleted: false,
      } as any,
    });

    // Active Customers
    const activeCustomers = await this.customersRepository.count({
      where: { isActive: true },
    });

    return {
      todayRevenue: Number(revenueResult?.total || 0),
      newOrders: newOrders,
      lowStock: 0, // Placeholder
      activeCustomers: activeCustomers,
    };
  }

  async getTopProducts(limit: number): Promise<TopProductDto[]> {
    const today = dayjs().format('YYYY-MM-DD');

    const topItems = await this.orderItemsRepository
      .createQueryBuilder('item')
      .select('item.productName', 'name')
      .addSelect('item.productCodeId', 'id')
      .addSelect('cat.name', 'category')
      .addSelect('COALESCE(inv.stokAkhir, 0)', 'stock')
      .addSelect('SUM(item.quantity)', 'sold')
      .addSelect('SUM(item.lineTotal)', 'revenue')

      // Joins using Table Names (because entities might be loosely coupled in this context or to ensure raw speed)
      // Note: Using entity names in leftJoin matches TypeORM convention if mapped, but here using RAW table names for clarity in raw select, OR using relation property paths
      // Since we don't have direct relations injected in OrderItems for deep nesting, we use direct table joins or entity aliases if repositories are unavailable
      // Better: Use leftJoin with Entity Class if possible, or relation path.
      // Relations: item -> productCode (ProductCodes) -> product (Products) -> category (ProductCategories)
      // But OrderItems doesn't have deep eager loading defined here easily.
      // Using Raw Table Joins via leftJoin (referencing entity via string name if registered, or table name)
      // TypeORM .leftJoin('product_codes', 'pc', 'pc.id = item.productCodeId') works if 'product_codes' is table name.

      .leftJoin('product_codes', 'pc', 'pc.id = item.productCodeId')
      .leftJoin('products', 'p', 'p.id = pc.productId')
      .leftJoin('product_categories', 'cat', 'cat.id = p.categoryId')
      .leftJoin(
        'daily_inventory',
        'inv',
        'inv.productCodeId = item.productCodeId AND inv.businessDate = :today',
        { today },
      )

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
    const recentOrders = await this.ordersRepository.find({
      order: { createdAt: 'DESC' } as any,
      take: limit,
      relations: ['updatedBy'], // Use updatedBy/createdBy
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

  async getStatsV2(): Promise<DashboardStatsV2Dto> {
    const today = dayjs().format('YYYY-MM-DD');
    const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
    const startOfMonth = dayjs().startOf('month').format('YYYY-MM-DD');

    try {
      // Today's revenue
      const todayRevenueResult = await this.ordersRepository
        .createQueryBuilder('order')
        .select('SUM(order.grandTotal)', 'total')
        .where('DATE(order.orderDate) = :today', { today })
        .andWhere('(order.isDeleted IS NULL OR order.isDeleted = :isDeleted)', {
          isDeleted: false,
        })
        .getRawOne();

      // Yesterday's revenue
      const yesterdayRevenueResult = await this.ordersRepository
        .createQueryBuilder('order')
        .select('SUM(order.grandTotal)', 'total')
        .where('DATE(order.orderDate) = :yesterday', { yesterday })
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
        .where('DATE(order.orderDate) = :today', { today })
        .andWhere('(order.isDeleted IS NULL OR order.isDeleted = :isDeleted)', {
          isDeleted: false,
        })
        .getCount();

      // Monthly revenue (this month)
      const monthlyRevenueResult = await this.ordersRepository
        .createQueryBuilder('order')
        .select('SUM(order.grandTotal)', 'total')
        .where('DATE(order.orderDate) >= :startOfMonth', { startOfMonth })
        .andWhere('(order.isDeleted IS NULL OR order.isDeleted = :isDeleted)', {
          isDeleted: false,
        })
        .getRawOne();

      const monthlyRevenue = Number(monthlyRevenueResult?.total || 0);

      // Low stock count - Try to get from daily inventory, fallback to 0
      let lowStockResult = 0;
      try {
        // Check today first, then yesterday if no data
        lowStockResult = await this.dailyInventoryRepository
          .createQueryBuilder('inv')
          .where('inv.businessDate = :today', { today })
          .andWhere('inv.isActive = :isActive', { isActive: true })
          .andWhere('inv.minimumStock > 0')
          .andWhere('inv.stokAkhir <= inv.minimumStock')
          .getCount();

        if (lowStockResult === 0) {
          // Try yesterday
          lowStockResult = await this.dailyInventoryRepository
            .createQueryBuilder('inv')
            .where('inv.businessDate = :yesterday', { yesterday })
            .andWhere('inv.isActive = :isActive', { isActive: true })
            .andWhere('inv.minimumStock > 0')
            .andWhere('inv.stokAkhir <= inv.minimumStock')
            .getCount();
        }
      } catch (e) {
        console.error('Error fetching low stock:', e);
        lowStockResult = 0;
      }

      // New customers this month
      const newCustomersResult = await this.customersRepository
        .createQueryBuilder('customer')
        .where('DATE(customer.createdAt) >= :startOfMonth', { startOfMonth })
        .andWhere(
          '(customer.isDeleted IS NULL OR customer.isDeleted = :isDeleted)',
          { isDeleted: false },
        )
        .getCount();

      // Active production batches (IN_PROGRESS)
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
      // Return default values on error
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

  async getSalesByCustomerType(): Promise<SalesByCustomerTypeDto[]> {
    const startOfMonth = dayjs().startOf('month').format('YYYY-MM-DD');
    const endOfMonth = dayjs().endOf('month').format('YYYY-MM-DD');

    try {
      // Join with customers table using customerId
      const salesByType = await this.ordersRepository
        .createQueryBuilder('order')
        .select('customer.customerType', 'type')
        .addSelect('SUM(order.grandTotal)', 'revenue')
        .addSelect('COUNT(order.id)', 'orderCount')
        .innerJoin('order.customer', 'customer')
        .where('DATE(order.orderDate) >= :startOfMonth', { startOfMonth })
        .andWhere('DATE(order.orderDate) <= :endOfMonth', { endOfMonth })
        .andWhere('(order.isDeleted IS NULL OR order.isDeleted = :isDeleted)', {
          isDeleted: false,
        })
        .andWhere('customer.customerType IS NOT NULL')
        .groupBy('customer.customerType')
        .getRawMany();

      // If no data from join, return empty array
      if (!salesByType?.length) {
        return [];
      }

      // Calculate total revenue for percentage
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

  /**
   * Get count of distinct customers who ordered this month, grouped by type
   * Returns: { hotel, cafeResto, catering, reseller, total }
   */
  async getActiveCustomersByType(): Promise<ActiveCustomersByTypeDto> {
    const startOfMonth = dayjs().startOf('month').format('YYYY-MM-DD');
    const endOfMonth = dayjs().endOf('month').format('YYYY-MM-DD');

    try {
      // Query distinct customers who ordered this month, grouped by type
      const customersByType = await this.ordersRepository
        .createQueryBuilder('order')
        .select('customer.customerType', 'type')
        .addSelect('COUNT(DISTINCT order.customerId)', 'customerCount')
        .innerJoin('order.customer', 'customer')
        .where('DATE(order.orderDate) >= :startOfMonth', { startOfMonth })
        .andWhere('DATE(order.orderDate) <= :endOfMonth', { endOfMonth })
        .andWhere('(order.isDeleted IS NULL OR order.isDeleted = :isDeleted)', {
          isDeleted: false,
        })
        .andWhere('customer.customerType IS NOT NULL')
        .groupBy('customer.customerType')
        .getRawMany();

      // Initialize counts
      const result: ActiveCustomersByTypeDto = {
        hotel: 0,
        cafeResto: 0,
        catering: 0,
        reseller: 0,
        total: 0,
      };

      // Map results to response
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
