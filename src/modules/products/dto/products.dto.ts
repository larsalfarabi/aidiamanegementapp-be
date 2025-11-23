import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsUrl,
  IsBoolean,
  IsNumber,
  IsPositive,
  Min,
  IsDecimal,
  IsInt,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { OmitType, PickType } from '@nestjs/swagger';
import { ProductType } from '../entity/products.entity';
import { IsEnum } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

// ================== PRODUCTS DTOs ==================
export class ProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  name: string;

  @IsEnum(ProductType)
  @IsOptional()
  productType?: ProductType = ProductType.RTD;

  @IsOptional()
  @IsString()
  @IsUrl({}, { message: 'imageUrl must be a valid URL' })
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  isActive?: boolean = true;

  @IsOptional()
  createdBy?: { id: number };

  @IsOptional()
  updatedBy?: { id: number };
}

export class CreateProductDto extends OmitType(ProductDto, ['updatedBy']) {}

export class UpdateProductDto extends PartialType(ProductDto) {}

export class QueryProductDto extends PaginationDto {
  @IsOptional()
  @IsString()
  mainCategory?: string;
}

// DTO for checking/creating product item (find or create pattern)
export class CheckOrCreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  name: string;

  @IsEnum(ProductType)
  @IsOptional()
  productType?: ProductType;

  @IsNotEmpty()
  category: number;

  @IsOptional()
  createdBy?: { id: number };
}

// ================== PRODUCT CATEGORIES DTOs ==================

export class ProductCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  createdBy?: { id: number };

  @IsOptional()
  updatedBy?: { id: number };
}

export class CreateProductCategoryDto extends OmitType(ProductCategoryDto, [
  'updatedBy',
]) {}

export class UpdateProductCategoryDto extends PartialType(ProductCategoryDto) {}

// ================== PRODUCT SIZES DTOs ==================

export enum ProductSizeUnit {
  ML = 'ML',
  LITER = 'LITER',
  KG = 'KG',
  GRAM = 'GRAM',
  PCS = 'PCS',
  GLN = 'GLN', // Galon
  BTL = 'BTL', // Botol
  CUP = 'CUP',
}

export class ProductSizeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  sizeValue: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  unitOfMeasure: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  baseValue?: number;

  @IsEnum(ProductSizeUnit)
  @IsNotEmpty()
  baseUnit: ProductSizeUnit;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  categoryType?: string;

  @IsOptional()
  createdBy?: { id: number };

  @IsOptional()
  updatedBy?: { id: number };
}

export class CreateProductSizeDto extends OmitType(ProductSizeDto, [
  'updatedBy',
]) {}

export class UpdateProductSizeDto extends PartialType(ProductSizeDto) {}

// ================== PRODUCT CODES DTOs ==================

export class ProductCodeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  productCode: string;

  @IsNumber()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  product: number;

  @IsNumber()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  category: number;

  @IsNumber()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  size: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  isActive?: boolean = true;

  @IsOptional()
  @IsBoolean()
  isDeleted?: boolean;

  // Will be injected by @InjectCreatedBy decorator
  @IsOptional()
  createdBy?: { id: number };

  @IsOptional()
  updatedBy?: { id: number };

  @IsOptional()
  deletedBy?: { id: number };
}

export class CreateProductCodeDto extends OmitType(ProductCodeDto, [
  'updatedBy',
  'isDeleted',
  'deletedBy',
]) {}

export class UpdateProductCodeDto extends PartialType(ProductCodeDto) {}

export class DeleteProductCodeDto extends PickType(ProductCodeDto, [
  'deletedBy',
  'isDeleted',
]) {}

// ================== QUERY DTOs ==================

export class ProductQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  isActive?: boolean;
}

export class ProductCodeQueryDto extends ProductQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  mainCategory?: string;

  @IsOptional()
  @IsNumber()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  subCategoryId?: number;

  @IsOptional()
  @IsNumber()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  size?: number;
}

// Query DTO for Product Sizes with category filter
export class ProductSizeQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  categoryType?: string; // Filter by categoryType (BARANG_JADI, BAHAN_BAKU, BAHAN_KEMASAN, BAHAN_PEMBANTU)
}

// ================== RESPONSE DTOs ==================

export class ProductResponseDto {
  id: number;
  name: string;
  imageUrl?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: {
    id: number;
    username: string;
  };
  updatedBy?: {
    id: number;
    username: string;
  };
}

export class ProductCategoryResponseDto {
  id: number;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: {
    id: number;
    username: string;
  };
  updatedBy?: {
    id: number;
    username: string;
  };
}

export class ProductSizeResponseDto {
  id: number;
  sizeValue: string;
  unitOfMeasure: string;
  baseValue?: number;
  baseUnit: string;
  categoryType?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: {
    id: number;
    username: string;
  };
  updatedBy?: {
    id: number;
    username: string;
  };
}

export class ProductCodeResponseDto {
  id: number;
  productCode: string;
  baseUnitPrice: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  product?: {
    id: number;
    name: string;
    imageUrl?: string;
  };
  category?: {
    id: number;
    name: string;
    description?: string;
  };
  size?: {
    id: number;
    sizeValue: string;
    unitOfMeasure: string;
    baseValue?: number;
    baseUnit: string;
    categoryType?: string;
  };
  createdBy?: {
    id: number;
    username: string;
  };
  updatedBy?: {
    id: number;
    username: string;
  };
}

// ================== BULK OPERATION DTOs ==================

export class BulkCreateProductCodesDto {
  @IsNotEmpty()
  @Type(() => CreateProductCodeDto)
  productCodes: CreateProductCodeDto[];
}

export class BulkUpdateProductCodesDto {
  @IsNotEmpty()
  @Type(() => UpdateProductCodeDto)
  productCodes: (UpdateProductCodeDto & { id: number })[];
}
