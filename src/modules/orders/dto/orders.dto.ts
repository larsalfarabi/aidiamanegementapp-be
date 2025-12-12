import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsDate,
  IsArray,
  ValidateNested,
  Min,
  IsPositive,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsBoolean } from 'class-validator';
import { PickType } from '@nestjs/swagger';

export class OrderDto {
  @IsNotEmpty()
  @IsNumber()
  customerId: number;

  @IsOptional()
  @IsDate()
  orderDate?: Date;

  @IsOptional()
  @IsDate()
  invoiceDate?: Date;

  @IsOptional()
  @IsString()
  customerNotes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  orderItems: CreateOrderItemDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  paidAmount?: number;

  @IsString()
  paymentInfo: string;

  @IsOptional()
  @IsString()
  internalNotes?: string;

  @IsBoolean()
  @IsOptional()
  isDeleted?: boolean;

  // Will be injected by @InjectCreatedBy decorator
  @IsOptional()
  createdBy?: { id: number };

  // Will be injected by @InjectCreatedBy decorator (for initial updatedBy)
  @IsOptional()
  updatedBy?: { id: number };

  @IsOptional()
  deletedBy?: { id: number };
}

export class CreateOrderItemDto {
  @IsNotEmpty()
  @IsNumber()
  productCodeId: number;

  @IsOptional()
  @IsNumber()
  customerCatalogId?: number;

  @IsNotEmpty()
  @IsNumber()
  @IsPositive()
  quantity: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateOrderDto extends PickType(OrderDto, [
  'customerId',
  'orderDate',
  'invoiceDate',
  'orderItems',
  'internalNotes',
  'customerNotes',
  'customerNotes',
  'createdBy',
]) {}

export class UpdateOrderDto extends PickType(OrderDto, [
  'customerId',
  'orderDate',
  'orderItems',
  'internalNotes',
  'updatedBy',
]) {}

export class DeleteOrderDto extends PickType(OrderDto, [
  'isDeleted',
  'deletedBy',
]) {
  @IsOptional()
  @IsString()
  deleteReason?: string;
}

export class OrderFilterDto {
  @IsOptional()
  @IsNumber()
  customerId?: number;

  @IsOptional()
  @IsDate()
  startDate?: string;

  @IsOptional()
  @IsDate()
  endDate?: string;

  @IsOptional()
  @IsString()
  orderNumber?: string;
}

export class OrderResponseDto {
  id: number;
  orderNumber: string;
  customerId: number;
  customerCode: string;
  customerName: string;
  customerAddress: string;
  orderDate: Date;
  invoiceDate: Date;
  subtotal: number;
  taxPercentage: number;
  taxAmount: number;
  grandTotal: number;
  paidAmount: number;
  remainingAmount: number;
  dueDate: Date;
  customerNotes: string;
  internalNotes: string;
  paymentInfo: string;
  orderItems: OrderItemResponseDto[];
  createdAt: Date;
  updatedAt: Date;
}

export class OrderItemResponseDto {
  id: number;
  productCodeValue: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  unit: string;
  lineTotal: number;
  discountPercentage: number;
  discountAmount: number;
  notes: string;
}

export class OrderSummaryResponseDto {
  id: number;
  orderNumber: string;
  customerName: string;
  orderDate: Date;
  grandTotal: number;
  remainingAmount: number;
}
