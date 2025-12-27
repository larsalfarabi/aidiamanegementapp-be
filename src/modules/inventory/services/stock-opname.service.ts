import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import BaseResponse from 'src/common/response/base.response';
import { ResponseSuccess } from 'src/common/interface/response.interface';
import { StockOpnameRecords } from '../entity/stock-opname-records.entity';
import { DailyInventory } from '../entity/daily-inventory.entity';
import { ProductCodes } from '../../products/entity/product_codes.entity';
import {
  BatchStockOpnameSaveDto,
  StockOpnameFiltersDto,
} from '../dto/transaction-report.dto';

/**
 * StockOpnameService
 *
 * Service untuk Stock Opname Workflow B (Improved)
 *
 * Features:
 * - Batch save SO FISIK values (terpisah dari daily_inventory)
 * - Session-based (bisa save progress)
 * - Auto-calculate selisih = SO FISIK - STCK AKHIR
 * - Tidak mempengaruhi transaksi normal
 * - Support export Excel final dengan SO data
 */
@Injectable()
export class StockOpnameService extends BaseResponse {
  constructor(
    @InjectRepository(StockOpnameRecords)
    private readonly stockOpnameRepo: Repository<StockOpnameRecords>,
    @InjectRepository(DailyInventory)
    private readonly dailyInventoryRepo: Repository<DailyInventory>,
    @InjectRepository(ProductCodes)
    private readonly productCodesRepo: Repository<ProductCodes>,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  /**
   * POST /inventory/stock-opname/batch-save
   * Save batch Stock Opname entries (Improved Workflow B)
   *
   * Features:
   * - Upsert operation (create or update existing)
   * - Auto-calculate selisih
   * - Transaction-safe
   * - Session-based grouping
   */
  async batchSave(
    dto: BatchStockOpnameSaveDto,
    userId: number,
  ): Promise<ResponseSuccess> {
    const { sessionDate, entries } = dto;

    console.log(
      `\n🔄 [BATCH SAVE START] sessionDate: ${sessionDate}, entries: ${entries.length}`,
    );
    console.log(`📦 [BATCH SAVE] Entries:`, JSON.stringify(entries, null, 2));

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const savedRecords = [];
      let updateCount = 0;
      let insertCount = 0;

      for (const entry of entries) {
        const { productCodeId, stokAkhir, soFisik, keterangan } = entry;

        console.log(
          `\n📝 [PROCESSING] productCodeId: ${productCodeId}, soFisik: ${soFisik}, keterangan: ${keterangan}`,
        );

        // Calculate selisih if soFisik provided
        const selisih =
          soFisik !== null && soFisik !== undefined
            ? soFisik - stokAkhir
            : null;

        console.log(
          `🧮 [CALC] stokAkhir: ${stokAkhir}, soFisik: ${soFisik}, selisih: ${selisih}`,
        );

        // Check if record exists - FIXED: Use query builder with DATE() function for exact date matching
        let soRecord = await queryRunner.manager
          .createQueryBuilder(StockOpnameRecords, 'so')
          .where('DATE(so.sessionDate) = :sessionDate', { sessionDate })
          .andWhere('so.productCodeId = :productCodeId', { productCodeId })
          .getOne();

        console.log(
          `🔍 [CHECK] Existing record found: ${soRecord ? `YES (id=${soRecord.id})` : 'NO'}`,
        );

        if (soRecord) {
          // Update existing
          console.log(`🔄 [UPDATE] Updating existing record id=${soRecord.id}`);
          soRecord.stokAkhir = stokAkhir;
          soRecord.soFisik = soFisik !== undefined ? soFisik : null;
          soRecord.selisih = selisih;
          soRecord.keterangan = keterangan || soRecord.keterangan;
          soRecord.updatedBy = userId;

          await queryRunner.manager.save(soRecord);
          updateCount++;
          console.log(`✅ [UPDATE] Success for productCodeId=${productCodeId}`);
        } else {
          // Create new
          console.log(
            `➕ [INSERT] Creating new record for productCodeId=${productCodeId}`,
          );
          soRecord = queryRunner.manager.create(StockOpnameRecords, {
            sessionDate: new Date(sessionDate),
            productCodeId,
            stokAkhir,
            soFisik: soFisik !== undefined ? soFisik : null,
            selisih,
            keterangan,
            status: 'DRAFT',
            createdBy: userId,
          });

          await queryRunner.manager.save(soRecord);
          insertCount++;
          console.log(
            `✅ [INSERT] Success for productCodeId=${productCodeId}, new id=${soRecord.id}`,
          );
        }

        savedRecords.push(soRecord);
      }

      await queryRunner.commitTransaction();

      console.log(`\n✅ [BATCH SAVE SUCCESS]`);
      console.log(`   - Total processed: ${savedRecords.length}`);
      console.log(`   - Inserted: ${insertCount}`);
      console.log(`   - Updated: ${updateCount}`);
      console.log(`   - SessionDate: ${sessionDate}`);

      return this._success(
        `Batch stock opname saved successfully (${savedRecords.length} products: ${insertCount} new, ${updateCount} updated)`,
        { count: savedRecords.length, sessionDate, insertCount, updateCount },
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('\n❌ [BATCH SAVE ERROR]', error);
      console.error('   Stack:', error.stack);
      return this._fail('Failed to save stock opname data', 500);
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * GET /inventory/stock-opname/session
   * Get Stock Opname session data
   *
   * Returns SO data with product details for displaying in table
   */
  async getSession(filters: StockOpnameFiltersDto): Promise<ResponseSuccess> {
    const { sessionDate, mainCategory, status } = filters;

    const queryBuilder = this.stockOpnameRepo
      .createQueryBuilder('so')
      .leftJoinAndSelect('so.productCode', 'pc')
      .leftJoinAndSelect('pc.product', 'p')
      .leftJoinAndSelect('p.category', 'cat')
      .leftJoinAndSelect('pc.size', 'size');

    if (sessionDate) {
      queryBuilder.where('so.sessionDate = :sessionDate', { sessionDate });
    }

    if (mainCategory) {
      queryBuilder.andWhere('cat.name = :mainCategory', { mainCategory });
    }

    if (status) {
      queryBuilder.andWhere('so.status = :status', { status });
    }

    queryBuilder.orderBy('pc.productCode', 'ASC');

    const records = await queryBuilder.getMany();

    return this._success('Stock opname session retrieved successfully', {
      sessionDate,
      count: records.length,
      records: records.map((so) => ({
        id: so.id,
        productCodeId: so.productCodeId,
        productCode: so.productCode.productCode,
        productName: `${so.productCode.product.name} @ ${so.productCode.size?.sizeValue || ''}`,
        stokAkhir: Number(so.stokAkhir),
        soFisik: so.soFisik !== null ? Number(so.soFisik) : null,
        selisih: so.selisih !== null ? Number(so.selisih) : null,
        keterangan: so.keterangan || '',
        status: so.status,
      })),
    });
  }

  /**
   * POST /inventory/stock-opname/finalize
   * Finalize Stock Opname session (mark as COMPLETED)
   *
   * Once finalized, SO data can be exported to Excel
   */
  async finalizeSession(
    sessionDate: string,
    userId: number,
  ): Promise<ResponseSuccess> {
    const updated = await this.stockOpnameRepo.update(
      { sessionDate: new Date(sessionDate) },
      { status: 'COMPLETED', updatedBy: userId },
    );

    if (updated.affected === 0) {
      return this._fail('No stock opname records found for this session', 404);
    }

    return this._success('Stock opname session finalized successfully', {
      sessionDate,
      affectedRecords: updated.affected,
    });
  }

  /**
   * DELETE /inventory/stock-opname/session/:sessionDate
   * Delete entire Stock Opname session
   *
   * Useful for clearing draft data
   */
  async deleteSession(sessionDate: string): Promise<ResponseSuccess> {
    const deleted = await this.stockOpnameRepo.delete({
      sessionDate: new Date(sessionDate),
    });

    if (deleted.affected === 0) {
      return this._fail('No stock opname records found for this session', 404);
    }

    return this._success('Stock opname session deleted successfully', {
      sessionDate,
      deletedRecords: deleted.affected,
    });
  }

  /**
   * GET /inventory/stock-opname/sessions
   * Get list of all Stock Opname sessions
   *
   * For session history/management
   */
  async getSessions(): Promise<ResponseSuccess> {
    const sessions = await this.stockOpnameRepo
      .createQueryBuilder('so')
      .select('so.sessionDate', 'sessionDate')
      .addSelect('COUNT(so.id)', 'totalProducts')
      .addSelect(
        'SUM(CASE WHEN so.soFisik IS NOT NULL THEN 1 ELSE 0 END)',
        'completedProducts',
      )
      .addSelect('so.status', 'status')
      .groupBy('so.sessionDate')
      .addGroupBy('so.status')
      .orderBy('so.sessionDate', 'DESC')
      .getRawMany();

    return this._success('Stock opname sessions retrieved successfully', {
      sessions: sessions.map((s) => ({
        sessionDate: s.sessionDate,
        totalProducts: parseInt(s.totalProducts),
        completedProducts: parseInt(s.completedProducts),
        status: s.status,
        progress: `${s.completedProducts}/${s.totalProducts}`,
      })),
    });
  }
}
