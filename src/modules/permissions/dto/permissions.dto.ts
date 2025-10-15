import { IsNumber, IsString, IsEnum, IsBoolean } from 'class-validator';
import { Resource } from '../../../common/enums/resource.enum';
import { Action } from '../../../common/enums/resource.enum';
import { PickType, PartialType } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';
export class PermissionsDto {
  @IsNumber()
  id: number;

  @IsString()
  name: string;

  @IsEnum(Resource)
  resource: Resource;

  @IsEnum(Action)
  action: Action;

  @IsString()
  description: string;

  @IsBoolean()
  isActive: boolean;
}

export class CreatePermissionDto extends PickType(PermissionsDto, [
  'name',
  'resource',
  'action',
  'description',
  'isActive',
]) {}

export class UpdatePermissionDto extends PartialType(PermissionsDto) {}
