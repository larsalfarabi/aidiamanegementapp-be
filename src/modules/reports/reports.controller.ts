import {
  Controller,
  Get,
  Query,
  UseGuards,
  Res,
  StreamableFile,
  Header,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import {
  ProductSalesReportQueryDto,
  ProductSalesReportResponseDto,
} from './dto/product-sales-report.dto';
import {
  CustomerSalesReportQueryDto,
  CustomerSalesReportResponseDto,
} from './dto/customer-sales-report.dto';
import {
  CustomerSalesExportQueryDto,
  ExportResponseDto,
} from './dto/customer-sales-export.dto';
import { ProductSalesExportQueryDto } from './dto/product-sales-export.dto';
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

  @Get('sales/customers/export')
  @ApiOperation({
    summary: 'Export Customer Sales Report to Excel',
    description:
      'Generate and download Excel file for customer sales report. ' +
      'Applies same filters as regular report (date range, customer type, search). ' +
      'Maximum 10,000 records. Includes metadata header, currency formatting, and grand total. ' +
      'File is returned as immediate download.',
  })
  @ApiResponse({
    status: 200,
    description: 'Excel file generated successfully',
    type: ExportResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Data too large (>10,000 records)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  async exportCustomerSalesReport(
    @Query() query: CustomerSalesExportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    // Generate Excel file
    const { buffer, recordCount, fileName } =
      await this.reportsService.generateCustomerSalesExcel(query, {
        userName: query.userName || 'Unknown User',
        exportedAt: new Intl.DateTimeFormat('id-ID', {
          dateStyle: 'full',
          timeStyle: 'short',
          timeZone: 'Asia/Jakarta',
        }).format(new Date()),
      });

    // Set download headers
    res.set({
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': buffer.length,
    });

    return new StreamableFile(buffer);
  }

  @Get('sales/products/export')
  @ApiOperation({
    summary: 'Export Product Sales Report to Excel',
    description:
      'Generate and download Excel file for product sales report with detailed line items. ' +
      'Shows EACH order item as separate row (not aggregated). ' +
      'Applies same filters as regular report (date range, customer type, product category, search, alerts only). ' +
      'Maximum 10,000 records. Includes metadata header, currency formatting, grand total, and anomaly highlighting. ' +
      'File is returned as immediate download.',
  })
  @ApiResponse({
    status: 200,
    description: 'Excel file generated successfully',
    type: ExportResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Data too large (>10,000 records)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  async exportProductSalesReport(
    @Query() query: ProductSalesExportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    // Generate Excel file
    const { buffer, recordCount, fileName } =
      await this.reportsService.generateProductSalesExcel(query, {
        userName: query.userName || 'Unknown User',
        exportedAt: new Intl.DateTimeFormat('id-ID', {
          dateStyle: 'full',
          timeStyle: 'short',
          timeZone: 'Asia/Jakarta',
        }).format(new Date()),
      });

    // Set download headers
    res.set({
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': buffer.length,
    });

    return new StreamableFile(buffer);
  }
}
