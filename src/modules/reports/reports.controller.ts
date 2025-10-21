import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import {
  ProductSalesReportQueryDto,
  ProductSalesReportResponseDto,
} from './dto/product-sales-report.dto';
import {
  CustomerSalesReportQueryDto,
  CustomerSalesReportResponseDto,
} from './dto/customer-sales-report.dto';
import { JwtGuard } from '../auth/guards/auth.guard';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('sales/products')
  @ApiOperation({
    summary: 'Get Product Sales Report',
    description:
      'Retrieve detailed sales report grouped by invoice with product line items. ' +
      'Supports filtering, pagination, and data quality validation. ' +
      'Price variance detection is per-customer to identify anomalies within same contract.',
  })
  @ApiResponse({
    status: 200,
    description: 'Product sales report retrieved successfully',
    type: ProductSalesReportResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid query parameters',
  })
  async getProductSalesReport(
    @Query() query: ProductSalesReportQueryDto,
  ): Promise<ProductSalesReportResponseDto> {
    return this.reportsService.getProductSalesReport(query);
  }

  @Get('sales/customers')
  @ApiOperation({
    summary: 'Get Customer Sales Report',
    description:
      'Retrieve detailed sales report grouped by customer with invoice details. ' +
      'Supports filtering by date range, customer type, search, and pagination. ' +
      'Data is aggregated per customer with total invoices, units, DPP, discount, and net sales.',
  })
  @ApiResponse({
    status: 200,
    description: 'Customer sales report retrieved successfully',
    type: CustomerSalesReportResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid query parameters',
  })
  async getCustomerSalesReport(
    @Query() query: CustomerSalesReportQueryDto,
  ): Promise<CustomerSalesReportResponseDto> {
    return this.reportsService.getCustomerSalesReport(query);
  }
}
