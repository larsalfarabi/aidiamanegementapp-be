
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Orders } from '../orders/entity/orders.entity';
import { OrderItems } from '../orders/entity/order_items.entity';
import { Customers } from '../customers/entity/customers.entity';
import { SalesChartDto } from './dto/sales-chart.dto';
import {
  DashboardStatsDto,
  RecentActivityDto,
  TopProductDto,
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
  ) {}

  async getSalesChartData(): Promise<SalesChartDto[]> {
    const months = 12;
    const endDate = dayjs();
    const startDate = dayjs().subtract(months - 1, 'month').startOf('month');

    const salesData = await this.ordersRepository
      .createQueryBuilder('order')
      .select("DATE_FORMAT(order.orderDate, '%Y-%m')", 'month')
      .addSelect('SUM(order.grandTotal)', 'total')
      .where('order.orderDate >= :startDate', { startDate: startDate.toDate() })
      .andWhere('order.isDeleted IS NULL OR order.isDeleted = :isDeleted', { isDeleted: false })
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
      .andWhere('order.isDeleted IS NULL OR order.isDeleted = :isDeleted', { isDeleted: false })
      .getRawOne();
    
    // New Orders today
    const newOrders = await this.ordersRepository.count({
      where: {
        orderDate: dayjs(today).toDate() as any,
        isDeleted: false,
      } as any
    });

    // Active Customers
    const activeCustomers = await this.customersRepository.count({
      where: { isActive: true }
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
      .leftJoin('daily_inventory', 'inv', 'inv.productCodeId = item.productCodeId AND inv.businessDate = :today', { today })

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
    
    return recentOrders.map(order => ({
      id: order.id ? String(order.id) : order.orderNumber,
      type: 'order',
      title: 'Pesanan Baru #' + order.orderNumber,
      description: `Pelanggan ${order.customerName || 'Umum'} membeli senilai Rp${Number(order.grandTotal).toLocaleString('id-ID')}`,
      timestamp: dayjs(order.createdAt).fromNow(),
      user: {
        name: order.updatedBy?.firstName || 'System',
        initials: (order.updatedBy?.firstName || 'S').substring(0, 2).toUpperCase(),
      },
    }));
  }
}
