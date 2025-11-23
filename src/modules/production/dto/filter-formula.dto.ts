import { IsOptional, IsString, IsBoolean } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';

/**
 * FilterFormulaDto
 * Query parameters for production formulas
 *
 * Usage Examples:
 * - GET /production/formulas                           → All formulas
 * - GET /production/formulas?productCodeId=5           → Formulas for product
 * - GET /production/formulas?isActive=true             → Active formulas only
 * - GET /production/formulas?search=formula            → Search by name/code
 * - GET /production/formulas?page=1&pageSize=10        → Paginated
 */
export class FilterFormulaDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  productCodeId?: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  })
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  search?: string;
}
