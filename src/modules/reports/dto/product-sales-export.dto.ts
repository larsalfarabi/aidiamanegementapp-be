import { IsOptional, IsEmail, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Base query DTO for Product Sales Report Export
 * Does NOT extend ProductSalesReportQueryDto to avoid pagination fields
 * Export fetches ALL records (up to 10,000 limit)
 */
export class ProductSalesExportQueryDto {
  @ApiProperty({
    description: 'Start date for the report (YYYY-MM-DD)',
    required: false,
    example: '2025-09-01',
  })
  @IsOptional()
  @Type(() => Date)
  from?: Date;

  @ApiProperty({
    description: 'End date for the report (YYYY-MM-DD)',
    required: false,
    example: '2025-09-30',
  })
  @IsOptional()
  @Type(() => Date)
  to?: Date;

  @ApiProperty({
    description: 'Filter by customer type',
    required: false,
    enum: ['Hotel', 'Cafe & Resto', 'Catering', 'Reseller'],
    example: 'Hotel',
  })
  @IsOptional()
  @IsString()
  customerType?: string;

  @ApiProperty({
    description: 'Filter by product category',
    required: false,
    example: 'BUFFET',
  })
  @IsOptional()
  @IsString()
  productCategory?: string;

  @ApiProperty({
    description: 'Search by invoice number or customer name',
    required: false,
    example: 'SL/O+MKT',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    description: 'Show only invoices with data quality alerts',
    required: false,
    example: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  alertsOnly?: boolean;

  @ApiProperty({
    description: 'User ID for audit trail',
    required: false,
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  userId?: number;

  @ApiProperty({
    description: 'User email for notifications (future use)',
    required: false,
    example: 'user@example.com',
  })
  @IsOptional()
  @IsEmail()
  userEmail?: string;

  @ApiProperty({
    description: 'User full name for Excel metadata header',
    required: false,
    example: 'John Doe',
  })
  @IsOptional()
  @IsString()
  userName?: string;
}

/**
 * Response DTO for successful export
 */
export class ExportResponseDto {
  @ApiProperty({
    description: 'Success message',
    example: 'Excel file generated successfully',
  })
  message: string;

  @ApiProperty({
    description: 'Generated filename',
    example: 'Laporan_Produk_Sep2025-Oct2025_20251108_143045.xlsx',
  })
  fileName: string;

  @ApiProperty({
    description: 'Total number of records exported',
    example: 1500,
  })
  recordCount: number;

  @ApiProperty({
    description: 'File size in bytes',
    required: false,
    example: 245678,
  })
  fileSize?: number;
}

/**
 * Response DTO for queued export jobs (future use)
 */
export class QueuedExportResponseDto {
  @ApiProperty({
    description: 'Job ID for tracking',
    example: 'export-job-123456',
  })
  jobId: string;

  @ApiProperty({
    description: 'Estimated completion time',
    example: '2025-11-08T14:35:00Z',
  })
  estimatedCompletionTime: Date;

  @ApiProperty({
    description: 'Message about queued job',
    example:
      'Export job queued. You will receive an email when the file is ready.',
  })
  message: string;
}
