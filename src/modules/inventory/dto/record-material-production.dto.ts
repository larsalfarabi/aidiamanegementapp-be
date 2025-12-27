import {
  IsNotEmpty,
  IsInt,
  IsPositive,
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for individual material usage in production
 */
export class MaterialUsageDto {
  @IsInt()
  @IsPositive()
  @IsNotEmpty()
  productCodeId: number;

  @IsNotEmpty()
  @IsPositive()
  quantity: number; // Positive value, will be converted to negative

  @IsString()
  @IsOptional()
  unit?: string;
}

/**
 * DTO for recording material consumption in production
 * Creates PRODUCTION_MATERIAL_OUT transactions
 */
export class RecordMaterialProductionDto {
  @IsString()
  @IsNotEmpty()
  productionBatchNumber: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MaterialUsageDto)
  @IsNotEmpty()
  materials: MaterialUsageDto[];

  @IsString()
  @IsOptional()
  performedBy?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
