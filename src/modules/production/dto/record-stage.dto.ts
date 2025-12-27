import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsEnum,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for Recording Production Stage
 */
export class RecordStageDto {
  @IsNotEmpty()
  @IsEnum(['PRODUCTION', 'BOTTLING', 'QC'], {
    message: 'stage must be PRODUCTION, BOTTLING, or QC',
  })
  stage: 'PRODUCTION' | 'BOTTLING' | 'QC';

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  outputQuantity: number;

  @IsOptional()
  @IsString()
  outputUnit?: string; // LITERS for PRODUCTION, BOTTLES for BOTTLING

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  wasteQuantity?: number;

  @IsOptional()
  @IsString()
  wasteUnit?: string;

  // QC specific fields (only for QC stage)
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  qcPassedQty?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  qcFailedQty?: number;

  @IsOptional()
  @IsString()
  performedBy?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
