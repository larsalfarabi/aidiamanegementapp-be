import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsOptional,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for stock adjustment - Direct stokAwal modification
 * Used for manual stock corrections (koreksi stok fisik)
 *
 * Impact: stokAwal baru = stokAwal lama + adjustmentQuantity
 * - Positive adjustmentQuantity = Add stock (tambah stok)
 * - Negative adjustmentQuantity = Reduce stock (kurangi stok)
 */
export class AdjustStockDto {
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  productCodeId: number;

  @IsNotEmpty()
  @IsDateString()
  businessDate: string; // Format: YYYY-MM-DD

  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  adjustmentQuantity: number; // Bisa positif (+) atau negatif (-)

  @IsNotEmpty()
  @IsString()
  reason: string; // Alasan adjustment (wajib untuk audit)

  @IsOptional()
  @IsString()
  notes?: string; // Catatan tambahan

  @IsOptional()
  @IsString()
  performedBy?: string; // Nama staff yang melakukan adjustment
}
