import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsOptional,
  Min,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for Recording Purchase Transaction (Material In)
 *
 * Used for:
 * - Barang Baku (Raw Materials)
 * - Barang Pembantu (Supporting Materials)
 * - Barang Kemasan (Packaging Materials)
 *
 * Updates:
 * - daily_inventory.barangMasuk++ (increment by quantity)
 * - Creates inventory_transactions with type PURCHASE
 */
export class CreatePurchaseDto {
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  productCodeId: number; // Material product code ID

  @IsNotEmpty()
  @IsNumber()
  @Min(1, { message: 'Quantity must be at least 1' })
  @Type(() => Number)
  quantity: number; // Purchase quantity

  @IsOptional()
  @IsDateString()
  purchaseDate?: string; // YYYY-MM-DD, default: today

  @IsOptional()
  @IsString()
  supplierName?: string; // Supplier name

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  purchasePrice?: number; // Unit price (for cost tracking)

  @IsOptional()
  @IsString()
  invoiceNumber?: string; // Supplier invoice number

  @IsOptional()
  @IsString()
  notes?: string; // Additional notes
}
