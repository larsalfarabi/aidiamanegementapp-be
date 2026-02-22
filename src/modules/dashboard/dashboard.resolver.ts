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
  AvailableMonth,
} from './dto/dashboard.model';

import { UseGuards } from '@nestjs/common';
import { JwtGuard } from '../../modules/auth/guards/auth.guard';

@Resolver(() => DashboardData)
@UseGuards(JwtGuard)
export class DashboardResolver {
  constructor(private readonly dashboardService: DashboardService) {}

  @Query(() => DashboardData, { name: 'dashboardData' })
  async getDashboardData(
    @Args('month', { type: () => Int, nullable: true }) month?: number,
    @Args('year', { type: () => Int, nullable: true }) year?: number,
  ): Promise<DashboardData> {
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
      availableMonths,
    ] = await Promise.all([
      this.dashboardService.getStatsV2(year, month),
      this.dashboardService.getSalesChartData(year, month),
      this.dashboardService.getTopProducts(5, year, month),
      this.dashboardService.getRecentActivities(5),
      this.dashboardService.getSalesByCustomerType(year, month),
      this.dashboardService.getProductionSummary(),
      this.dashboardService.getLowStockItems(5),
      this.dashboardService.getActiveCustomersByType(year, month),
      this.dashboardService.getAvailableMonths(),
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
      availableMonths: availableMonths as unknown as AvailableMonth[],
    };
  }

  // Individual Queries if needed for granular fetching
  @Query(() => DashboardStatsV2, { name: 'dashboardStats' })
  async getStats(
    @Args('month', { type: () => Int, nullable: true }) month?: number,
    @Args('year', { type: () => Int, nullable: true }) year?: number,
  ) {
    return this.dashboardService.getStatsV2(year, month);
  }

  @Query(() => [SalesChartData], { name: 'salesChart' })
  async getSalesChart(
    @Args('month', { type: () => Int, nullable: true }) month?: number,
    @Args('year', { type: () => Int, nullable: true }) year?: number,
  ) {
    return this.dashboardService.getSalesChartData(year, month);
  }

  @Query(() => [AvailableMonth], { name: 'availableMonths' })
  async getAvailableMonths() {
    return this.dashboardService.getAvailableMonths();
  }
}
