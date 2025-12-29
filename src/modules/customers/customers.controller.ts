import {
  Controller,
  Get,
  Post,
  Param,
  Put,
  UseGuards,
  Delete,
  Body,
  UseInterceptors,
  UploadedFile,
  Res,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import {
  CreateCustomerDto,
  CreateCustomerProductCatalogDto,
} from './dto/customers.dto';
import { Pagination } from '../../common/decorator/pagination.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtGuard } from '../auth/guards/auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermissions } from '../../common/decorator/permission.decorator';
import { Resource, Action } from '../../common/enums/resource.enum';
import { InjectCreatedBy } from '../../common/decorator/inject-createdBy.decorator';
import { InjectUpdatedBy } from '../../common/decorator/inject-updatedBy.decorator';
import {
  UpdateCustomerDto,
  DeleteCustomerDto,
  UpdateCustomerProductCatalogDto,
} from './dto/customers.dto';
import { InjectDeletedBy } from '../../common/decorator/inject-deletedBy.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';

@UseGuards(JwtGuard, PermissionGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @RequirePermissions(`${Resource.CUSTOMER}:${Action.VIEW}`)
  async findAll(@Pagination() query: PaginationDto) {
    return this.customersService.findAll(query);
  }

  @Get('codes/all')
  @RequirePermissions(`${Resource.CUSTOMER}:${Action.VIEW}`)
  async findAllCodes() {
    return this.customersService.findAllCodes();
  }

  @Get(':id')
  @RequirePermissions(`${Resource.CUSTOMER}:${Action.VIEW}`)
  async findOne(@Param('id') id: string) {
    return this.customersService.findOne(+id);
  }

  @Post()
  @RequirePermissions(`${Resource.CUSTOMER}:${Action.CREATE}`)
  async create(@InjectCreatedBy() createCustomerDto: CreateCustomerDto) {
    return this.customersService.create(createCustomerDto);
  }

  @Put(':id')
  @RequirePermissions(`${Resource.CUSTOMER}:${Action.UPDATE}`)
  async update(
    @InjectUpdatedBy() payload: UpdateCustomerDto,
    @Param('id') id: string,
  ) {
    return this.customersService.update(+id, payload);
  }

  @Delete(':id')
  @RequirePermissions(`${Resource.CUSTOMER}:${Action.DELETE}`)
  async delete(
    @Param('id') id: string,
    @InjectDeletedBy() payload: DeleteCustomerDto,
  ) {
    return this.customersService.delete(+id, payload);
  }

  @Get(':id/product-catalog')
  @RequirePermissions(`${Resource.CUSTOMER}:${Action.VIEW}`)
  async getCustomerProductCatalog(
    @Param('id') id: string,
    @Pagination() query: PaginationDto,
  ) {
    return this.customersService.getCustomerProductCatalog(+id, query);
  }

  @Get(':id/product-catalog-ids')
  @RequirePermissions(`${Resource.CUSTOMER}:${Action.VIEW}`)
  async getCustomerProductCatalogIds(@Param('id') id: string) {
    return this.customersService.getCustomerProductCatalogIds(+id);
  }

  @Post('product-catalog')
  @RequirePermissions(`${Resource.CUSTOMER}:${Action.UPDATE}`)
  async addProdutcToCatalog(
    @InjectCreatedBy() createCatalogDto: CreateCustomerProductCatalogDto,
  ) {
    return this.customersService.addProductToCatalog(createCatalogDto);
  }

  @Put(':id/product-catalog')
  @RequirePermissions(`${Resource.CUSTOMER}:${Action.UPDATE}`)
  async updateProductInCatalog(
    @Param('id') id: string,
    @InjectUpdatedBy() payload: UpdateCustomerProductCatalogDto,
  ) {
    return this.customersService.updateProductInCatalog(+id, payload);
  }

  @Delete(':id/product-catalog')
  @RequirePermissions(`${Resource.CUSTOMER}:${Action.DELETE}`)
  async removeProductFromCatalog(@Param('id') id: string) {
    return this.customersService.removeProductFromCatalog(+id);
  }

  @Get('excel/template')
  @RequirePermissions(`${Resource.CUSTOMER}:${Action.VIEW}`)
  async downloadTemplate(@Res({ passthrough: false }) res: Response) {
    const buffer = await this.customersService.generateExcelTemplate();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=Template_Upload_Customer.xlsx',
    );

    res.send(buffer);
  }

  @Post('excel/upload')
  @RequirePermissions(`${Resource.CUSTOMER}:${Action.CREATE}`)
  @UseInterceptors(FileInterceptor('file'))
  async uploadExcel(
    @UploadedFile() file: any,
    @InjectCreatedBy() payload: any,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const result = await this.customersService.uploadUnifiedExcelFile(
      file.buffer,
      payload.createdBy,
    );

    return {
      statusCode: HttpStatus.OK,
      message: 'Excel file processed',
      data: result,
    };
  }

  @Get(':id/catalog/excel/template')
  @RequirePermissions(`${Resource.CUSTOMER}:${Action.VIEW}`)
  async downloadCatalogTemplate(
    @Param('id') id: string,
    @Res({ passthrough: false }) res: Response,
  ) {
    const buffer =
      await this.customersService.generateCatalogExcelTemplate(+id);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Template_Upload_Catalog_Customer_${id}.xlsx`,
    );

    res.send(buffer);
  }

  @Post(':id/catalog/excel/upload')
  @RequirePermissions(`${Resource.CUSTOMER}:${Action.UPDATE}`)
  @UseInterceptors(FileInterceptor('file'))
  async uploadCatalogExcel(
    @Param('id') id: string,
    @UploadedFile() file: any,
    @InjectCreatedBy() payload: any,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const result = await this.customersService.uploadCatalogExcelFile(
      +id,
      file.buffer,
      payload.createdBy,
    );

    return {
      statusCode: HttpStatus.OK,
      message: 'Catalog Excel file processed',
      data: result,
    };
  }
}
