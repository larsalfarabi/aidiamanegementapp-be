import { IsOptional, IsNumber, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for updating inventory settings
 * Used to update minimum/maximum stock levels, production cost, etc.
 */
export class UpdateInventoryDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minimumStock?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maximumStock?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
