import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export enum MainCategoryType {
  SUB = 'SUB', // Filter by Sub-Category (existing behavior)
  BARANG_BAKU = 'BARANG_BAKU', // Filter by Barang Baku with canBeProduced=true
}

export class ProductionReportFilterDto {
  @ApiProperty({
    example: '2024-01-01',
    description: 'Start Date (YYYY-MM-DD)',
  })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2024-01-31', description: 'End Date (YYYY-MM-DD)' })
  @IsDateString()
  endDate: string;

  @ApiProperty({ required: false, description: 'Optional search term' })
  @IsOptional()
  search?: string;

  @ApiProperty({ required: false, description: 'Filter by Sub Category ID' })
  @IsOptional()
  subCategoryId?: number;

  @ApiProperty({ required: false, description: 'Page number (default: 1)' })
  @IsOptional()
  page?: number;

  @ApiProperty({ required: false, description: 'Items per page (default: 10)' })
  @IsOptional()
  pageSize?: number;

  @ApiProperty({
    required: false,
    enum: MainCategoryType,
    description:
      'Filter by main category type: SUB (sub-categories) or BARANG_BAKU (raw materials with canBeProduced=true)',
  })
  @IsOptional()
  @IsEnum(MainCategoryType)
  mainCategoryType?: MainCategoryType;
}
