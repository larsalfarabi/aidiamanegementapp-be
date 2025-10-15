import { IsOptional, IsDate, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';

/**
 * FilterDailyInventoryDto
 * Query parameters for daily inventory view
 *
 * Usage Examples:
 * - GET /inventory/daily                              → Today's data, all products
 * - GET /inventory/daily?date=2025-10-12              → Specific date
 * - GET /inventory/daily?productCodeId=5              → Specific product, today
 * - GET /inventory/daily?date=2025-10-12&page=1       → Pagination
 * - GET /inventory/daily?stockStatus=LOW_STOCK        → Filter by status
 */
export class FilterDailyInventoryDto extends PaginationDto {
  @IsOptional()
  @IsDate()
  date?: string; // Format: 'YYYY-MM-DD' (default: today in WIB timezone)

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productCodeId?: number; // Filter by specific product

  @IsOptional()
  stockStatus?: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'AVAILABLE' | 'OVERSTOCK';

  @IsOptional()
  isActive?: boolean; // Filter only active products (default: true)
}
