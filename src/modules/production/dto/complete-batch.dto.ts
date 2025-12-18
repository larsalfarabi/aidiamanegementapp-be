import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsInt,
  IsArray,
  ValidateNested,
  Min,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for Material Usage Item
 * Tracks actual material consumption during production
 */
export class MaterialUsageItemDto {
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  materialProductCodeId: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  actualQuantity: number;

  @IsNotEmpty()
  @IsString()
  unit: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  unitCost: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * DTO for Bottling Output Item
 * Records quantity per product size (SKU)
 *
 * Business Rules:
 * - Each output must match batch's product concept (name, category, type)
 * - quantity = good output (added to inventory via PRODUCTION_IN)
 * - wasteQuantity = defective bottles (not added to inventory)
 *
 * Example:
 * { productCodeId: 101, quantity: 60, wasteQuantity: 5, notes: "5 botol pecah" }
 * → Creates PRODUCTION_IN transaction for 60 bottles (good output only)
 */
export class BottlingOutputDto {
  @IsNotEmpty({ message: 'Product code ID is required' })
  @IsNumber()
  @Type(() => Number)
  productCodeId: number;

  @IsNotEmpty({ message: 'Quantity is required' })
  @IsNumber()
  @Min(0, { message: 'Quantity must be at least 0' })
  @Type(() => Number)
  quantity: number;

  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Waste quantity must be at least 0' })
  @Type(() => Number)
  wasteQuantity?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * DTO for Completing Production Batch (REDESIGNED - Dec 2024)
 *
 * Purpose:
 * - Simplified single-form workflow (replaces startProduction + recordStage)
 * - Support multi-size bottling from single concentrate batch
 * - Integrate material tracking with inventory transactions
 * - Enable draft mode for delayed data entry
 *
 * Workflow:
 * 1. Production team completes batch (end of day data entry)
 * 2. Records concentrate volume + multi-size bottling outputs
 * 3. Records material consumption
 * 4. System creates:
 *    - PRODUCTION_OUT transactions for materials used
 *    - PRODUCTION_IN transactions for each bottling output (good quantity only)
 *    - ProductionBottlingOutput records per size
 *
 * Example:
 * Batch: Jambu Merah 40L concentrate
 * - actualConcentrate: 40
 * - bottlingOutputs: [
 *     { productCodeId: 101, quantity: 60, wasteQuantity: 5 },  // JM-600ML
 *     { productCodeId: 102, quantity: 40, wasteQuantity: 2 }   // JM-1000ML
 *   ]
 * - materialUsages: [...]
 * - isDraft: false (finalize and create inventory transactions)
 */
export class CompleteBatchDto {
  // Concentrate Production
  @IsNotEmpty({ message: 'Actual concentrate volume is required' })
  @IsNumber()
  @Min(0, { message: 'Concentrate volume must be at least 0' })
  @Type(() => Number)
  actualConcentrate: number; // Actual concentrate produced (liters)

  // Bottling Outputs (Multi-size Support)
  @IsNotEmpty({ message: 'At least one bottling output is required' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BottlingOutputDto)
  bottlingOutputs: BottlingOutputDto[];

  // Material Usage (for inventory tracking)
  @IsNotEmpty({ message: 'Material usages are required' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MaterialUsageItemDto)
  materialUsages: MaterialUsageItemDto[];

  // Production Notes
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  productionNotes?: string;

  @IsOptional()
  @IsString()
  performedBy?: string; // Staff name who performed production

  // Draft Mode (for delayed data entry)
  @IsOptional()
  @IsBoolean()
  isDraft?: boolean; // true = save as DRAFT, false = finalize as COMPLETED
}
