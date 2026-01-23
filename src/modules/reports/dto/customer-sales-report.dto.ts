import {
  IsOptional,
  IsDate,
  IsString,
  IsBoolean,
  IsInt,
  Min,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from 'src/common/dto/pagination.dto';

// ============================================================================
// QUERY DTO
// ============================================================================

export class CustomerSalesReportQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Start date (inclusive)',
    example: '2025-10-01',
  })
  @IsOptional()
  @Type(() => Date) // Transform query string to Date object
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({
    description: 'End date (inclusive)',
    example: '2025-10-31',
  })
  @IsOptional()
  @Type(() => Date) // Transform query string to Date object
  @IsDate()
  to?: Date;

  @ApiPropertyOptional({
    description: 'Filter by customer type',
    enum: ['HOTEL', 'CAFE & RESTO', 'CATERING', 'RESELLER'],
    example: 'HOTEL',
  })
  @IsOptional()
  @IsString()
  customerType?: string;
}

// ============================================================================
// RESPONSE DTOs
// ============================================================================

/**
 * Individual invoice detail under a customer
 */
export class InvoiceDetailDto {
  @ApiProperty({ example: 'SL/OJ-MKT/X/25/0001' })
  invoiceNumber: string;

  @ApiProperty({ example: '2025-10-18T00:00:00.000Z' })
  invoiceDate: Date;

  @ApiProperty({ example: 10, description: 'Total quantity of items' })
  unit: number;

  @ApiProperty({ example: 500000, description: 'Dasar Pengenaan Pajak' })
  dpp: number;

  @ApiProperty({ example: 5.5, description: 'Average discount percentage' })
  discount: number;

  @ApiProperty({
    example: 472500,
    description: 'Net sales after discount, before tax',
  })
  netSales: number;
}

/**
 * Customer sales data with aggregated totals
 */
export class CustomerSalesDataDto {
  @ApiProperty({ example: 1 })
  customerId: number;

  @ApiProperty({ example: 'Santika Hotel Bogor' })
  customerName: string;

  @ApiProperty({
    example: 'HOTEL',
    enum: ['HOTEL', 'CAFE & RESTO', 'CATERING', 'RESELLER'],
  })
  customerType: string;

  @ApiProperty({ example: 4, description: 'Total number of invoices' })
  totalInvoices: number;

  @ApiProperty({ example: 35, description: 'Total quantity sold' })
  totalUnits: number;

  @ApiProperty({ example: 1158000, description: 'Total DPP' })
  totalDPP: number;

  @ApiProperty({ example: 3.5, description: 'Average discount percentage' })
  totalDiscount: number;

  @ApiProperty({ example: 1138000, description: 'Total net sales' })
  totalNetSales: number;

  @ApiProperty({ type: [InvoiceDetailDto], description: 'List of invoices' })
  invoices: InvoiceDetailDto[];
}

/**
 * Summary statistics for the report
 */
export class CustomerSalesReportSummaryDto {
  @ApiProperty({
    example: 15800000,
    description: 'Total revenue across all customers',
  })
  totalRevenue: number;

  @ApiProperty({ example: 78, description: 'Total number of invoices' })
  totalInvoices: number;

  @ApiProperty({ example: 5, description: 'Total number of customers' })
  totalCustomers: number;

  @ApiProperty({ example: 3160000, description: 'Average sales per customer' })
  avgPerCustomer: number;

  @ApiProperty({ example: 3.2, description: 'Average discount percentage' })
  avgDiscount: number;
}

/**
 * Main response wrapper
 */
export class CustomerSalesReportResponseDto {
  @ApiProperty({
    type: [CustomerSalesDataDto],
    description: 'Customer sales data',
  })
  data: CustomerSalesDataDto[];

  @ApiProperty({ type: CustomerSalesReportSummaryDto })
  summary: CustomerSalesReportSummaryDto;

  @ApiProperty({
    example: {
      total: 50,
      page: 1,
      pageSize: 10,
    },
  })
  pagination: {
    total: number;
    page: number;
    pageSize: number;
  };
}
