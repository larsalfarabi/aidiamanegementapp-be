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

// ================== PRODUCTS DTOs ==================
export class ProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
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

// DTO for checking/creating product item (find or create pattern)
export class CheckOrCreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsEnum(ProductType)
  @IsNotEmpty()
  productType: ProductType;

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

export class ProductSizeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  sizeValue: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  unitOfMeasure?: string = 'ml';

  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  volumeMili: number;

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
  productId: number;

  @IsNumber()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  categoryId: number;

  @IsNumber()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  sizeId: number;

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

export class ProductQueryDto {
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

  @IsOptional()
  @IsNumber()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  limit?: number = 10;
}

export class ProductCodeQueryDto extends ProductQueryDto {
  @IsOptional()
  @IsNumber()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  productId?: number;

  @IsOptional()
  @IsNumber()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  categoryId?: number;

  @IsOptional()
  @IsNumber()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  sizeId?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minPrice?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  maxPrice?: number;
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
  volumeMili: number;
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
    volumeMili: number;
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
