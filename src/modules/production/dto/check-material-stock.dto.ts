// src/modules/production/dto/check-material-stock.dto.ts
import {
  IsArray,
  IsDateString,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MaterialStockCheckItemDto {
  @IsNumber()
  materialProductCodeId: number;

  @IsNumber()
  plannedQuantity: number;
}

export class CheckMaterialStockDto {
  @IsDateString()
  productionDate: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MaterialStockCheckItemDto)
  materials: MaterialStockCheckItemDto[];
}
