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
 * DTO for recording inventory transactions
 * This is the base DTO used by transaction operations service
 */
export class RecordTransactionDto {
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  productCodeId: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  quantity: number;

  @IsNotEmpty()
  @IsEnum(['IN', 'OUT'])
  transactionType: 'IN' | 'OUT';

  @IsNotEmpty()
  @IsString()
  category: string; // 'production', 'sale', 'repacking', 'sample', 'adjustment'

  @IsOptional()
  @IsString()
  referenceType?: string; // 'order', 'repacking_record', 'sample_tracking'

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  referenceId?: number; // ID dari order/repacking/sample record

  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * DTO for recording sales/order fulfillment
 * Updates daily_inventory.dipesan column
 */
export class RecordSaleDto {
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  productCodeId: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  quantity: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  orderId?: number; // Link to orders table

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  invoiceDate?: Date; // ✅ NEW: Invoice date for determining which daily_inventory to update
}

/**
 * DTO for recording repacking operation
 * Updates daily_inventory.barangOutRepack for source product
 */
export class RecordRepackingDto {
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  sourceProductCodeId: number;

  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  targetProductCodeId: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  sourceQuantity: number; // Jumlah yang diambil dari source

  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  targetQuantity: number; // Jumlah yang dihasilkan di target

  @IsOptional()
  @IsString()
  reason?: string; // Alasan repacking

  @IsOptional()
  @IsString()
  performedBy?: string; // Staff yang melakukan
}

/**
 * DTO for recording sample out
 * Updates daily_inventory.barangOutSample column
 */
export class RecordSampleDto {
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  productCodeId: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  quantity: number;

  @IsNotEmpty()
  @IsString()
  customerName: string; // Customer yang minta sample

  @IsOptional()
  @IsString()
  purpose?: string; // Tujuan sample (testing, demo, dll)

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  expectedReturnDate?: Date;

  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * DTO for returning sample
 * Updates daily_inventory.barangMasuk if returned
 */
export class ReturnSampleDto {
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  sampleTrackingId: number;

  @IsNotEmpty()
  @IsEnum(['returned', 'lost', 'damaged'])
  status: 'returned' | 'lost' | 'damaged';

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  returnedQuantity?: number; // Jumlah yang dikembalikan (bisa partial)

  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * DTO for reversing/cancelling a sale transaction
 * Used when orders are cancelled or deleted
 * Decrements daily_inventory.dipesan
 */
export class ReverseSaleDto {
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  orderId: number;

  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  productCodeId: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  quantity: number;

  @IsOptional()
  @IsString()
  reason?: string; // E.g., "Order cancelled by customer"
}
