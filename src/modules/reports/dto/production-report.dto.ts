import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

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
}
