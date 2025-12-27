import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
  IsBoolean,
  IsDate,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for Formula Material Item (nested in CreateFormulaDto)
 */
export class FormulaMaterialItemDto {
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  materialProductCodeId: number;

  // NEW: Formula Ratio for Dynamic Calculation
  @IsNotEmpty()
  @IsNumber()
  @Min(0, { message: 'rumusnot be negative' })
  @Type(() => Number)
  rumus: number;

  @IsNotEmpty()
  @IsString()
  unit: string; // KG, LITER, PCS, etc.

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  standardUnitCost?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  sequence?: number;
}

/**
 * DTO for Creating Production Formula
 */
export class CreateFormulaDto {
  @IsNotEmpty()
  @IsString()
  formulaName: string;

  @IsOptional()
  @IsString()
  version?: string; // Default: "1.0"

  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  productId: number; // Product concept (e.g., MANGO JUICE - PREMIUM - RTD)

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  productCodeId?: number; // OPTIONAL: Specific product size (for backward compatibility)

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean; // Default: true

  @IsNotEmpty()
  @IsDate()
  effectiveFrom: Date; // YYYY-MM-DD

  @IsOptional()
  @IsDate()
  effectiveTo?: Date; // YYYY-MM-DD or null

  // Array of materials (BOM)
  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormulaMaterialItemDto)
  materials: FormulaMaterialItemDto[];
}
