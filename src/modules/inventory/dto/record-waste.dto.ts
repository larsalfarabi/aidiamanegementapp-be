import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsOptional,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for recording waste/damaged products
 * Used when products are damaged, expired, or need to be disposed
 */
export class RecordWasteDto {
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  productCodeId: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  quantity: number; // Jumlah barang yang rusak/dibuang

  @IsNotEmpty()
  @IsString()
  reason: string; // Alasan: "Bocor", "Kadaluarsa", "Rusak", dll

  @IsOptional()
  @IsString()
  notes?: string; // Catatan detail

  @IsOptional()
  @IsString()
  performedBy?: string; // Nama staff yang melaporkan
}
