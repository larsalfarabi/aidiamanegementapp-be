import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class PaginationDto {
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page?: number = 1;

  @IsInt()
  @Type(() => Number)
  pageSize?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  limit: number;

  @IsOptional()
  @IsString({ message: 'SortBy must be a string' })
  @Transform(({ value }) => value?.trim())
  sortBy?: string = 'id';

  @IsEnum(SortOrder, { message: 'SortOrder must be either ASC or DESC' })
  sortOrder?: SortOrder = SortOrder.DESC;

  @IsOptional()
  @IsString({ message: 'Search must be a string' })
  @Transform(({ value }) => value?.trim())
  search?: string;
}
