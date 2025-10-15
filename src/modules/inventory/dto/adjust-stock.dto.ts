import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsOptional,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for stock adjustment (stock opname)
 * Used when physical count doesn't match system count
 */
export class AdjustStockDto {
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  productCodeId: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  physicalCount: number; // Hasil physical count

  @IsNotEmpty()
  @IsString()
  reason: string; // Alasan adjustment

  @IsOptional()
  @IsString()
  notes?: string; // Catatan tambahan

  @IsOptional()
  @IsString()
  performedBy?: string; // Nama staff yang melakukan stock opname
}
