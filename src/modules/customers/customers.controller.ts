import {
  Controller,
  Get,
  Post,
  Param,
  Put,
  UseGuards,
  Delete,
  Body,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import {
  CreateCustomerDto,
  CreateCustomerProductCatalogDto,
} from './dto/customers.dto';
import { Pagination } from '../../common/decorator/pagination.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtGuard } from '../auth/guards/auth.guard';
import { InjectCreatedBy } from '../../common/decorator/inject-createdBy.decorator';
import { InjectUpdatedBy } from '../../common/decorator/inject-updatedBy.decorator';
import {
  UpdateCustomerDto,
  DeleteCustomerDto,
  UpdateCustomerProductCatalogDto,
} from './dto/customers.dto';
import { InjectDeletedBy } from '../../common/decorator/inject-deletedBy.decorator';

@UseGuards(JwtGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  async findAll(@Pagination() query: PaginationDto) {
    return this.customersService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.customersService.findOne(+id);
  }

  @Post()
  async create(@InjectCreatedBy() createCustomerDto: CreateCustomerDto) {
    return this.customersService.create(createCustomerDto);
  }

  @Put(':id')
  async update(
    @InjectUpdatedBy() payload: UpdateCustomerDto,
    @Param('id') id: string,
  ) {
    return this.customersService.update(+id, payload);
  }

  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @InjectDeletedBy() payload: DeleteCustomerDto,
  ) {
    return this.customersService.delete(+id, payload);
  }

  @Get(':id/product-catalog')
  async getCustomerProductCatalog(
    @Param('id') id: string,
    @Pagination() query: PaginationDto,
  ) {
    return this.customersService.getCustomerProductCatalog(+id, query);
  }

  @Get(':id/product-catalog-ids')
  async getCustomerProductCatalogIds(@Param('id') id: string) {
    return this.customersService.getCustomerProductCatalogIds(+id);
  }

  @Post('product-catalog')
  async addProdutcToCatalog(
    @InjectCreatedBy() createCatalogDto: CreateCustomerProductCatalogDto,
  ) {
    return this.customersService.addProductToCatalog(createCatalogDto);
  }

  @Put(':id/product-catalog')
  async updateProductInCatalog(
    @Param('id') id: string,
    @InjectUpdatedBy() payload: UpdateCustomerProductCatalogDto,
  ) {
    return this.customersService.updateProductInCatalog(+id, payload);
  }

  @Delete(':id/product-catalog')
  async removeProductFromCatalog(@Param('id') id: string) {
    return this.customersService.removeProductFromCatalog(+id);
  }
}
