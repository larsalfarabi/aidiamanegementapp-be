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
    const {
      startDate,
      endDate,
      productCodeId,
      page = 1,
      pageSize = 50,
    } = filters;

    // Default date range: last 7 days if not specified
    const defaultEndDate = new Date().toISOString().split('T')[0];
    const defaultStartDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

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
        'pc.id',
        'pc.productCode',
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
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const products = await productQuery.getRawMany();

    // For each product, get stokAwal, transactions, and stokAkhir
    const reportRows: TransactionReportRow[] = await Promise.all(
      products.map(async (pc) => {
        // 1. Get Stok Awal from startDate
        const startAlias = useStartSnapshot ? 'start_snap' : 'start_daily';
        const stokAwalData = await startRepo
          .createQueryBuilder(startAlias)
          .select(`${startAlias}.stokAwal`, 'stokAwal')
          .where(`${startAlias}.productCodeId = :pcId`, { pcId: pc.pc_id })
          .andWhere(`${startAlias}.${startDateField} = :startDate`, {
            startDate: finalStartDate,
          })
          .getRawOne();

        // 2. Get Stok Akhir from endDate
        const endAlias = useEndSnapshot ? 'end_snap' : 'end_daily';
        const stokAkhirData = await endRepo
          .createQueryBuilder(endAlias)
          .select(`${endAlias}.stokAkhir`, 'stokAkhir')
          .where(`${endAlias}.productCodeId = :pcId`, { pcId: pc.pc_id })
          .andWhere(`${endAlias}.${endDateField} = :endDate`, {
            endDate: finalEndDate,
          })
          .getRawOne();

        // 3. Aggregate transactions between startDate and endDate
        const transactions = await this.transactionsRepo
          .createQueryBuilder('trx')
          .select('trx.transactionType', 'type')
          .addSelect('SUM(ABS(trx.quantity))', 'total')
          .where('trx.productCodeId = :pcId', { pcId: pc.pc_id })
          .andWhere('trx.businessDate >= :startDate', {
            startDate: finalStartDate,
          })
          .andWhere('trx.businessDate <= :endDate', { endDate: finalEndDate })
          .andWhere('trx.status = :status', { status: 'COMPLETED' })
          .groupBy('trx.transactionType')
          .getRawMany();

        // Map transaction types to columns
        const barangMasuk = transactions
          .filter((t) =>
            ['PRODUCTION_IN', 'REPACK_IN', 'SAMPLE_RETURN'].includes(t.type),
          )
          .reduce((sum, t) => sum + Number(t.total), 0);

        const dipesan = transactions
          .filter((t) => t.type === 'SALE')
          .reduce((sum, t) => sum + Number(t.total), 0);

        const barangOutRepack = transactions
          .filter((t) => t.type === 'REPACK_OUT')
          .reduce((sum, t) => sum + Number(t.total), 0);

        const barangOutSample = transactions
          .filter((t) => t.type === 'SAMPLE_OUT')
          .reduce((sum, t) => sum + Number(t.total), 0);

        return {
          productCodeId: pc.pc_id,
          productCode: pc.pc_productCode,
          productName: `${pc.productName} @ ${pc.sizeValue || ''}`,
          stokAwal: Number(stokAwalData?.stokAwal) || 0,
          barangMasuk,
          dipesan,
          barangOutRepack,
          barangOutSample,
          barangOutProduksi: 0, // Not used for finished goods
          stokAkhir: Number(stokAkhirData?.stokAkhir) || 0,
          soFisik: null, // Manual entry
          selisih: null, // Calculated after SO Fisik entry
          keterangan: '', // Transaction-based report, no single note
        };
      }),
    );

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
    const {
      startDate,
      endDate,
      mainCategory,
      productCodeId,
      page = 1,
      pageSize = 50,
    } = filters;

    // Default date range: last 7 days
    const defaultEndDate = new Date().toISOString().split('T')[0];
    const defaultStartDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

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
        'pc.id',
        'pc.productCode',
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
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const products = await productQuery.getRawMany();

    // For each product, get stokAwal, transactions, and stokAkhir
    const reportRows: TransactionReportRow[] = await Promise.all(
      products.map(async (pc) => {
        // 1. Get Stok Awal from startDate
        const startAlias = useStartSnapshot ? 'start_snap' : 'start_daily';
        const stokAwalData = await startRepo
          .createQueryBuilder(startAlias)
          .select(`${startAlias}.stokAwal`, 'stokAwal')
          .where(`${startAlias}.productCodeId = :pcId`, { pcId: pc.pc_id })
          .andWhere(`${startAlias}.${startDateField} = :startDate`, {
            startDate: finalStartDate,
          })
          .getRawOne();

        // 2. Get Stok Akhir from endDate
        const endAlias = useEndSnapshot ? 'end_snap' : 'end_daily';
        const stokAkhirData = await endRepo
          .createQueryBuilder(endAlias)
          .select(`${endAlias}.stokAkhir`, 'stokAkhir')
          .where(`${endAlias}.productCodeId = :pcId`, { pcId: pc.pc_id })
          .andWhere(`${endAlias}.${endDateField} = :endDate`, {
            endDate: finalEndDate,
          })
          .getRawOne();

        // 3. Aggregate transactions between startDate and endDate
        const transactions = await this.transactionsRepo
          .createQueryBuilder('trx')
          .select('trx.transactionType', 'type')
          .addSelect('SUM(ABS(trx.quantity))', 'total')
          .where('trx.productCodeId = :pcId', { pcId: pc.pc_id })
          .andWhere('trx.businessDate >= :startDate', {
            startDate: finalStartDate,
          })
          .andWhere('trx.businessDate <= :endDate', { endDate: finalEndDate })
          .andWhere('trx.status = :status', { status: 'COMPLETED' })
          .groupBy('trx.transactionType')
          .getRawMany();

        // Map transaction types to columns
        const barangMasuk = transactions
          .filter((t) => t.type === 'PURCHASE')
          .reduce((sum, t) => sum + Number(t.total), 0);

        const barangOutProduksi = transactions
          .filter((t) => t.type === 'PRODUCTION_MATERIAL_OUT')
          .reduce((sum, t) => sum + Number(t.total), 0);

        return {
          productCodeId: pc.pc_id,
          productCode: pc.pc_productCode,
          productName: pc.productName,
          unit: pc.unitOfMeasure || '',
          stokAwal: Number(stokAwalData?.stokAwal) || 0,
          barangMasuk, // Purchase
          dipesan: 0, // Not used for materials
          barangOutRepack: 0, // Not used for materials
          barangOutSample: 0, // Not used for materials
          barangOutProduksi, // Out Prod
          stokAkhir: Number(stokAkhirData?.stokAkhir) || 0,
          soFisik: null, // Manual entry
          selisih: null, // Calculated after SO Fisik entry
          keterangan: '', // Transaction-based report
        };
      }),
    );

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
