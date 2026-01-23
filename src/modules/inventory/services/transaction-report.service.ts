import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import BaseResponse from 'src/common/response/base.response';
import {
  ResponseSuccess,
  ResponsePagination,
} from 'src/common/interface/response.interface';
import { DailyInventory } from '../entity/daily-inventory.entity';
import { DailyInventorySnapshots } from '../entity/daily-inventory-snapshots.entity';
import {
  InventoryTransactions,
  TransactionType,
} from '../entity/inventory-transactions.entity';
import { ProductCodes } from 'src/modules/products/entity/product_codes.entity';
import {
  TransactionReportFiltersDto,
  TransactionReportRow,
} from '../dto/transaction-report.dto';

/**
 * TransactionReportService
 *
 * Service for generating Transaction Reports (Laporan Transaksi Barang)
 *
 * Features:
 * - Finished Goods report with correct "Out Repack" column
 * - Materials report with "Out Prod" for production consumption
 * - Date range filtering
 * - Excel export preparation
 * - Stock Opname placeholder columns
 */
@Injectable()
export class TransactionReportService extends BaseResponse {
  constructor(
    @InjectRepository(DailyInventory)
    private readonly dailyInventoryRepo: Repository<DailyInventory>,
    @InjectRepository(DailyInventorySnapshots)
    private readonly snapshotsRepo: Repository<DailyInventorySnapshots>,
    @InjectRepository(InventoryTransactions)
    private readonly transactionsRepo: Repository<InventoryTransactions>,
    @InjectRepository(ProductCodes)
    private readonly productCodesRepo: Repository<ProductCodes>,
  ) {
    super();
  }

  /**
   * Helper: Check if date is today
   * Used to determine which table to query (live vs snapshots)
   */
  private isToday(dateString: string): boolean {
    const today = new Date().toISOString().split('T')[0];
    return dateString === today;
  }

  /**
   * GET /inventory/reports/finished-goods
   * Generate transaction report for Barang Jadi
   *
   * Logic (Human-Centered Design):
   * 1. Stok Awal: From startDate snapshot (beginning of period)
   * 2. Transactions: Aggregated between startDate and endDate
   *    - Barang Masuk: PRODUCTION_IN, REPACK_IN, SAMPLE_RETURN
   *    - Dipesan (Out Sales): SALE
   *    - Repack: REPACK_OUT
   *    - Sample: SAMPLE_OUT
   * 3. Stok Akhir: From endDate snapshot (end of period)
   *
   * Performance: Optimized with Promise.all for parallel queries per product
   */
  async getFinishedGoodsReport(
    filters: TransactionReportFiltersDto,
  ): Promise<ResponsePagination> {
    let { startDate, endDate, productCodeId, page, pageSize } = filters;

    // Fallback pagination logic (ensure limit is calculated)
    page = page ? Number(page) : 1;
    pageSize = pageSize ? Number(pageSize) : 50;
    const offset = (page - 1) * pageSize;

    console.log('DEBUG FILTER FG:', { page, pageSize, offset, filters });

    // Default date range: This Month (1st to Today)
    const today = new Date();
    const defaultEndDate = today.toISOString().split('T')[0];
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const defaultStartDate = firstDay.toISOString().split('T')[0];

    const finalStartDate = startDate || defaultStartDate;
    const finalEndDate = endDate || defaultEndDate;

    // Smart routing for start and end dates
    const useStartSnapshot = !this.isToday(finalStartDate);
    const useEndSnapshot = !this.isToday(finalEndDate);

    // Repositories for start and end
    const startRepo = useStartSnapshot
      ? this.snapshotsRepo
      : this.dailyInventoryRepo;
    const endRepo = useEndSnapshot
      ? this.snapshotsRepo
      : this.dailyInventoryRepo;
    const startDateField = useStartSnapshot ? 'snapshotDate' : 'businessDate';
    const endDateField = useEndSnapshot ? 'snapshotDate' : 'businessDate';

    // Main query: Get all finished goods product codes
    let productQuery = this.productCodesRepo
      .createQueryBuilder('pc')
      .leftJoin('pc.product', 'p')
      .leftJoin('pc.category', 'cat')
      .leftJoin('pc.size', 'size')
      .select([
        'pc.id AS id',
        'pc.productCode AS productCode',
        'p.name AS productName',
        'size.sizeValue AS sizeValue',
      ])
      .where('cat.name = :category', { category: 'Barang Jadi' })
      .andWhere('pc.isActive = :isActive', { isActive: true });

    // Product filter
    if (productCodeId) {
      productQuery = productQuery.andWhere('pc.id = :productCodeId', {
        productCodeId,
      });
    }

    // Get total count first
    const total = await productQuery.getCount();

    // Order and pagination for data query
    productQuery = productQuery
      .orderBy('pc.productCode', 'ASC')
      .offset(offset)
      .limit(pageSize);

    const products = await productQuery.getRawMany();

    if (products.length === 0) {
      return this._pagination(
        'Finished goods report retrieved successfully',
        [],
        total,
        page,
        pageSize,
      );
    }

    const productIds = products.map((p) => p.id);

    // BATCH 1: Get Stok Awal
    const startAlias = useStartSnapshot ? 'start_snap' : 'start_daily';
    const stokAwalResults = await startRepo
      .createQueryBuilder(startAlias)
      .select(`${startAlias}.productCodeId`, 'productCodeId')
      .addSelect(`${startAlias}.stokAwal`, 'stokAwal')
      .where(`${startAlias}.productCodeId IN (:...ids)`, { ids: productIds })
      .andWhere(`${startAlias}.${startDateField} = :startDate`, {
        startDate: finalStartDate,
      })
      .getRawMany();

    const stokAwalMap = new Map(
      stokAwalResults.map((item) => [
        item.productCodeId,
        Number(item.stokAwal || 0),
      ]),
    );

    // BATCH 2: Get Stok Akhir
    const endAlias = useEndSnapshot ? 'end_snap' : 'end_daily';
    const stokAkhirResults = await endRepo
      .createQueryBuilder(endAlias)
      .select(`${endAlias}.productCodeId`, 'productCodeId')
      .addSelect(`${endAlias}.stokAkhir`, 'stokAkhir')
      .where(`${endAlias}.productCodeId IN (:...ids)`, { ids: productIds })
      .andWhere(`${endAlias}.${endDateField} = :endDate`, {
        endDate: finalEndDate,
      })
      .getRawMany();

    const stokAkhirMap = new Map(
      stokAkhirResults.map((item) => [
        item.productCodeId,
        Number(item.stokAkhir || 0),
      ]),
    );

    // BATCH 3: Get Transactions
    const transactions = await this.transactionsRepo
      .createQueryBuilder('trx')
      .select('trx.productCodeId', 'productCodeId')
      .addSelect('trx.transactionType', 'type')
      .addSelect('SUM(ABS(trx.quantity))', 'total')
      .where('trx.productCodeId IN (:...ids)', { ids: productIds })
      .andWhere('trx.businessDate >= :startDate', {
        startDate: finalStartDate,
      })
      .andWhere('trx.businessDate <= :endDate', { endDate: finalEndDate })
      .andWhere('trx.status = :status', { status: 'COMPLETED' })
      .groupBy('trx.productCodeId')
      .addGroupBy('trx.transactionType')
      .getRawMany();

    // Process transactions into a map for easy lookup
    // Map<productCodeId, { type: total }>
    const transactionMap = new Map<number, Record<string, number>>();

    transactions.forEach((t) => {
      const pId = t.productCodeId;
      if (!transactionMap.has(pId)) {
        transactionMap.set(pId, {});
      }
      const pTrans = transactionMap.get(pId)!;
      pTrans[t.type] = Number(t.total || 0);
    });

    // Combine all data
    const reportRows: TransactionReportRow[] = products.map((pc) => {
      const pId = pc.id;
      const stokAwal = stokAwalMap.get(pId) || 0;
      const stokAkhir = stokAkhirMap.get(pId) || 0;
      const trans = transactionMap.get(pId) || {};

      // Map transaction types to columns
      const barangMasuk =
        (trans['PRODUCTION_IN'] || 0) +
        (trans['REPACK_IN'] || 0) +
        (trans['SAMPLE_RETURN'] || 0);

      const dipesan = trans['SALE'] || 0;
      const barangOutRepack = trans['REPACK_OUT'] || 0;
      const barangOutSample = trans['SAMPLE_OUT'] || 0;

      return {
        productCodeId: pc.id,
        productCode: pc.productCode,
        productName: `${pc.productName} @ ${pc.sizeValue || ''}`,
        stokAwal,
        barangMasuk,
        dipesan,
        barangOutRepack,
        barangOutSample,
        barangOutProduksi: 0, // Not used for finished goods
        stokAkhir,
        soFisik: null,
        selisih: null,
        keterangan: '',
      };
    });

    return this._pagination(
      'Finished goods report retrieved successfully',
      reportRows,
      total,
      page,
      pageSize,
    );
  }

  /**
   * GET /inventory/reports/materials
   * Generate transaction report for Materials (Bahan Baku, Pembantu, Kemasan)
   *
   * Logic (Human-Centered Design):
   * 1. Stok Awal: From startDate snapshot
   * 2. Transactions: Aggregated between startDate and endDate
   *    - Barang Masuk (Purchase): PURCHASE
   *    - Out Prod: PRODUCTION_MATERIAL_OUT
   * 3. Stok Akhir: From endDate snapshot
   */
  async getMaterialsReport(
    filters: TransactionReportFiltersDto,
  ): Promise<ResponsePagination> {
    let { startDate, endDate, mainCategory, productCodeId, page, pageSize } =
      filters;

    // Fallback pagination logic (ensure limit is calculated)
    page = page ? Number(page) : 1;
    pageSize = pageSize ? Number(pageSize) : 50;
    const offset = (page - 1) * pageSize;

    console.log('DEBUG FILTER MTR:', { page, pageSize, offset, filters });

    // Default date range: This Month (1st to Today)
    const today = new Date();
    const defaultEndDate = today.toISOString().split('T')[0];
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const defaultStartDate = firstDay.toISOString().split('T')[0];

    const finalStartDate = startDate || defaultStartDate;
    const finalEndDate = endDate || defaultEndDate;

    // Smart routing for start and end dates
    const useStartSnapshot = !this.isToday(finalStartDate);
    const useEndSnapshot = !this.isToday(finalEndDate);

    const startRepo = useStartSnapshot
      ? this.snapshotsRepo
      : this.dailyInventoryRepo;
    const endRepo = useEndSnapshot
      ? this.snapshotsRepo
      : this.dailyInventoryRepo;
    const startDateField = useStartSnapshot ? 'snapshotDate' : 'businessDate';
    const endDateField = useEndSnapshot ? 'snapshotDate' : 'businessDate';

    // Main query: Get all materials product codes
    let productQuery = this.productCodesRepo
      .createQueryBuilder('pc')
      .leftJoin('pc.product', 'p')
      .leftJoin('pc.category', 'cat')
      .leftJoin('pc.size', 'size')
      .select([
        'pc.id AS id',
        'pc.productCode AS productCode',
        'p.name AS productName',
        'size.unitOfMeasure AS unitOfMeasure',
      ])
      .where('pc.isActive = :isActive', { isActive: true });

    // Main category filter - use specific category if provided, otherwise all materials
    if (mainCategory) {
      productQuery = productQuery.andWhere('cat.name = :mainCategory', {
        mainCategory,
      });
    } else {
      productQuery = productQuery.andWhere('cat.name IN (:...categories)', {
        categories: ['Barang Baku', 'Barang Pembantu', 'Barang Kemasan'],
      });
    }

    // Product filter
    if (productCodeId) {
      productQuery = productQuery.andWhere('pc.id = :productCodeId', {
        productCodeId,
      });
    }

    // Get total count first
    const total = await productQuery.getCount();

    // Order and pagination for data query
    productQuery = productQuery
      .orderBy('pc.productCode', 'ASC')
      .offset(offset)
      .limit(pageSize);

    const products = await productQuery.getRawMany();

    if (products.length === 0) {
      return this._pagination(
        'Materials report retrieved successfully',
        [],
        total,
        page,
        pageSize,
      );
    }

    const productIds = products.map((p) => p.id);

    // BATCH 1: Get Stok Awal
    const startAlias = useStartSnapshot ? 'start_snap' : 'start_daily';
    const stokAwalResults = await startRepo
      .createQueryBuilder(startAlias)
      .select(`${startAlias}.productCodeId`, 'productCodeId')
      .addSelect(`${startAlias}.stokAwal`, 'stokAwal')
      .where(`${startAlias}.productCodeId IN (:...ids)`, { ids: productIds })
      .andWhere(`${startAlias}.${startDateField} = :startDate`, {
        startDate: finalStartDate,
      })
      .getRawMany();

    const stokAwalMap = new Map(
      stokAwalResults.map((item) => [
        item.productCodeId,
        Number(item.stokAwal || 0),
      ]),
    );

    // BATCH 2: Get Stok Akhir
    const endAlias = useEndSnapshot ? 'end_snap' : 'end_daily';
    const stokAkhirResults = await endRepo
      .createQueryBuilder(endAlias)
      .select(`${endAlias}.productCodeId`, 'productCodeId')
      .addSelect(`${endAlias}.stokAkhir`, 'stokAkhir')
      .where(`${endAlias}.productCodeId IN (:...ids)`, { ids: productIds })
      .andWhere(`${endAlias}.${endDateField} = :endDate`, {
        endDate: finalEndDate,
      })
      .getRawMany();

    const stokAkhirMap = new Map(
      stokAkhirResults.map((item) => [
        item.productCodeId,
        Number(item.stokAkhir || 0),
      ]),
    );

    // BATCH 3: Get Transactions
    const transactions = await this.transactionsRepo
      .createQueryBuilder('trx')
      .select('trx.productCodeId', 'productCodeId')
      .addSelect('trx.transactionType', 'type')
      .addSelect('SUM(ABS(trx.quantity))', 'total')
      .where('trx.productCodeId IN (:...ids)', { ids: productIds })
      .andWhere('trx.businessDate >= :startDate', {
        startDate: finalStartDate,
      })
      .andWhere('trx.businessDate <= :endDate', { endDate: finalEndDate })
      .andWhere('trx.status = :status', { status: 'COMPLETED' })
      .groupBy('trx.productCodeId')
      .addGroupBy('trx.transactionType')
      .getRawMany();

    // Process transactions into a map for easy lookup
    const transactionMap = new Map<number, Record<string, number>>();

    transactions.forEach((t) => {
      const pId = t.productCodeId;
      if (!transactionMap.has(pId)) {
        transactionMap.set(pId, {});
      }
      const pTrans = transactionMap.get(pId)!;
      pTrans[t.type] = Number(t.total || 0);
    });

    // Combine all data
    const reportRows: TransactionReportRow[] = products.map((pc) => {
      const pId = pc.id;
      const stokAwal = stokAwalMap.get(pId) || 0;
      const stokAkhir = stokAkhirMap.get(pId) || 0;
      const trans = transactionMap.get(pId) || {};

      // Map transaction types to columns
      const barangMasuk =
        (trans['PURCHASE'] || 0) + (trans['PRODUCTION_IN'] || 0);
      const barangOutProduksi = trans['PRODUCTION_MATERIAL_OUT'] || 0;

      return {
        productCodeId: pc.id,
        productCode: pc.productCode,
        productName: pc.productName,
        unit: pc.unitOfMeasure || '',
        stokAwal,
        barangMasuk,
        dipesan: 0,
        barangOutRepack: 0,
        barangOutSample: 0,
        barangOutProduksi,
        stokAkhir,
        soFisik: null,
        selisih: null,
        keterangan: '',
      };
    });

    return this._pagination(
      'Materials report retrieved successfully',
      reportRows,
      total,
      page,
      pageSize,
    );
  }

  /**
   * Helper: Get date range summary for reports
   * Useful for report headers in Excel export
   */
  async getReportSummary(
    startDate: string,
    endDate: string,
    mainCategory?: string,
  ): Promise<ResponseSuccess> {
    const queryBuilder = this.dailyInventoryRepo
      .createQueryBuilder('daily')
      .leftJoin('daily.productCode', 'pc')
      .leftJoin('pc.product', 'p')
      .leftJoin('pc.category', 'cat')
      .where('daily.businessDate >= :startDate', { startDate })
      .andWhere('daily.businessDate <= :endDate', { endDate })
      .andWhere('daily.isActive = :isActive', { isActive: true });

    if (mainCategory) {
      queryBuilder.andWhere('cat.name = :mainCategory', { mainCategory });
    }

    const [items, totalRecords] = await queryBuilder.getManyAndCount();

    // Calculate totals
    const totalStokAwal = items.reduce(
      (sum, item) => sum + Number(item.stokAwal),
      0,
    );
    const totalBarangMasuk = items.reduce(
      (sum, item) => sum + Number(item.barangMasuk),
      0,
    );
    const totalDipesan = items.reduce(
      (sum, item) => sum + Number(item.dipesan),
      0,
    );
    const totalStokAkhir = items.reduce(
      (sum, item) => sum + Number(item.stokAkhir),
      0,
    );

    return this._success('Report summary calculated successfully', {
      dateRange: {
        start: startDate,
        end: endDate,
      },
      category: mainCategory || 'All Materials',
      totalRecords,
      totals: {
        stokAwal: totalStokAwal,
        barangMasuk: totalBarangMasuk,
        dipesan: totalDipesan,
        stokAkhir: totalStokAkhir,
      },
    });
  }
}
