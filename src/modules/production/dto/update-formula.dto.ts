import { PartialType } from '@nestjs/mapped-types';
import { CreateFormulaDto, FormulaMaterialItemDto } from './create-formula.dto';
import {
  IsOptional,
  IsString,
  IsNumber,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsDate,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for Updating Production Formula
 * All fields are optional (partial update)
 */
export class UpdateFormulaDto extends PartialType(CreateFormulaDto) {
  @IsOptional()
  @IsString()
  formulaName?: string;

  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  productCodeId?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDate()
  effectiveFrom?: Date;

  @IsOptional()
  @IsDate()
  effectiveTo?: Date;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormulaMaterialItemDto)
  materials?: FormulaMaterialItemDto[];
}
