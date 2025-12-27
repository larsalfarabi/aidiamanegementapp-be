import { IsOptional, IsString, IsEnum } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { BatchStatus, QCStatus } from '../entities/production-batches.entity';

/**
 * FilterBatchDto
 * Query parameters for production batches
 *
 * Usage Examples:
 * - GET /production/batches                                → All batches
 * - GET /production/batches?status=IN_PROGRESS             → Filter by status
 * - GET /production/batches?productCodeId=5                → Batches for product
 * - GET /production/batches?startDate=2025-01-01           → Date range
 * - GET /production/batches?qcStatus=PASSED                → QC filter
 */
export class FilterBatchDto extends PaginationDto {
  @IsOptional()
  @IsEnum(BatchStatus)
  status?: BatchStatus;

  @IsOptional()
  @Type(() => Number)
  productCodeId?: number;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  startDate?: string; // Format: YYYY-MM-DD

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  endDate?: string; // Format: YYYY-MM-DD

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  search?: string;

  @IsOptional()
  @IsEnum(QCStatus)
  qcStatus?: QCStatus;
}
