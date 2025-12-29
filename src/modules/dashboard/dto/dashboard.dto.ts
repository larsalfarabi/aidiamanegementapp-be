import { ApiProperty } from '@nestjs/swagger';

export class DashboardStatsDto {
  @ApiProperty()
  todayRevenue: number;

  @ApiProperty()
  newOrders: number;

  @ApiProperty()
  lowStock: number;

  @ApiProperty()
  activeCustomers: number;
}

export class TopProductDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  category: string;

  @ApiProperty()
  sold: number;

  @ApiProperty()
  stock: number;

  @ApiProperty()
  revenue: number;
}

export class RecentActivityDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ['order', 'customer', 'product', 'inventory'] })
  type: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  timestamp: string;

  @ApiProperty()
  user: {
    name: string;
    initials: string;
  };
}

// ============================================
// Dashboard V2 DTOs for Enhanced Stats
// ============================================

export class DashboardStatsV2Dto {
  @ApiProperty({ description: 'Total revenue today' })
  todayRevenue: number;

  @ApiProperty({ description: 'Total revenue yesterday' })
  yesterdayRevenue: number;

  @ApiProperty({ description: 'Revenue change percentage vs yesterday' })
  revenueChange: number;

  @ApiProperty({ description: 'Number of orders today' })
  todayOrders: number;

  @ApiProperty({
    description: 'Total revenue this month',
  })
  monthlyRevenue: number;

  @ApiProperty({ description: 'Number of low stock products' })
  lowStockCount: number;

  @ApiProperty({ description: 'Number of new customers this month' })
  newCustomersThisMonth: number;

  @ApiProperty({ description: 'Number of active production batches' })
  activeBatches: number;

  @ApiProperty({ description: 'Number of batches pending QC' })
  qcPendingBatches: number;
}

export class SalesByCustomerTypeDto {
  @ApiProperty({ description: 'Customer type (Hotel, Cafe & Resto, etc.)' })
  type: string;

  @ApiProperty({ description: 'Total revenue from this customer type' })
  revenue: number;

  @ApiProperty({ description: 'Percentage of total revenue' })
  percentage: number;

  @ApiProperty({ description: 'Number of orders from this customer type' })
  orderCount: number;
}

export class ProductionSummaryDto {
  @ApiProperty({ description: 'Batches currently in progress' })
  inProgressBatches: number;

  @ApiProperty({ description: 'Batches pending QC approval' })
  qcPendingBatches: number;

  @ApiProperty({ description: 'Batches completed today' })
  completedToday: number;

  @ApiProperty({ description: 'Recent batch summaries' })
  recentBatches: BatchSummaryDto[];
}

export class BatchSummaryDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  batchNumber: string;

  @ApiProperty()
  productName: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  productionDate: string;
}

export class LowStockItemDto {
  @ApiProperty()
  productCodeId: number;

  @ApiProperty()
  productCode: string;

  @ApiProperty()
  productName: string;

  @ApiProperty()
  currentStock: number;

  @ApiProperty()
  minimumStock: number;

  @ApiProperty()
  mainCategory: string;
}

export class LowStockSummaryDto {
  @ApiProperty({ description: 'Total count of low stock products' })
  count: number;

  @ApiProperty({ description: 'Top critical low stock items' })
  items: LowStockItemDto[];
}
