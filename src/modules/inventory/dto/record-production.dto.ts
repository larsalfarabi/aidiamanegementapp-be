import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsOptional,
  IsEnum,
  Min,
  IsDate,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for recording production receipt (hasil produksi masuk gudang)
 * Used when finished goods from production are ready to be stored in warehouse
 */
export class RecordProductionDto {
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  productCodeId: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  quantity: number; // Jumlah produk yang dihasilkan

  @IsNotEmpty()
  @IsString()
  productionBatchNumber: string; // e.g., "BATCH-20250105-001"

  @IsOptional()
  @IsEnum(['PASS', 'FAIL', 'PENDING'])
  qualityCheckStatus?: 'PASS' | 'FAIL' | 'PENDING';

  @IsOptional()
  @IsString()
  notes?: string; // Catatan tambahan (kualitas, kondisi, dll)

  @IsOptional()
  @IsString()
  performedBy?: string; // Nama staff produksi yang melakukan

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  productionDate?: Date; // ✅ NEW: Date of production for backdating
}
