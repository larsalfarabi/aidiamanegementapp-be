import {
  IsNumber,
  IsString,
  IsBoolean,
  IsOptional,
  IsArray,
} from 'class-validator';
import { PickType, PartialType } from '@nestjs/swagger';
export class RolesDto {
  @IsNumber()
  id: number;

  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description: string;

  @IsBoolean()
  isActive: boolean;

  @IsArray()
  @IsNumber({}, { each: true })
  permissions: number[];
}

export class CreateRoleDto extends PickType(RolesDto, [
  'name',
  'description',
  'isActive',
  'permissions',
]) {}

export class UpdateRoleDto extends PartialType(RolesDto) {}
