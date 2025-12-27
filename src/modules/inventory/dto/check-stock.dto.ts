import {
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsPositive,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for individual order item in stock check request
 */
export class OrderItemStockCheckDto {
  @IsInt()
  @IsPositive()
  @IsNotEmpty()
  productCodeId: number;

  @IsInt()
  @IsPositive()
  @IsNotEmpty()
  quantity: number;
}

/**
 * DTO for stock check request
 * Validates stock availability based on invoice date
 */
export class CheckStockDto {
  @IsDateString()
  @IsNotEmpty()
  invoiceDate: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemStockCheckDto)
  @IsNotEmpty()
  orderItems: OrderItemStockCheckDto[];
}
