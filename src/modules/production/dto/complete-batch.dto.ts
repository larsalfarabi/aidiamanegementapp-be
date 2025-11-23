import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsInt,
  IsArray,
  ValidateNested,
  Min,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for Material Usage Item
 */
export class MaterialUsageItemDto {
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  materialProductCodeId: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  actualQuantity: number;

  @IsNotEmpty()
  @IsString()
  unit: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  unitCost: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * DTO for Completing Production Batch
 * This finalizes the batch and creates PRODUCTION_IN transaction
 */
export class CompleteBatchDto {
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  actualConcentrate: number; // Actual concentrate produced (liters)

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  actualQuantity: number; // Actual bottles produced

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  qcPassedQuantity: number; // Quantity that passed QC

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  qcFailedQuantity?: number; // Quantity that failed QC (default: 0)

  @IsNotEmpty()
  @IsEnum(['PASS', 'FAIL', 'PARTIAL'], {
    message: 'qcStatus must be PASS, FAIL, or PARTIAL',
  })
  qcStatus: 'PASS' | 'FAIL' | 'PARTIAL';

  @IsOptional()
  @IsString()
  qcNotes?: string;

  @IsOptional()
  @IsString()
  qcPerformedBy?: string;

  // Material usage array
  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MaterialUsageItemDto)
  materialUsages: MaterialUsageItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}
