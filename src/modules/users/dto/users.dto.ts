import { PickType, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsNumber,
  IsString,
  IsOptional,
  IsObject,
} from 'class-validator';

export class UserDto {
  @IsNumber()
  id: number;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsString()
  @IsEmail()
  email: string;

  @IsBoolean()
  isEmailVerified: boolean;

  @IsString()
  password: string;

  @IsNumber()
  roleId: number;

  @IsBoolean()
  isActive: boolean;

  @IsString()
  refresh_token: string;

  @IsObject()
  @IsOptional()
  created_by: { id: number };

  @IsObject()
  @IsOptional()
  updated_by: { id: number };
}

export class CreateUserDto extends PickType(UserDto, [
  'firstName',
  'lastName',
  'email',
  'roleId',
  'isActive',
]) {
  @IsString()
  password?: string;
}

export class UpdateUserDto extends PartialType(UserDto) {}
