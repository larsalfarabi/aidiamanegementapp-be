import {
  IsNotEmpty,
  IsString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsDate,
} from 'class-validator';
import { OmitType, PartialType, PickType } from '@nestjs/swagger';
export enum CustomerType {
  HOTEL = 'Hotel',
  CAFE_RESTO = 'Cafe & Resto',
  CATERING = 'Catering',
  RESELLER = 'Reseller',
}

export enum TaxType {
  PPN = 'PPN',
  NON_PPN = 'Non PPN',
}

export class CustomerDto {
  @IsNotEmpty()
  @IsString()
  customerCode: string;

  @IsNotEmpty()
  @IsString()
  customerName: string;

  @IsNotEmpty()
  @IsString()
  address: string;

  @IsNotEmpty()
  @IsString()
  contactPerson: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsNotEmpty()
  @IsString()
  phoneNumber: string;

  @IsEnum(CustomerType, {
    message:
      'Tipe palanggan hanya boleh Hotel, Cafe & Resto, Catering, atau Reseller',
  })
  customerType: CustomerType;

  @IsEnum(TaxType, { message: 'Tipe pajak hanya boleh PPN atau Non PPN' })
  taxType: TaxType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

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

export class CreateCustomerDto extends OmitType(CustomerDto, [
  'updatedBy',
  'deletedBy',
  'isDeleted',
]) {}

export class UpdateCustomerDto extends PartialType(CustomerDto) {}

export class DeleteCustomerDto extends PickType(CustomerDto, [
  'isDeleted',
  'deletedBy',
]) {}

export class CustomerProductCatalogDto {
  @IsNotEmpty()
  @IsNumber()
  customerId: number;

  @IsNotEmpty()
  @IsNumber()
  productCodeId: number;

  @IsNotEmpty()
  @IsNumber()
  customerPrice: number;

  @IsOptional()
  @IsNumber()
  discountPercentage?: number;

  @IsOptional()
  @IsDate()
  effectiveDate?: Date;

  @IsOptional()
  @IsDate()
  expiryDate?: Date;

  @IsOptional()
  @IsString()
  notes?: string;

  // Will be injected by @InjectCreatedBy decorator
  @IsOptional()
  createdBy?: { id: number };

  // Will be injected by @InjectCreatedBy decorator (for initial updatedBy)
  @IsOptional()
  updatedBy?: { id: number };
}

export class CreateCustomerProductCatalogDto extends OmitType(
  CustomerProductCatalogDto,
  ['updatedBy'],
) {}

export class UpdateCustomerProductCatalogDto extends PickType(
  CustomerProductCatalogDto,
  [
    'customerPrice',
    'discountPercentage',
    'effectiveDate',
    'expiryDate',
    'notes',
    'updatedBy',
  ],
) {}

// Excel upload response types
export interface ExcelUploadResult {
  totalRows: number;
  successCount: number;
  failureCount: number;
  errors: ExcelUploadError[];
  successDetails: ExcelUploadSuccess[];
}

export interface ExcelUploadError {
  row: number;
  customerCode?: string;
  customerName?: string;
  errors: string[];
}

export interface ExcelUploadSuccess {
  row: number;
  customerCode: string;
  customerName: string;
}

// Catalog Excel upload response types
export interface CatalogExcelUploadResult {
  totalRows: number;
  successCount: number;
  failureCount: number;
  errors: CatalogExcelUploadError[];
  successDetails: CatalogExcelUploadSuccess[];
}

export interface CatalogExcelUploadError {
  row: number;
  productCode?: string;
  errors: string[];
}

export interface CatalogExcelUploadSuccess {
  row: number;
  productCode: string;
  customerPrice: number;
  discountPercentage?: number;
}
