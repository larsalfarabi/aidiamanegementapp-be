import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsDateString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for Creating Production Batch
 *
 * This DTO is used when planning a new production batch.
 * The system will auto-calculate material requirements based on
 * the formula and target production volume.
 *
 * Example:
 * - Formula: LEMON BUFFET v1.0
 * - Target Production (targetLiters): 40 Liters
 * - System calculates: LEMON PREMIUM = 0.500 × 40 = 20.000 ML/LTR
 *                      FRUCTOSE = 0.013 × 40 = 0.520 KG
 *                      CITRIC ACID = 0.003 × 40 = 0.120 KG
 */
export class CreateBatchDto {
  @IsNotEmpty({ message: 'Formula ID is required' })
  @IsNumber()
  @Type(() => Number)
  formulaId: number;

  @IsNotEmpty({ message: 'Production date is required' })
  @IsDateString()
  productionDate: string; // Format: YYYY-MM-DD

  @IsNotEmpty({ message: 'Target production liters is required' })
  @IsNumber()
  @Type(() => Number)
  @Min(0.01, { message: 'Target liters must be greater than 0' })
  targetLiters: number; // This is the "40L" in template (yellow cell - base calculation)

  @IsOptional()
  @IsString()
  notes?: string;
}
