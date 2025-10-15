import { IsOptional, IsNumber, IsBoolean, IsEnum } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';

/**
 * DTO for filtering inventory list
 * Used in GET /inventory endpoint with query parameters
 */
export class FilterInventoryDto extends PaginationDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  productCodeId?: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  lowStock?: boolean; // Filter products with low stock (quantityAvailable <= minimumStock)

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean;

  @IsOptional()
  @IsEnum(['OUT_OF_STOCK', 'LOW_STOCK', 'AVAILABLE', 'OVERSTOCK'])
  stockStatus?: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'AVAILABLE' | 'OVERSTOCK';
}
