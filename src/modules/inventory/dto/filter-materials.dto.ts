import { IsOptional, IsDate, IsString, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';

/**
 * DTO for filtering materials inventory
 */
export class FilterMaterialsDto extends PaginationDto {
  @ApiPropertyOptional({
    description:
      'Main category name (BAHAN BAKU, BAHAN PEMBANTU, BARANG KEMASAN)',
    example: 'BAHAN BAKU',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Business date (YYYY-MM-DD)',
    example: '2025-11-15',
  })
  @IsOptional()
  @IsDate()
  businessDate?: string;

  @ApiPropertyOptional({
    description: 'Stock status filter',
    enum: ['OUT_OF_STOCK', 'LOW_STOCK', 'AVAILABLE', 'OVERSTOCK'],
  })
  @IsOptional()
  @IsEnum(['OUT_OF_STOCK', 'LOW_STOCK', 'AVAILABLE', 'OVERSTOCK'])
  stockStatus?: string;

  @ApiPropertyOptional({
    description: 'Product code search',
    example: 'BB-GULA-001',
  })
  @IsOptional()
  @IsString()
  productCode?: string;

  @ApiPropertyOptional({
    description: 'Product name search',
    example: 'Gula',
  })
  @IsOptional()
  @IsString()
  productName?: string;
}

/**
 * DTO for filtering purchase transactions
 */
export class FilterPurchasesDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Start date (YYYY-MM-DD)',
    example: '2025-11-01',
  })
  @IsOptional()
  @IsDate()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date (YYYY-MM-DD)',
    example: '2025-11-30',
  })
  @IsOptional()
  @IsDate()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Purchase number search',
    example: 'PUR-20251115-001',
  })
  @IsOptional()
  @IsString()
  purchaseNumber?: string;

  @ApiPropertyOptional({
    description: 'PO number search',
    example: 'PO-2025-001',
  })
  @IsOptional()
  @IsString()
  poNumber?: string;

  @ApiPropertyOptional({
    description: 'Status filter',
    enum: ['COMPLETED', 'CANCELLED'],
  })
  @IsOptional()
  @IsEnum(['COMPLETED', 'CANCELLED'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Main category filter',
    example: 'BAHAN BAKU',
  })
  @IsOptional()
  @IsString()
  category?: string;
}
