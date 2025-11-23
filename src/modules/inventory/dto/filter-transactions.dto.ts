import { IsOptional, IsEnum, IsNumber, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { TransactionType } from '../entity/inventory_transactions.entity';

/**
 * DTO for filtering inventory transactions
 * Used in GET /inventory/transactions endpoint with query parameters
 */
export class FilterTransactionsDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  productCodeId?: number;

  @IsOptional()
  @IsEnum(TransactionType)
  transactionType?: TransactionType;

  @IsOptional()
  @IsString()
  startDate?: string; // ISO date string

  @IsOptional()
  @IsString()
  endDate?: string; // ISO date string

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  orderId?: number;

  @IsOptional()
  @IsString()
  productionBatchNumber?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsString()
  mainCategory?: string; // Filter by main category name (e.g., 'Barang Jadi', 'Bahan Baku', 'Bahan Pembantu', 'Bahan Kemasan')
}
