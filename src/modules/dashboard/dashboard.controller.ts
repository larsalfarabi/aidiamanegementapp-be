
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../auth/guards/auth.guard';
import { DashboardService } from './dashboard.service';
import { ResponseSuccess } from '../../common/interface';
import { SalesChartDto } from './dto/sales-chart.dto';
import {
  DashboardStatsDto,
  RecentActivityDto,
  TopProductDto,
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
  async getTopProducts(@Query('limit') limit: number = 5): Promise<ResponseSuccess> {
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
  async getRecentActivities(@Query('limit') limit: number = 10): Promise<ResponseSuccess> {
    const data = await this.dashboardService.getRecentActivities(limit);
    return {
      status: 'Success',
      message: 'Recent activities retrieved successfully',
      data,
    };
  }
}
