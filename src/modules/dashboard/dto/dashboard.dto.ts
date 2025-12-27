
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
