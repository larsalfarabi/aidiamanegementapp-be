import BaseResponse from '../../common/response/base.response';
import {
  Injectable,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import {
  ResponsePagination,
  ResponseSuccess,
} from '../../common/interface/response.interface';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Customers } from './entity/customers.entity';
import { Repository, IsNull, DataSource } from 'typeorm';
import { CustomerProductCatalogs } from './entity/customer_product_catalog.entity';
import { NotFoundException } from '@nestjs/common/exceptions';
import {
  UpdateCustomerDto,
  DeleteCustomerDto,
  UpdateCustomerProductCatalogDto,
  ExcelUploadResult,
  ExcelUploadError,
  ExcelUploadSuccess,
  CatalogExcelUploadResult,
  CatalogExcelUploadError,
  CatalogExcelUploadSuccess,
} from './dto/customers.dto';
import {
  CreateCustomerProductCatalogDto,
  CreateCustomerDto,
} from './dto/customers.dto';
import { Orders } from '../orders/entity/orders.entity';
import * as ExcelJS from 'exceljs';
import { Users } from '../users/entities/users.entity';
import { ProductCodes } from '../products/entity/product_codes.entity';

@Injectable()
export class CustomersService extends BaseResponse {
  constructor(
    @InjectRepository(Customers)
    private readonly customersRepo: Repository<Customers>,
    @InjectRepository(CustomerProductCatalogs)
    private readonly customerProductCatalogRepo: Repository<CustomerProductCatalogs>,
    @InjectRepository(Orders)
    private readonly ordersRepo: Repository<Orders>,
    @InjectRepository(ProductCodes)
    private readonly productCodesRepo: Repository<ProductCodes>,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  async findAll(query: PaginationDto): Promise<ResponsePagination> {
    const { page, limit, pageSize, search } = query;

    // Build search condition
    let searchCondition = '';
    const searchParams: string[] = [];
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      searchCondition = `
        AND (
          c.customerName LIKE ? 
          OR c.customerCode LIKE ? 
          OR c.contactPerson LIKE ?
          OR c.customerType LIKE ?
        )
      `;
      searchParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Get data dengan raw query
    const result = await this.customersRepo.query(
      `
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
      ${searchCondition}
      ORDER BY c.createdAt DESC
      LIMIT ? OFFSET ?
    `,
      [...searchParams, pageSize, limit],
    );

    // Get count with same search condition
    const countResult = await this.customersRepo.query(
      `
      SELECT COUNT(*) as total
      FROM customers c
      WHERE (c.isDeleted = false OR c.isDeleted IS NULL)
      ${searchCondition}
    `,
      searchParams,
    );

    const count = parseInt(countResult[0].total);

    return this._pagination(
      'Berhasil mengambil data customer',
      result,
      count,
      page!,
      pageSize!,
    );
  }

  async findAllCodes(): Promise<ResponseSuccess> {
    // Get all customer codes (including soft-deleted) for code generation
    const result = await this.customersRepo.query(`
    SELECT customerCode 
    FROM customers 
    ORDER BY customerCode ASC
  `);

    const customerCodes = result.map(
      (item: { customerCode: string }) => item.customerCode,
    );

    return this._success(
      'Berhasil mengambil semua kode customer',
      customerCodes,
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
    // Check if customer code already exists (only for non-deleted customers)
    const existingCustomer = await this.customersRepo.findOne({
      where: {
        customerCode: payload.customerCode,
        isDeleted: false,
      },
    });

    if (existingCustomer) {
      throw new ConflictException(
        `Kode customer "${payload.customerCode}" sudah digunakan. Silakan refresh halaman untuk mendapatkan kode baru.`,
      );
    }

    const customer = this.customersRepo.create({
      ...payload,
      createdBy: payload.createdBy as any,
    });
    const result = await this.customersRepo.save(customer);

    // [ROLLED BACK] Emit notification disabled

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

    // [ROLLED BACK] Emit notification disabled

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
          'subCategory.id',
          'subCategory.name',
          'category.id',
          'category.name',
          'size.id',
          'size.sizeValue',
        ])
        .leftJoin('cpc.productCode', 'pc')
        .leftJoin('pc.product', 'product')
        .leftJoin('pc.category', 'category') // ✅ SWAPPED: pc.category = Main Category (level 0)
        .leftJoin('product.category', 'subCategory')
        .leftJoin('pc.size', 'size')
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
    // Cek apakah customer memiliki riwayat transaksi invoice
    const invoiceCount = await this.ordersRepo
      .createQueryBuilder('order')
      .where('order.customerId = :customerId', { customerId: id })
      .andWhere('order.invoiceNumber IS NOT NULL')
      .andWhere('(order.isDeleted IS NULL OR order.isDeleted = false)')
      .getCount();

    // Jika ada riwayat invoice, tolak penghapusan
    if (invoiceCount > 0) {
      throw new BadRequestException({
        message: 'Customer tidak dapat dihapus',
        reason: 'CUSTOMER_HAS_INVOICE_HISTORY',
        details: {
          customerId: id,
          invoiceCount,
        },
        suggestion: 'Silakan nonaktifkan customer sebagai gantinya',
      });
    }

    // Fetch customer data before deletion for notification
    const customer = await this.customersRepo.findOne({ where: { id } });
    if (!customer)
      throw new NotFoundException('Data pelanggan tidak ditemukan');

    const result = await this.customersRepo.update(id, {
      isDeleted: true,
      deletedBy: payload.deletedBy as any,
    });

    if (result.affected === 0)
      throw new NotFoundException('Data pelanggan tidak ditemukan');

    // [ROLLED BACK] Emit notification disabled

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

  /**
   * Generate unified Excel template for customer + catalog upload
   * ✅ HUMAN-CENTERED: Single file for customer data AND product catalogs
   * ✅ INTUITIVE: Duplicate customer rows for multiple products
   */
  async generateExcelTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Template Upload Customer');

    // Define unified column headers (Customer + Catalog)
    worksheet.columns = [
      { header: 'Nama Customer', key: 'customerName', width: 35 },
      { header: 'Alamat', key: 'address', width: 45 },
      { header: 'Contact Person', key: 'contactPerson', width: 25 },
      { header: 'Nama Perusahaan', key: 'companyName', width: 30 },
      { header: 'Nomor Telepon', key: 'phoneNumber', width: 18 },
      { header: 'Tipe Customer', key: 'customerType', width: 15 },
      { header: 'Tipe Pajak', key: 'taxType', width: 12 },
      { header: 'Kode Produk', key: 'productCode', width: 18 },
      { header: 'Harga Produk', key: 'customerPrice', width: 15 },
    ];

    // Style header row (9 columns: A-I)
    const headerRow = worksheet.getRow(1);
    headerRow.height = 25;
    ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1', 'I1'].forEach(
      (cellAddress) => {
        const cell = worksheet.getCell(cellAddress);
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4472C4' },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      },
    );

    // Add example data with multiple products per customer
    worksheet.addRow({
      customerName: 'Hotel Grand Surya',
      address: 'Jl. Raya Kuta No. 45, Badung, Bali',
      contactPerson: 'Budi Santoso',
      companyName: 'PT Grand Surya Hospitality',
      phoneNumber: '0361-123456',
      customerType: 'Hotel',
      taxType: 'PPN',
      productCode: 'BJ3PG4R',
      customerPrice: 45000,
    });

    worksheet.addRow({
      customerName: 'Hotel Grand Surya',
      address: 'Jl. Raya Kuta No. 45, Badung, Bali',
      contactPerson: 'Budi Santoso',
      companyName: 'PT Grand Surya Hospitality',
      phoneNumber: '0361-123456',
      customerType: 'Hotel',
      taxType: 'PPN',
      productCode: 'BJ3OR4R',
      customerPrice: 45000,
    });

    worksheet.addRow({
      customerName: 'Cafe Aroma',
      address: 'Jl. Sunset Road No. 88, Kuta, Bali',
      contactPerson: 'Siti Rahmawati',
      companyName: '',
      phoneNumber: '0812-3456-7890',
      customerType: 'Cafe & Resto',
      taxType: 'Non PPN',
      productCode: 'BJ3MG4R',
      customerPrice: 50000,
    });

    // Add instructions in a separate sheet
    const instructionSheet = workbook.addWorksheet('Petunjuk Pengisian');
    instructionSheet.columns = [
      { header: 'Kolom', key: 'column', width: 20 },
      { header: 'Keterangan', key: 'description', width: 65 },
      { header: 'Wajib Diisi', key: 'required', width: 15 },
    ];

    // Style instruction header (Cell-based)
    const headerCells = ['A1', 'B1', 'C1'];
    headerCells.forEach((cellAddress) => {
      const cell = instructionSheet.getCell(cellAddress);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF70AD47' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
    instructionSheet.getRow(1).height = 25;

    // Add instruction data
    const instructions = [
      {
        column: 'Nama Customer',
        description:
          'Nama lengkap customer. Kode akan otomatis dibuat (contoh: "Hotel Surya" → H-001)',
        required: 'Ya',
      },
      {
        column: 'Alamat',
        description: 'Alamat lengkap customer',
        required: 'Ya',
      },
      {
        column: 'Contact Person',
        description: 'Nama orang yang dapat dihubungi',
        required: 'Ya',
      },
      {
        column: 'Nama Perusahaan',
        description: 'Nama perusahaan (opsional, bisa dikosongkan)',
        required: 'Tidak',
      },
      {
        column: 'Nomor Telepon',
        description: 'Nomor telepon customer yang dapat dihubungi',
        required: 'Ya',
      },
      {
        column: 'Tipe Customer',
        description: 'Pilihan: Hotel, Cafe & Resto, Catering, atau Reseller',
        required: 'Ya',
      },
      {
        column: 'Tipe Pajak',
        description: 'Pilihan: PPN atau Non PPN',
        required: 'Ya',
      },
      {
        column: 'Kode Produk',
        description:
          'Kode produk yang akan ditambahkan ke catalog customer (harus sesuai master data)',
        required: 'Ya',
      },
      {
        column: 'Harga Produk',
        description:
          'Harga khusus untuk customer ini dalam Rupiah (contoh: 45000)',
        required: 'Ya',
      },
    ];

    instructions.forEach((instruction) => {
      const row = instructionSheet.addRow(instruction);
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
    });

    // Add general notes
    instructionSheet.addRow([]);
    instructionSheet.addRow(['CATATAN PENTING:']).font = {
      bold: true,
      size: 12,
    };
    instructionSheet.addRow([
      '1. Jika customer memiliki banyak produk, DUPLIKASI baris data customer dengan produk berbeda',
    ]);
    instructionSheet.addRow([
      '2. Sistem akan otomatis mengelompokkan produk per customer berdasarkan nama',
    ]);
    instructionSheet.addRow([
      '3. Kode Customer akan dibuat OTOMATIS oleh sistem berdasarkan huruf pertama nama',
    ]);
    instructionSheet.addRow([
      '4. Format kode: [Huruf Pertama]-[Nomor] (contoh: H-001, C-001)',
    ]);
    instructionSheet.addRow([
      '5. Kode Produk harus sesuai dengan data master produk di sistem',
    ]);
    instructionSheet.addRow([
      '6. Hapus baris contoh sebelum mengisi data Anda',
    ]);
    instructionSheet.addRow([
      '7. Maksimal 1000 baris data dalam satu file upload',
    ]);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Generate unique customer code based on customer name
   * Format: [FirstLetter]-[XXX] (e.g., H-001, C-002)
   *
   * ✅ SAFETY: Checks database for existing codes to prevent duplicates
   * ✅ UNIQUE CONSTRAINT: Ensures generated code doesn't violate unique constraint
   */
  private async generateCustomerCode(
    customerName: string,
    existingCodesSet: Set<string>,
  ): Promise<string> {
    // Get first letter of customer name
    const firstLetter = customerName.charAt(0).toUpperCase();

    // Validate first letter is alphabet
    if (!/^[A-Z]$/.test(firstLetter)) {
      throw new BadRequestException(
        `Nama customer "${customerName}" harus dimulai dengan huruf alphabet`,
      );
    }

    // ✅ CRITICAL: Get ALL codes from database (including soft-deleted)
    // This prevents duplicate codes even after soft-delete
    const allCodesResponse = await this.findAllCodes();
    const allCodesFromDb = allCodesResponse.data as string[];

    // Filter codes with same prefix from database
    const codesWithPrefix = allCodesFromDb.filter((code) =>
      code.toUpperCase().startsWith(firstLetter + '-'),
    );

    // Find highest number with this prefix from database
    let maxNumber = 0;
    for (const code of codesWithPrefix) {
      const parts = code.split('-');
      if (parts.length === 2) {
        const num = parseInt(parts[1], 10);
        if (!isNaN(num) && num > maxNumber) {
          maxNumber = num;
        }
      }
    }

    // ✅ BATCH SAFETY: Also check in existingCodesSet (codes being uploaded in current batch)
    for (const code of Array.from(existingCodesSet)) {
      if (code.toUpperCase().startsWith(firstLetter + '-')) {
        const parts = code.split('-');
        if (parts.length === 2) {
          const num = parseInt(parts[1], 10);
          if (!isNaN(num) && num > maxNumber) {
            maxNumber = num;
          }
        }
      }
    }

    // Generate new code with incremented number
    const newNumber = maxNumber + 1;
    const newCode = `${firstLetter}-${newNumber.toString().padStart(3, '0')}`;

    // ✅ FINAL VERIFICATION: Double-check code doesn't exist in database
    // This prevents race conditions from simultaneous uploads
    const finalCheck = await this.customersRepo.findOne({
      where: { customerCode: newCode },
      withDeleted: true, // Check including soft-deleted records
    });

    if (finalCheck) {
      // If collision detected, retry with next number
      // This handles edge cases and race conditions
      const retryNumber = maxNumber + 2;
      const retryCode = `${firstLetter}-${retryNumber.toString().padStart(3, '0')}`;

      // Verify retry code
      const retryCheck = await this.customersRepo.findOne({
        where: { customerCode: retryCode },
        withDeleted: true,
      });

      if (retryCheck) {
        throw new BadRequestException(
          `Gagal generate kode customer untuk "${customerName}". Terjadi konflik kode. Silakan coba lagi.`,
        );
      }

      return retryCode;
    }

    return newCode;
  }

  /**
   * Upload and process Excel file for customer data
   */
  async uploadExcelFile(
    fileBuffer: Buffer,
    createdBy: { id: number },
  ): Promise<ExcelUploadResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as any);

    const worksheet = workbook.getWorksheet('Template Upload Customer');
    if (!worksheet) {
      throw new BadRequestException(
        'Sheet "Template Upload Customer" tidak ditemukan dalam file Excel',
      );
    }

    const errors: ExcelUploadError[] = [];
    const successDetails: ExcelUploadSuccess[] = [];
    const customersToCreate: CreateCustomerDto[] = [];

    // Get existing customer codes for validation
    const existingCodes = await this.customersRepo.find({
      where: { isDeleted: false },
      select: ['customerCode'],
    });
    const existingCodesSet = new Set(
      existingCodes.map((c) => c.customerCode.toUpperCase()),
    );

    // Track codes in current upload to detect duplicates within the file
    const uploadedCodesSet = new Set<string>();

    // Process rows (skip header row)
    let totalRows = 0;
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header

      // Check if row is empty
      const rowValues = row.values as any[];
      const isEmptyRow =
        rowValues &&
        Array.isArray(rowValues) &&
        rowValues.every(
          (cell: any) => cell === null || cell === undefined || cell === '',
        );
      if (isEmptyRow) return;

      totalRows++;

      const rowErrors: string[] = [];
      // Column indices shifted left after removing customerCode column (auto-generated)
      const customerName = row.getCell(1).value?.toString().trim() || '';
      const address = row.getCell(2).value?.toString().trim() || '';
      const contactPerson = row.getCell(3).value?.toString().trim() || '';
      const companyName = row.getCell(4).value?.toString().trim() || '';
      const phoneNumber = row.getCell(5).value?.toString().trim() || '';
      const customerType = row.getCell(6).value?.toString().trim() || '';
      const taxType = row.getCell(7).value?.toString().trim() || '';

      // Validate required fields (customerCode will be auto-generated)
      if (!customerName) rowErrors.push('Nama Customer wajib diisi');
      if (!address) rowErrors.push('Alamat wajib diisi');
      if (!contactPerson) rowErrors.push('Contact Person wajib diisi');
      if (!phoneNumber) rowErrors.push('Nomor Telepon wajib diisi');
      if (!customerType) rowErrors.push('Tipe Customer wajib diisi');
      if (!taxType) rowErrors.push('Tipe Pajak wajib diisi');

      // Validate customer type
      const validCustomerTypes = [
        'Hotel',
        'Cafe & Resto',
        'Catering',
        'Reseller',
      ];
      if (customerType && !validCustomerTypes.includes(customerType)) {
        rowErrors.push(
          `Tipe Customer tidak valid. Pilihan: ${validCustomerTypes.join(', ')}`,
        );
      }

      // Validate tax type
      const validTaxTypes = ['PPN', 'Non PPN'];
      if (taxType && !validTaxTypes.includes(taxType)) {
        rowErrors.push(
          `Tipe Pajak tidak valid. Pilihan: ${validTaxTypes.join(', ')}`,
        );
      }

      // Validate customer name starts with alphabet (required for code generation)
      if (customerName && !/^[A-Z]/i.test(customerName)) {
        rowErrors.push('Nama Customer harus dimulai dengan huruf alphabet');
      }

      if (rowErrors.length > 0) {
        errors.push({
          row: rowNumber,
          customerCode: '', // Will be generated later
          customerName,
          errors: rowErrors,
        });
      } else {
        // Store validated data (customerCode will be generated in second pass)
        customersToCreate.push({
          customerCode: '', // Placeholder, will be generated
          customerName,
          address,
          contactPerson,
          companyName: companyName || undefined,
          phoneNumber,
          customerType: customerType as any,
          taxType: taxType as any,
          isActive: true,
          createdBy,
        });
        successDetails.push({
          row: rowNumber,
          customerCode: '', // Placeholder, will be generated
          customerName,
        });
      }
    });

    // Check row limit
    if (totalRows > 1000) {
      throw new BadRequestException(
        'File Excel melebihi batas maksimum 1000 baris data',
      );
    }

    if (totalRows === 0) {
      throw new BadRequestException('File Excel tidak memiliki data customer');
    }

    // Second pass: Generate customer codes for valid entries
    for (let i = 0; i < customersToCreate.length; i++) {
      try {
        const customerCode = await this.generateCustomerCode(
          customersToCreate[i].customerName,
          uploadedCodesSet,
        );
        customersToCreate[i].customerCode = customerCode;
        successDetails[i].customerCode = customerCode;
        uploadedCodesSet.add(customerCode.toUpperCase());
      } catch (error) {
        // If code generation fails, move to errors
        const rowNum = successDetails[i].row;
        errors.push({
          row: rowNum,
          customerCode: '',
          customerName: customersToCreate[i].customerName,
          errors: [error.message || 'Gagal generate kode customer'],
        });
        // Mark for removal
        customersToCreate[i].customerCode = null as any;
      }
    }

    // Remove failed entries (where customerCode is null)
    const validCustomers = customersToCreate.filter((c) => c.customerCode);
    const validSuccessDetails = successDetails.filter((s) => s.customerCode);

    // Save valid customers to database using transaction
    // ✅ TRANSACTION: Ensures atomicity - all or nothing
    // ✅ ERROR HANDLING: Catches unique constraint violations from race conditions
    let successCount = 0;
    if (validCustomers.length > 0) {
      await this.dataSource.transaction(async (manager) => {
        for (const customerData of validCustomers) {
          try {
            const customer = manager.create(Customers, customerData);
            await manager.save(customer);
            successCount++;
          } catch (error) {
            // Handle unexpected errors during save
            // ✅ UNIQUE CONSTRAINT: Detects duplicate customerCode violations
            const isDuplicateError =
              error.code === 'ER_DUP_ENTRY' ||
              error.message?.includes('Duplicate entry') ||
              error.message?.includes('unique constraint');

            const failedCustomer = validSuccessDetails.find(
              (s) => s.customerCode === customerData.customerCode,
            );

            if (failedCustomer) {
              const errorMessage = isDuplicateError
                ? `Kode Customer "${customerData.customerCode}" sudah ada di database (duplikasi terdeteksi)`
                : `Gagal menyimpan: ${error.message}`;

              errors.push({
                row: failedCustomer.row,
                customerCode: customerData.customerCode,
                customerName: customerData.customerName,
                errors: [errorMessage],
              });

              // Remove from success list
              const index = validSuccessDetails.findIndex(
                (s) => s.customerCode === customerData.customerCode,
              );
              if (index > -1) {
                validSuccessDetails.splice(index, 1);
              }
            }
          }
        }
      });
    }

    return {
      totalRows,
      successCount: validSuccessDetails.length,
      failureCount: errors.length,
      errors,
      successDetails: validSuccessDetails,
    };
  }

  /**
   * Upload and process unified Excel file for customer + catalog data
   * ✅ HUMAN-CENTERED: Single file for customer data AND product catalogs
   * ✅ EFFICIENT: Groups rows by customer, creates once, then adds catalogs
   * ✅ INTUITIVE: Supports duplicate customer rows for multiple products
   */
  async uploadUnifiedExcelFile(
    fileBuffer: Buffer,
    createdBy: { id: number },
  ): Promise<ExcelUploadResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as any);

    const worksheet = workbook.getWorksheet('Template Upload Customer');
    if (!worksheet) {
      throw new BadRequestException(
        'Sheet "Template Upload Customer" tidak ditemukan dalam file Excel',
      );
    }

    const errors: ExcelUploadError[] = [];
    const successDetails: ExcelUploadSuccess[] = [];

    // Track uploaded customer codes to avoid duplicates
    const uploadedCodesSet = new Set<string>();

    // Group rows by customer name (key = customerName.toUpperCase())
    interface CustomerRowData {
      row: number;
      customerName: string;
      address: string;
      contactPerson: string;
      companyName: string;
      phoneNumber: string;
      customerType: string;
      taxType: string;
      productCode: string;
      customerPrice: number;
    }

    const customerGroups = new Map<string, CustomerRowData[]>();

    // First pass: Read all rows and group by customer
    let totalRows = 0;
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header

      const rowValues = row.values as any[];
      const isEmptyRow =
        rowValues &&
        Array.isArray(rowValues) &&
        rowValues.every(
          (cell: any) => cell === null || cell === undefined || cell === '',
        );
      if (isEmptyRow) return;

      totalRows++;

      // Read unified columns (9 columns)
      const customerName = row.getCell(1).value?.toString().trim() || '';
      const address = row.getCell(2).value?.toString().trim() || '';
      const contactPerson = row.getCell(3).value?.toString().trim() || '';
      const companyName = row.getCell(4).value?.toString().trim() || '';
      const phoneNumber = row.getCell(5).value?.toString().trim() || '';
      const customerType = row.getCell(6).value?.toString().trim() || '';
      const taxType = row.getCell(7).value?.toString().trim() || '';
      const productCode =
        row.getCell(8).value?.toString().trim().toUpperCase() || '';
      const customerPrice = parseFloat(row.getCell(9).value?.toString() || '0');

      const rowData: CustomerRowData = {
        row: rowNumber,
        customerName,
        address,
        contactPerson,
        companyName,
        phoneNumber,
        customerType,
        taxType,
        productCode,
        customerPrice,
      };

      // Validate required customer fields
      const rowErrors: string[] = [];
      if (!customerName) rowErrors.push('Nama Customer wajib diisi');
      if (!address) rowErrors.push('Alamat wajib diisi');
      if (!contactPerson) rowErrors.push('Contact Person wajib diisi');
      if (!phoneNumber) rowErrors.push('Nomor Telepon wajib diisi');
      if (!customerType) rowErrors.push('Tipe Customer wajib diisi');
      if (!taxType) rowErrors.push('Tipe Pajak wajib diisi');
      if (!productCode) rowErrors.push('Kode Produk wajib diisi');
      if (customerPrice <= 0) rowErrors.push('Harga Produk harus lebih dari 0');

      // Validate customer type
      const validCustomerTypes = [
        'Hotel',
        'Cafe & Resto',
        'Catering',
        'Reseller',
      ];
      if (customerType && !validCustomerTypes.includes(customerType)) {
        rowErrors.push(
          `Tipe Customer tidak valid. Pilihan: ${validCustomerTypes.join(', ')}`,
        );
      }

      // Validate tax type
      const validTaxTypes = ['PPN', 'Non PPN'];
      if (taxType && !validTaxTypes.includes(taxType)) {
        rowErrors.push(
          `Tipe Pajak tidak valid. Pilihan: ${validTaxTypes.join(', ')}`,
        );
      }

      // Validate customer name starts with alphabet
      if (customerName && !/^[A-Z]/i.test(customerName)) {
        rowErrors.push('Nama Customer harus dimulai dengan huruf alphabet');
      }

      if (rowErrors.length > 0) {
        errors.push({
          row: rowNumber,
          customerCode: '',
          customerName,
          errors: rowErrors,
        });
      } else {
        // Group by customer name (case insensitive)
        const key = customerName.toUpperCase();
        if (!customerGroups.has(key)) {
          customerGroups.set(key, []);
        }
        customerGroups.get(key)!.push(rowData);
      }
    });

    // Check row limit
    if (totalRows > 1000) {
      throw new BadRequestException(
        'File Excel melebihi batas maksimum 1000 baris data',
      );
    }

    if (totalRows === 0) {
      throw new BadRequestException('File Excel tidak memiliki data');
    }

    // Second pass: Process each customer group
    await this.dataSource.transaction(async (manager) => {
      for (const [customerKey, rows] of customerGroups) {
        const firstRow = rows[0];

        try {
          // 1. Check if customer already exists (by name match)
          let customer = await manager.findOne(Customers, {
            where: { customerName: firstRow.customerName, isDeleted: false },
          });

          let customerCode = customer?.customerCode || '';
          let isNewCustomer = false;

          if (!customer) {
            // Generate customer code
            customerCode = await this.generateCustomerCode(
              firstRow.customerName,
              uploadedCodesSet,
            );
            uploadedCodesSet.add(customerCode.toUpperCase());

            // Create new customer
            customer = manager.create(Customers, {
              customerCode,
              customerName: firstRow.customerName,
              address: firstRow.address,
              contactPerson: firstRow.contactPerson,
              companyName: firstRow.companyName || undefined,
              phoneNumber: firstRow.phoneNumber,
              customerType: firstRow.customerType as any,
              taxType: firstRow.taxType as any,
              isActive: true,
              createdBy,
            });
            await manager.save(customer);
            isNewCustomer = true;
          }

          // 2. Get existing catalog items for this customer
          const existingCatalog = await manager.find(CustomerProductCatalogs, {
            where: { customerId: customer.id, isActive: true },
            select: ['productCodeId'],
          });
          const existingProductIds = new Set(
            existingCatalog.map((c) => c.productCodeId),
          );

          // 3. Process each product for this customer
          let catalogAddedCount = 0;
          for (const rowData of rows) {
            // Find product code in database
            const productCodeEntity = await this.productCodesRepo.findOne({
              where: { productCode: rowData.productCode, isDeleted: false },
            });

            if (!productCodeEntity) {
              errors.push({
                row: rowData.row,
                customerCode,
                customerName: rowData.customerName,
                errors: [
                  `Kode Produk "${rowData.productCode}" tidak ditemukan di master data`,
                ],
              });
              continue;
            }

            // Check if already in catalog
            if (existingProductIds.has(productCodeEntity.id)) {
              errors.push({
                row: rowData.row,
                customerCode,
                customerName: rowData.customerName,
                errors: [
                  `Produk "${rowData.productCode}" sudah ada di catalog customer ini`,
                ],
              });
              continue;
            }

            // Add to catalog
            const catalogItem = manager.create(CustomerProductCatalogs, {
              customerId: customer.id,
              productCodeId: productCodeEntity.id,
              customerPrice: rowData.customerPrice,
              discountPercentage: 0,
              effectiveDate: new Date(),
              isActive: true,
              createdBy,
            });
            await manager.save(catalogItem);
            existingProductIds.add(productCodeEntity.id); // Track to avoid duplicates within file
            catalogAddedCount++;
          }

          // Add to success details
          successDetails.push({
            row: firstRow.row,
            customerCode,
            customerName: firstRow.customerName,
          });
        } catch (error) {
          // Handle errors for this customer group
          errors.push({
            row: firstRow.row,
            customerCode: '',
            customerName: firstRow.customerName,
            errors: [error.message || 'Gagal memproses data customer'],
          });
        }
      }
    });

    return {
      totalRows,
      successCount: successDetails.length,
      failureCount: errors.length,
      errors,
      successDetails,
    };
  }

  /**
   * Generate Excel template for customer product catalog upload
   * ✅ USER-FRIENDLY: Template khusus per customer dengan instruksi lengkap
   */
  async generateCatalogExcelTemplate(customerId: number): Promise<Buffer> {
    // Verify customer exists
    const customer = await this.customersRepo.findOne({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException('Customer tidak ditemukan');
    }

    const workbook = new ExcelJS.Workbook();

    // Sheet 1: Template Upload
    const worksheet = workbook.addWorksheet('Template Upload Catalog');

    // Set column headers (removed Nama Produk - sudah terwakili dengan Kode Produk)
    worksheet.columns = [
      { header: 'Kode Produk', key: 'productCode', width: 20 },
      { header: 'Harga Customer', key: 'customerPrice', width: 20 },
      { header: 'Diskon (%)', key: 'discountPercentage', width: 15 },
      { header: 'Tanggal Efektif', key: 'effectiveDate', width: 18 },
      { header: 'Tanggal Kadaluarsa', key: 'expiryDate', width: 18 },
      { header: 'Catatan', key: 'notes', width: 30 },
    ];

    // Style header row (hanya sampai kolom terakhir yang digunakan: F)
    const headerRow = worksheet.getRow(1);
    headerRow.height = 25;
    ['A1', 'B1', 'C1', 'D1', 'E1', 'F1'].forEach((cellAddress) => {
      const cell = worksheet.getCell(cellAddress);
      cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2563EB' }, // Blue
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });

    // Add example data
    worksheet.addRow({
      productCode: 'BJ-001',
      customerPrice: 85000,
      discountPercentage: 5,
      effectiveDate: new Date(),
      expiryDate: null,
      notes: 'Harga khusus untuk pembelian reguler',
    });

    worksheet.addRow({
      productCode: 'BJ-002',
      customerPrice: 90000,
      discountPercentage: 0,
      effectiveDate: new Date(),
      expiryDate: null,
      notes: '',
    });

    // Style example rows
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          };
        });
      }
    });

    // Sheet 2: Instructions
    const instructionSheet = workbook.addWorksheet('Petunjuk Pengisian');

    // Title
    instructionSheet.mergeCells('A1:C1');
    const titleCell = instructionSheet.getCell('A1');
    titleCell.value = `PETUNJUK UPLOAD CATALOG - ${customer.customerName}`;
    titleCell.font = { bold: true, size: 14, color: { argb: 'FF1F2937' } };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF3F4F6' },
    };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    instructionSheet.getRow(1).height = 30;

    instructionSheet.addRow([]);
    instructionSheet.addRow([]);

    // Column descriptions
    instructionSheet.getColumn(1).width = 25;
    instructionSheet.getColumn(2).width = 60;
    instructionSheet.getColumn(3).width = 12;

    const headerRow2 = instructionSheet.addRow([
      'Kolom',
      'Keterangan',
      'Wajib?',
    ]);
    headerRow2.font = { bold: true, size: 11 };
    headerRow2.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFDBEAFE' },
    };

    const instructions = [
      {
        column: 'Kode Produk',
        description:
          'Kode produk yang akan ditambahkan ke catalog (contoh: BJ-001). Sistem akan memvalidasi apakah produk tersedia.',
        required: 'Ya',
      },
      {
        column: 'Harga Customer',
        description:
          'Harga khusus untuk customer ini dalam Rupiah (contoh: 85000)',
        required: 'Ya',
      },
      {
        column: 'Diskon (%)',
        description:
          'Persentase diskon 0-100 (contoh: 5 untuk 5%). Kosongkan jika tidak ada diskon',
        required: 'Tidak',
      },
      {
        column: 'Tanggal Efektif',
        description:
          'Tanggal mulai berlaku harga ini (format: YYYY-MM-DD atau kosongkan untuk hari ini)',
        required: 'Tidak',
      },
      {
        column: 'Tanggal Kadaluarsa',
        description:
          'Tanggal berakhir harga ini (format: YYYY-MM-DD atau kosongkan jika tidak ada)',
        required: 'Tidak',
      },
      {
        column: 'Catatan',
        description: 'Catatan tambahan untuk harga produk ini',
        required: 'Tidak',
      },
    ];

    instructions.forEach((instruction) => {
      const row = instructionSheet.addRow([
        instruction.column,
        instruction.description,
        instruction.required,
      ]);
      row.getCell(3).font = {
        bold: instruction.required === 'Ya',
        color: {
          argb: instruction.required === 'Ya' ? 'FFDC2626' : 'FF6B7280',
        },
      };
    });

    // Important notes
    instructionSheet.addRow([]);
    instructionSheet.addRow(['CATATAN PENTING:']).font = {
      bold: true,
      size: 12,
    };
    instructionSheet.addRow([
      '1. Pastikan Kode Produk sesuai dengan data master produk di sistem',
    ]);
    instructionSheet.addRow([
      '2. Produk yang sudah ada di catalog customer ini TIDAK AKAN ditambahkan lagi (duplikat akan diabaikan)',
    ]);
    instructionSheet.addRow([
      '3. Harga Customer harus berupa angka tanpa tanda titik atau koma',
    ]);
    instructionSheet.addRow([
      '4. Diskon harus berupa angka 0-100 (persentase)',
    ]);
    instructionSheet.addRow([
      '5. Format tanggal: YYYY-MM-DD (contoh: 2024-12-18)',
    ]);
    instructionSheet.addRow([
      '6. Hapus baris contoh sebelum mengisi data produk Anda',
    ]);
    instructionSheet.addRow([
      '7. Maksimal 500 baris data dalam satu file upload',
    ]);
    instructionSheet.addRow([
      '8. Produk yang sama tidak boleh muncul lebih dari 1 kali dalam file',
    ]);

    // Convert to buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Upload and process customer catalog Excel file
   * ✅ VALIDATION: Comprehensive validation untuk data integrity
   * ✅ USER FEEDBACK: Detailed error reporting per row
   */
  async uploadCatalogExcelFile(
    customerId: number,
    fileBuffer: Buffer,
    createdBy: { id: number },
  ): Promise<CatalogExcelUploadResult> {
    // Verify customer exists
    const customer = await this.customersRepo.findOne({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException('Customer tidak ditemukan');
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as any);

    const worksheet = workbook.getWorksheet('Template Upload Catalog');
    if (!worksheet) {
      throw new BadRequestException(
        'Sheet "Template Upload Catalog" tidak ditemukan dalam file Excel',
      );
    }

    const errors: CatalogExcelUploadError[] = [];
    const successDetails: CatalogExcelUploadSuccess[] = [];
    const catalogsToCreate: CreateCustomerProductCatalogDto[] = [];

    // Get existing catalog items for this customer
    const existingCatalog = await this.customerProductCatalogRepo.find({
      where: { customerId, isActive: true },
      select: ['productCodeId'],
    });
    const existingProductIdsSet = new Set(
      existingCatalog.map((c) => c.productCodeId),
    );

    // Track product codes in current upload to detect duplicates
    const uploadedProductCodesSet = new Set<string>();

    // Collect all rows data first (eachRow is synchronous)
    const rowsData: any[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header

      // Check if row is empty
      const rowValues = row.values as any[];
      const isEmptyRow =
        rowValues &&
        Array.isArray(rowValues) &&
        rowValues.every(
          (cell: any) => cell === null || cell === undefined || cell === '',
        );
      if (isEmptyRow) return;

      rowsData.push({
        rowNumber,
        productCode: row.getCell(1).value?.toString().trim() || '',
        customerPrice: parseFloat(row.getCell(2).value?.toString() || '0'),
        discountPercentage: parseFloat(row.getCell(3).value?.toString() || '0'),
        effectiveDateStr: row.getCell(4).value?.toString().trim() || '',
        expiryDateStr: row.getCell(5).value?.toString().trim() || '',
        notes: row.getCell(6).value?.toString().trim() || '',
      });
    });

    const totalRows = rowsData.length;

    // Process rows asynchronously
    for (const rowData of rowsData) {
      const rowErrors: string[] = [];
      const {
        rowNumber,
        productCode,
        customerPrice,
        discountPercentage,
        effectiveDateStr,
        expiryDateStr,
        notes,
      } = rowData;

      // Validate required fields
      if (!productCode) rowErrors.push('Kode Produk wajib diisi');
      if (!customerPrice || isNaN(customerPrice) || customerPrice <= 0) {
        rowErrors.push(
          'Harga Customer wajib diisi dan harus berupa angka positif',
        );
      }

      // Validate discount
      if (
        discountPercentage &&
        (isNaN(discountPercentage) ||
          discountPercentage < 0 ||
          discountPercentage > 100)
      ) {
        rowErrors.push('Diskon harus berupa angka antara 0-100');
      }

      // Validate dates
      let effectiveDate: Date | undefined;
      let expiryDate: Date | undefined;

      if (effectiveDateStr) {
        effectiveDate = new Date(effectiveDateStr);
        if (isNaN(effectiveDate.getTime())) {
          rowErrors.push(
            'Format Tanggal Efektif tidak valid (gunakan YYYY-MM-DD)',
          );
        }
      }

      if (expiryDateStr) {
        expiryDate = new Date(expiryDateStr);
        if (isNaN(expiryDate.getTime())) {
          rowErrors.push(
            'Format Tanggal Kadaluarsa tidak valid (gunakan YYYY-MM-DD)',
          );
        }
      }

      // Check if product exists in database
      let productCodeId: number | null = null;
      if (productCode) {
        const product = await this.productCodesRepo.findOne({
          where: { productCode },
        });

        if (!product) {
          rowErrors.push(
            `Produk dengan kode "${productCode}" tidak ditemukan di sistem`,
          );
        } else {
          productCodeId = product.id;

          // Check if product already in catalog
          if (existingProductIdsSet.has(productCodeId)) {
            rowErrors.push(
              `Produk "${productCode}" sudah ada di catalog customer ini`,
            );
          }

          // Check for duplicates within upload file
          if (uploadedProductCodesSet.has(productCode.toUpperCase())) {
            rowErrors.push(
              `Produk "${productCode}" duplikat dalam file yang diupload`,
            );
          }
        }
      }

      if (rowErrors.length > 0) {
        errors.push({
          row: rowNumber,
          productCode,
          errors: rowErrors,
        });
      } else if (productCodeId) {
        uploadedProductCodesSet.add(productCode.toUpperCase());
        catalogsToCreate.push({
          customerId,
          productCodeId,
          customerPrice,
          discountPercentage: discountPercentage || 0,
          effectiveDate,
          expiryDate,
          notes: notes || undefined,
          createdBy,
        });
        successDetails.push({
          row: rowNumber,
          productCode,
          customerPrice,
          discountPercentage: discountPercentage || 0,
        });
      }
    }

    // Check row limit
    if (totalRows > 500) {
      throw new BadRequestException(
        'File Excel melebihi batas maksimum 500 baris data',
      );
    }

    if (totalRows === 0) {
      throw new BadRequestException('File Excel tidak memiliki data produk');
    }

    // Save valid catalog items to database using transaction
    let successCount = 0;
    if (catalogsToCreate.length > 0) {
      await this.dataSource.transaction(async (manager) => {
        for (const catalogData of catalogsToCreate) {
          try {
            const catalog = manager.create(CustomerProductCatalogs, {
              ...catalogData,
              isActive: true,
              createdBy: catalogData.createdBy as any,
            });
            await manager.save(catalog);
            successCount++;
          } catch (error) {
            // Handle unexpected errors during save
            const isDuplicateError =
              error.code === 'ER_DUP_ENTRY' ||
              error.message?.includes('Duplicate entry') ||
              error.message?.includes('unique constraint');

            const failedCatalog = successDetails.find(
              (s) => s.productCode === catalogData.productCodeId.toString(),
            );

            if (failedCatalog) {
              const errorMessage = isDuplicateError
                ? `Produk sudah ada di catalog (duplikasi terdeteksi)`
                : `Gagal menyimpan: ${error.message}`;

              errors.push({
                row: failedCatalog.row,
                productCode: failedCatalog.productCode,
                errors: [errorMessage],
              });

              // Remove from success list
              const index = successDetails.findIndex(
                (s) => s.productCode === failedCatalog.productCode,
              );
              if (index > -1) {
                successDetails.splice(index, 1);
              }
            }
          }
        }
      });
    }

    return {
      totalRows,
      successCount: successDetails.length,
      failureCount: errors.length,
      errors,
      successDetails,
    };
  }
}
