import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString, IsEmail, IsNumber } from 'class-validator';
import { CustomerSalesReportQueryDto } from './customer-sales-report.dto';

/**
 * DTO for Customer Sales Excel Export
 * Extends base query DTO with user info for email notification
 */
export class CustomerSalesExportQueryDto extends CustomerSalesReportQueryDto {
  @ApiPropertyOptional({
    description: 'User ID who requested the export (for audit)',
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  userId?: number;

  @ApiPropertyOptional({
    description: 'User email for notification when export is ready',
    example: 'user@salesaidia.com',
  })
  @IsOptional()
  @IsEmail()
  userEmail?: string;

  @ApiPropertyOptional({
    description: 'User full name for email personalization',
    example: 'John Doe',
  })
  @IsOptional()
  @IsString()
  userName?: string;
}

/**
 * Response DTO for immediate download
 */
export class ExportResponseDto {
  message: string;
  fileName: string;
  recordCount: number;
  fileSize?: number; // in bytes
}

/**
 * Response DTO for queued export
 */
export class QueuedExportResponseDto {
  message: string;
  jobId: string;
  estimatedTime: string;
  notification: string;
}
