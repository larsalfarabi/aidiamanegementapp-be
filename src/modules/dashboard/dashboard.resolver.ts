import { Resolver, Query, Int, Args } from '@nestjs/graphql';
import { DashboardService } from './dashboard.service';
import {
  DashboardData,
  DashboardStatsV2,
  SalesChartData,
  TopProduct,
  RecentActivity,
  SalesByCustomerType,
  ProductionSummary,
  LowStockSummary,
  ActiveCustomersByType,
} from './dto/dashboard.model';
// Note: We need to import the original DTOs to map or just duplicate logic if service returns pure objects
// In this case, NestJS serializers often handle plain objects if they match the class structure.

import { UseGuards } from '@nestjs/common';
import { JwtGuard } from '../../modules/auth/guards/auth.guard';

@Resolver(() => DashboardData)
@UseGuards(JwtGuard)
export class DashboardResolver {
  constructor(private readonly dashboardService: DashboardService) {}

  @Query(() => DashboardData, { name: 'dashboardData' })
 
  async getDashboardData(): Promise<DashboardData> {
    // Parallel resolution for maximum performance
    const [
      stats,
      salesChart,
      topProducts,
      recentActivities,
      salesByCustomerType,
      productionSummary,
      lowStockSummary,
      activeCustomers,
    ] = await Promise.all([
      this.dashboardService.getStatsV2(),
      this.dashboardService.getSalesChartData(),
      this.dashboardService.getTopProducts(5),
      this.dashboardService.getRecentActivities(5),
      this.dashboardService.getSalesByCustomerType(),
      this.dashboardService.getProductionSummary(),
      this.dashboardService.getLowStockItems(5),
      this.dashboardService.getActiveCustomersByType(),
    ]);

    return {
      stats: stats as unknown as DashboardStatsV2,
      salesChart: salesChart as unknown as SalesChartData[],
      topProducts: topProducts as unknown as TopProduct[],
      recentActivities: recentActivities as unknown as RecentActivity[],
      salesByCustomerType:
        salesByCustomerType as unknown as SalesByCustomerType[],
      productionSummary: productionSummary as unknown as ProductionSummary,
      lowStockSummary: lowStockSummary as unknown as LowStockSummary,
      activeCustomers: activeCustomers as unknown as ActiveCustomersByType,
    };
  }

  // Individual Queries if needed for granular fetching
  @Query(() => DashboardStatsV2, { name: 'dashboardStats' })
 
  async getStats() {
    return this.dashboardService.getStatsV2();
  }

  @Query(() => [SalesChartData], { name: 'salesChart' })
 
  async getSalesChart() {
    return this.dashboardService.getSalesChartData();
  }
}
