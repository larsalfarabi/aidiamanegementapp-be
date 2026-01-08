import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtGuard } from '../auth/guards/auth.guard';
import { DashboardService } from './dashboard.service';
import { ResponseSuccess } from '../../common/interface';
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

@ApiTags('Dashboard')
@Controller('dashboard')
@UseGuards(JwtGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('sales-chart')
  @ApiOperation({ summary: 'Get sales trend for last 12 months' })
  @ApiResponse({
    status: 200,
    description: 'Returns sales chart data',
    type: SalesChartDto,
    isArray: true,
  })
  async getSalesChart(): Promise<ResponseSuccess> {
    const data = await this.dashboardService.getSalesChartData();
    return {
      status: 'Success',
      message: 'Sales chart data retrieved successfully',
      data,
    };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get dashboard statistics' })
  @ApiResponse({
    status: 200,
    description: 'Returns dashboard statistics',
    type: DashboardStatsDto,
  })
  async getStats(): Promise<ResponseSuccess> {
    const data = await this.dashboardService.getStats();
    return {
      status: 'Success',
      message: 'Dashboard stats retrieved successfully',
      data,
    };
  }

  @Get('top-products')
  @ApiOperation({ summary: 'Get top selling products' })
  @ApiResponse({
    status: 200,
    description: 'Returns top selling products',
    type: TopProductDto,
    isArray: true,
  })
  async getTopProducts(
    @Query('limit') limit: number = 5,
  ): Promise<ResponseSuccess> {
    const data = await this.dashboardService.getTopProducts(limit);
    return {
      status: 'Success',
      message: 'Top products retrieved successfully',
      data,
    };
  }

  @Get('activities')
  @ApiOperation({ summary: 'Get recent activities' })
  @ApiResponse({
    status: 200,
    description: 'Returns recent activities',
    type: RecentActivityDto,
    isArray: true,
  })
  async getRecentActivities(
    @Query('limit') limit: number = 10,
  ): Promise<ResponseSuccess> {
    const data = await this.dashboardService.getRecentActivities(limit);
    return {
      status: 'Success',
      message: 'Recent activities retrieved successfully',
      data,
    };
  }

  // ============================================
  // Dashboard V2 Endpoints - Enhanced Stats
  // ============================================

  @Get('stats-v2')
  @ApiOperation({
    summary: 'Get enhanced dashboard statistics with comparisons',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns enhanced dashboard statistics',
    type: DashboardStatsV2Dto,
  })
  async getStatsV2(): Promise<ResponseSuccess> {
    const data = await this.dashboardService.getStatsV2();
    return {
      status: 'Success',
      message: 'Enhanced dashboard stats retrieved successfully',
      data,
    };
  }

  @Get('sales-by-customer-type')
  @ApiOperation({ summary: 'Get sales breakdown by customer type' })
  @ApiResponse({
    status: 200,
    description: 'Returns sales grouped by customer type',
    type: SalesByCustomerTypeDto,
    isArray: true,
  })
  async getSalesByCustomerType(): Promise<ResponseSuccess> {
    const data = await this.dashboardService.getSalesByCustomerType();
    return {
      status: 'Success',
      message: 'Sales by customer type retrieved successfully',
      data,
    };
  }

  @Get('production-summary')
  @ApiOperation({ summary: 'Get production batch summary' })
  @ApiResponse({
    status: 200,
    description: 'Returns production batch summary',
    type: ProductionSummaryDto,
  })
  async getProductionSummary(): Promise<ResponseSuccess> {
    const data = await this.dashboardService.getProductionSummary();
    return {
      status: 'Success',
      message: 'Production summary retrieved successfully',
      data,
    };
  }

  @Get('low-stock-items')
  @ApiOperation({ summary: 'Get low stock items summary' })
  @ApiResponse({
    status: 200,
    description: 'Returns low stock items summary',
    type: LowStockSummaryDto,
  })
  async getLowStockItems(
    @Query('limit') limit: number = 5,
  ): Promise<ResponseSuccess> {
    const data = await this.dashboardService.getLowStockItems(limit);
    return {
      status: 'Success',
      message: 'Low stock items retrieved successfully',
      data,
    };
  }

  @Get('active-customers-by-type')
  @ApiOperation({
    summary: 'Get customers who ordered this month grouped by type',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns count of customers who ordered this month by type',
    type: ActiveCustomersByTypeDto,
  })
  async getActiveCustomersByType(): Promise<ResponseSuccess> {
    const data = await this.dashboardService.getActiveCustomersByType();
    return {
      status: 'Success',
      message: 'Active customers by type retrieved successfully',
      data,
    };
  }
}
