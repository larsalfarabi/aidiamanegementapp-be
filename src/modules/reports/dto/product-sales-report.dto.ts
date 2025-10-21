import { IsOptional, IsDate, IsEnum, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ProductSalesReportQueryDto {
  @ApiPropertyOptional({
    description: 'Start date for the report (YYYY-MM-DD)',
    example: '2025-09-01',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({
    description: 'End date for the report (YYYY-MM-DD)',
    example: '2025-09-30',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @ApiPropertyOptional({
    description: 'Filter by customer type',
    enum: ['Hotel', 'Cafe & Resto', 'Catering', 'Reseller'],
    example: 'Hotel',
  })
  @IsOptional()
  @IsEnum(['Hotel', 'Cafe & Resto', 'Catering', 'Reseller'])
  customerType?: string;

  @ApiPropertyOptional({
    description: 'Filter by product category',
    example: 'BUFFET',
  })
  @IsOptional()
  productCategory?: string;

  @ApiPropertyOptional({
    description: 'Search by invoice number or customer name',
    example: 'SL/O+MKT',
  })
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    description: 'Show only invoices with data quality alerts',
    example: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  alertsOnly?: boolean;

  @ApiPropertyOptional({
    description: 'Page number for pagination',
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsInt()
  @Type(() => Number)
  pageSize?: number;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    example: 10,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class OrderItemDetailDto {
  productCode: string;
  productName: string;
  unit: number;
  priceList: number;
  dpp: number;
  discount: number;
  netSales: number;

  // Validation flags
  hasPriceVariance?: boolean;
  isDuplicate?: boolean;
  isBelowCost?: boolean;
  hasNegativeQty?: boolean;
}

export class InvoiceWithItemsDto {
  invoiceId: number;
  invoiceNumber: string;
  invoiceDate: Date;
  customerId: number;
  customerName: string;
  customerType: string;

  // Invoice totals
  totalItems: number;
  totalUnits: number;
  totalDPP: number;
  totalDiscount: number;
  totalNetSales: number;

  // Line items
  items: OrderItemDetailDto[];

  // Validation flags
  hasMissingPrices?: boolean;
  hasDuplicateItems?: boolean;
  hasAnomalies?: boolean;
}

export class DataQualityIssueDto {
  type:
    | 'price_variance'
    | 'duplicate'
    | 'missing_price'
    | 'negative_qty'
    | 'below_cost';
  severity: 'warning' | 'error';
  message: string;
  affectedInvoices: string[];
}

export class ProductSalesReportSummaryDto {
  totalRevenue: number;
  totalItems: number;
  totalUnits: number;
  avgUnitPrice: number;
  alertCount: number;
}

export class ProductSalesReportResponseDto {
  data: InvoiceWithItemsDto[];
  summary: ProductSalesReportSummaryDto;
  dataQualityIssues: DataQualityIssueDto[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
  };
}
