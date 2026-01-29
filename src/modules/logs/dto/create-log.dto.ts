import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum LogLevel {
  INFO = 'info',
  ERROR = 'error',
  WARN = 'warn',
  DEBUG = 'debug',
}

export class CreateLogDto {
  @IsEnum(LogLevel)
  @IsNotEmpty()
  level: LogLevel;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsString()
  @IsOptional()
  context?: string;

  @IsOptional()
  meta?: any;
}
