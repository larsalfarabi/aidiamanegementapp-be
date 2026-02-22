import { Field, ObjectType, Float, Int } from '@nestjs/graphql';

@ObjectType()
export class DashboardStats {
  @Field(() => Float)
  todayRevenue: number;

  @Field(() => Int)
  newOrders: number;

  @Field(() => Int)
  lowStock: number;

  @Field(() => Int)
  activeCustomers: number;
}

@ObjectType()
export class TopProduct {
  @Field()
  id: string;

  @Field()
  name: string;

  @Field()
  category: string;

  @Field(() => Int)
  sold: number;

  @Field(() => Int)
  stock: number;

  @Field(() => Float)
  revenue: number;
}

@ObjectType()
export class UserInfo {
  @Field()
  name: string;

  @Field()
  initials: string;
}

@ObjectType()
export class RecentActivity {
  @Field()
  id: string;

  @Field()
  type: string;

  @Field()
  title: string;

  @Field()
  description: string;

  @Field()
  timestamp: string;

  @Field(() => UserInfo)
  user: UserInfo;
}

@ObjectType()
export class SalesChartData {
  @Field()
  date: string;

  @Field(() => Float)
  amount: number;
}

@ObjectType()
export class DashboardStatsV2 {
  @Field(() => Float, { description: 'Total revenue today' })
  todayRevenue: number;

  @Field(() => Float, { description: 'Total revenue yesterday' })
  yesterdayRevenue: number;

  @Field(() => Float, { description: 'Revenue change percentage vs yesterday' })
  revenueChange: number;

  @Field(() => Int, { description: 'Number of orders today' })
  todayOrders: number;

  @Field(() => Float, { description: 'Total revenue this month' })
  monthlyRevenue: number;

  @Field(() => Int, { description: 'Number of low stock products' })
  lowStockCount: number;

  @Field(() => Int, { description: 'Number of new customers this month' })
  newCustomersThisMonth: number;

  @Field(() => Int, { description: 'Number of active production batches' })
  activeBatches: number;

  @Field(() => Int, { description: 'Number of batches pending QC' })
  qcPendingBatches: number;
}

@ObjectType()
export class SalesByCustomerType {
  @Field({ description: 'Customer type (Hotel, Cafe & Resto, etc.)' })
  type: string;

  @Field(() => Float, { description: 'Total revenue from this customer type' })
  revenue: number;

  @Field(() => Float, { description: 'Percentage of total revenue' })
  percentage: number;

  @Field(() => Int, { description: 'Number of orders from this customer type' })
  orderCount: number;
}

@ObjectType()
export class BatchSummary {
  @Field(() => Int)
  id: number;

  @Field()
  batchNumber: string;

  @Field()
  productName: string;

  @Field()
  status: string;

  @Field()
  productionDate: string;
}

@ObjectType()
export class ProductionSummary {
  @Field(() => Int, { description: 'Batches currently in progress' })
  inProgressBatches: number;

  @Field(() => Int, { description: 'Batches pending QC approval' })
  qcPendingBatches: number;

  @Field(() => Int, { description: 'Batches completed today' })
  completedToday: number;

  @Field(() => [BatchSummary], { description: 'Recent batch summaries' })
  recentBatches: BatchSummary[];
}

@ObjectType()
export class LowStockItem {
  @Field(() => Int)
  productCodeId: number;

  @Field()
  productCode: string;

  @Field()
  productName: string;

  @Field(() => Float)
  currentStock: number;

  @Field(() => Float)
  minimumStock: number;

  @Field()
  mainCategory: string;
}

@ObjectType()
export class LowStockSummary {
  @Field(() => Int, { description: 'Total count of low stock products' })
  count: number;

  @Field(() => [LowStockItem], { description: 'Top critical low stock items' })
  items: LowStockItem[];
}

@ObjectType()
export class ActiveCustomersByType {
  @Field(() => Int, {
    description: 'Number of Hotel customers who ordered this month',
  })
  hotel: number;

  @Field(() => Int, {
    description: 'Number of Cafe & Resto customers who ordered this month',
  })
  cafeResto: number;

  @Field(() => Int, {
    description: 'Number of Catering customers who ordered this month',
  })
  catering: number;

  @Field(() => Int, {
    description: 'Number of Reseller customers who ordered this month',
  })
  reseller: number;

  @Field(() => Int, {
    description: 'Total distinct customers who ordered this month',
  })
  total: number;
}

@ObjectType()
export class AvailableMonth {
  @Field(() => Int)
  year: number;

  @Field(() => Int)
  month: number;
}

// Unified Output Type for Single Query
@ObjectType()
export class DashboardData {
  @Field(() => DashboardStatsV2)
  stats: DashboardStatsV2;

  @Field(() => [SalesChartData])
  salesChart: SalesChartData[];

  @Field(() => [TopProduct])
  topProducts: TopProduct[];

  @Field(() => [RecentActivity])
  recentActivities: RecentActivity[];

  @Field(() => [SalesByCustomerType])
  salesByCustomerType: SalesByCustomerType[];

  @Field(() => ProductionSummary)
  productionSummary: ProductionSummary;

  @Field(() => LowStockSummary)
  lowStockSummary: LowStockSummary;

  @Field(() => ActiveCustomersByType)
  activeCustomers: ActiveCustomersByType;

  @Field(() => [AvailableMonth], { nullable: true })
  availableMonths?: AvailableMonth[];
}
