import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for creating initial inventory record
 * Used when setting up inventory for a new product
 */
export class CreateInventoryDto {
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  productCodeId: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  quantityOnHand?: number; // Initial stock (default 0)

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minimumStock?: number; // Minimum stock level

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maximumStock?: number; // Maximum stock capacity

  @IsOptional()
  @IsString()
  notes?: string;
}
