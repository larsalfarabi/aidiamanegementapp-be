import BaseResponse from '../../common/response/base.response';
import { Injectable, ConflictException } from '@nestjs/common';
import {
  ResponsePagination,
  ResponseSuccess,
} from '../../common/interface/response.interface';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Customers } from './entity/customers.entity';
import { Repository, IsNull } from 'typeorm';
import { CustomerProductCatalogs } from './entity/customer_product_catalog.entity';
import { NotFoundException } from '@nestjs/common/exceptions';
import {
  UpdateCustomerDto,
  DeleteCustomerDto,
  UpdateCustomerProductCatalogDto,
} from './dto/customers.dto';
import {
  CreateCustomerProductCatalogDto,
  CreateCustomerDto,
} from './dto/customers.dto';

@Injectable()
export class CustomersService extends BaseResponse {
  constructor(
    @InjectRepository(Customers)
    private readonly customersRepo: Repository<Customers>,
    @InjectRepository(CustomerProductCatalogs)
    private readonly customerProductCatalogRepo: Repository<CustomerProductCatalogs>,
  ) {
    super();
  }

  async findAll(query: PaginationDto): Promise<ResponsePagination> {
    const { page, limit, pageSize } = query;

    // Get data dengan raw query
    const result = await this.customersRepo.query(`
    SELECT 
      c.id,
      c.customerCode,
      c.customerName,
      c.address,
      c.contactPerson,
      c.companyName,
      c.phoneNumber,
      c.customerType,
      c.taxType,
      c.isActive,
      c.createdAt,
      c.updatedAt,
      (
        SELECT MAX(o.orderDate) 
        FROM orders o 
        WHERE o.customerId = c.id 
        AND (o.isDeleted IS NULL OR o.isDeleted = false)
      ) as lastOrderDate
    FROM customers c
    WHERE (c.isDeleted = false OR c.isDeleted IS NULL)
    ORDER BY c.createdAt DESC
    LIMIT ${pageSize} OFFSET ${limit}
  `);

    // Get count
    const countResult = await this.customersRepo.query(`
    SELECT COUNT(*) as total
    FROM customers c
    WHERE (c.isDeleted = false OR c.isDeleted IS NULL)
  `);

    const count = parseInt(countResult[0].total);

    return this._pagination(
      'Berhasil mengambil data customer',
      result,
      count,
      page!,
      pageSize!,
    );
  }

  async findOne(id: number): Promise<ResponseSuccess> {
    const result = await this.customersRepo.findOne({
      where: { id },
    });

    if (!result) throw new NotFoundException('Data customer tidak ditemukan');

    return this._success('Berhasil mengambil data customer', result);
  }
  async create(payload: CreateCustomerDto) {
    const customer = this.customersRepo.create({
      ...payload,
      createdBy: payload.createdBy as any,
    });
    const result = await this.customersRepo.save(customer);
    return this._success('Data pelanggan berhasil dibuat', result);
  }

  async update(
    id: number,
    payload: UpdateCustomerDto,
  ): Promise<ResponseSuccess> {
    const result = await this.customersRepo.update(id, payload);

    if (result.affected === 0)
      throw new NotFoundException('Data pelanggan tidak ditemukan');

    // Fetch updated customer data untuk dikembalikan
    const updatedCustomer = await this.customersRepo.findOne({
      where: { id },
    });

    return this._success(
      `Data pelanggan dengan ID ${id} berhasil diupdate`,
      updatedCustomer,
    );
  }

  async getCustomerProductCatalog(
    customerId: number,
    query: PaginationDto,
  ): Promise<ResponsePagination> {
    {
      const { page, pageSize, limit } = query;

      const queryBuilder = this.customerProductCatalogRepo
        .createQueryBuilder('cpc')
        .select([
          'cpc.id',
          'cpc.customerId',
          'cpc.productCodeId',
          'cpc.customerPrice',
          'cpc.discountPercentage',
          'cpc.effectiveDate',
          'cpc.expiryDate',
          'cpc.notes',
          'pc.id',
          'pc.productCode',
          'product.id',
          'product.name',
          'product.productType',
          'category.id',
          'category.name',
          'size.id',
          'size.sizeValue',
        ])
        .leftJoin('cpc.productCode', 'pc')
        .leftJoin('pc.productId', 'product')
        .leftJoin('pc.categoryId', 'category')
        .leftJoin('pc.sizeId', 'size')
        .where('cpc.customerId = :customerId', { customerId })
        .andWhere('cpc.isActive = :isActive', { isActive: true })
        .take(pageSize)
        .skip(limit);

      const [result, count] = await queryBuilder.getManyAndCount();
      return this._pagination(
        'Berhasil mengambil data product catalog customer',
        result,
        count,
        page!,
        pageSize!,
      );
    }
  }

  async getCustomerProductCatalogIds(
    customerId: number,
  ): Promise<ResponseSuccess> {
    const result = await this.customerProductCatalogRepo.find({
      where: {
        customerId,
        isActive: true,
      },
      select: ['productCodeId'],
    });

    const productCodeIds = result.map((item) => item.productCodeId);

    return this._success(
      'Berhasil mengambil daftar product code ID',
      productCodeIds,
    );
  }

  async delete(
    id: number,
    payload: DeleteCustomerDto,
  ): Promise<ResponseSuccess> {
    const result = await this.customersRepo.update(id, {
      isDeleted: true,
      deletedBy: payload.deletedBy as any,
    });

    if (result.affected === 0)
      throw new NotFoundException('Data pelanggan tidak ditemukan');

    return this._success(`Data pelanggan dengan ID ${id} berhasil dihapus`);
  }

  async addProductToCatalog(payload: CreateCustomerProductCatalogDto) {
    const checkProductExist = await this.customerProductCatalogRepo.findOne({
      where: {
        productCodeId: payload.productCodeId,
        customerId: payload.customerId,
        isActive: true,
      },
    });

    if (checkProductExist)
      throw new ConflictException(
        'Produk ini sudah terdaftar dalam katalog pelanggan. Silakan pilih produk yang berbeda.',
      );

    const priceList = this.customerProductCatalogRepo.create({
      ...payload,
      isActive: true,
      createdBy: payload.createdBy as any,
    });
    const result = await this.customerProductCatalogRepo.save(priceList);
    return this._success(
      'Produk berhasil ditambahkan ke catalog customer',
      result,
    );
  }

  async updateProductInCatalog(
    id: number,

    payload: UpdateCustomerProductCatalogDto,
  ): Promise<ResponseSuccess> {
    const result = await this.customerProductCatalogRepo.update(id, payload);

    if (result.affected === 0) {
      throw new NotFoundException('Data produk tidak ditemukan');
    }

    return this._success('Berhasil memperbaharui produk dari catalog customer');
  }

  async removeProductFromCatalog(id: number): Promise<ResponseSuccess> {
    const result = await this.customerProductCatalogRepo.delete(id);

    if (result.affected === 0)
      throw new NotFoundException('Produk tidak ditemukan di catalog customer');

    return this._success('Berhasil menghapus produk dari catalog customer');
  }
}
