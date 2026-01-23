import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { StockOpnameRecords } from '../entity/stock-opname-records.entity';
import {
  ExcelExportOptionsDto,
  TransactionReportRow,
  TransactionReportFiltersDto,
} from '../dto/transaction-report.dto';
import { TransactionReportService } from './transaction-report.service';

/**
 * ExcelExportService
 *
 * Service for exporting transaction reports to Excel format
 * Human-Centered Design approach with consistent formatting
 *
 * Features:
 * - Uses TransactionReportService for accurate date range aggregation
 * - Consistent format with Sales Reports (metadata header, professional styling)
 * - Finished Goods and Materials templates
 * - Stock Opname support with SO FISIK and Selisih columns
 * - Freeze panes, borders, and number formatting
 */
@Injectable()
export class ExcelExportService {
  constructor(
    private readonly transactionReportService: TransactionReportService,
    @InjectRepository(StockOpnameRecords)
    private readonly stockOpnameRepo: Repository<StockOpnameRecords>,
  ) {}

  /**
   * Export Finished Goods report to Excel
   * Uses TransactionReportService for accurate date range aggregation
   * Format consistent with Sales Reports (metadata header, professional styling)
   */
  async exportFinishedGoodsToExcel(
    options: ExcelExportOptionsDto,
    metadata?: { userName?: string; exportedAt?: string },
  ): Promise<ExcelJS.Buffer> {
    const { startDate, endDate, mainCategory } = options;

    // Step 1: Fetch data using TransactionReportService (with date range aggregation)
    const filters: TransactionReportFiltersDto = {
      startDate,
      endDate,
      mainCategory: mainCategory || 'Barang Jadi',
      page: 1,
      limit: 0,
      pageSize: 10000, // Get all data for export
    };

    const reportResult =
      await this.transactionReportService.getFinishedGoodsReport(filters);
    const rows: TransactionReportRow[] = reportResult.data;

    // Step 2: Create workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Laporan Barang Jadi', {
      properties: { defaultColWidth: 15 },
    });

    // Step 3: Add metadata header (rows 1-5) - consistent with Sales Reports
    const periodText = this.formatPeriodText(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );

    worksheet.mergeCells('A1:K1');
    const titleRow = worksheet.getCell('A1');
    titleRow.value = 'LAPORAN TRANSAKSI BARANG JADI';
    titleRow.font = { size: 16, bold: true };
    titleRow.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells('A2:K2');
    const periodRow = worksheet.getCell('A2');
    periodRow.value = `Periode: ${periodText}`;
    periodRow.font = { size: 12, bold: true };
    periodRow.alignment = { horizontal: 'center' };

    worksheet.mergeCells('A3:K3');
    const exportRow = worksheet.getCell('A3');
    exportRow.value = `Di-export pada: ${metadata?.exportedAt || new Date().toLocaleString('id-ID')}`;
    exportRow.font = { size: 10 };
    exportRow.alignment = { horizontal: 'center' };

    if (metadata?.userName) {
      worksheet.mergeCells('A4:K4');
      const userRow = worksheet.getCell('A4');
      userRow.value = `Oleh: ${metadata.userName}`;
      userRow.font = { size: 10 };
      userRow.alignment = { horizontal: 'center' };
    }

    // Empty row for spacing
    worksheet.addRow([]);

    // Step 4: Add column headers (row 6 or 5 depending on metadata)
    const headerRow = worksheet.addRow([
      'Kode',
      'Nama',
      'STCK AW',
      'Barang Masuk',
      'Dipesan',
      'Out Repack',
      'Sample',
      'STCK AKHIR',
      'SO FISIK',
      'Selisih',
      'KETERANGAN',
    ]);

    // Apply header styling to all 11 columns (A-K)
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (colNumber <= 11) {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4472C4' }, // Blue background (consistent with Sales Reports)
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
    });
    headerRow.height = 25;

    // Step 5: Add data rows
    rows.forEach((row) => {
      const excelRow = worksheet.addRow([
        row.productCode,
        row.productName,
        row.stokAwal,
        row.barangMasuk,
        row.dipesan,
        row.barangOutRepack,
        row.barangOutSample,
        row.stokAkhir,
        row.soFisik || '', // From Stock Opname session (if exists)
        row.selisih || '', // Calculated: SO FISIK - STCK AKHIR
        row.keterangan || '',
      ]);

      // Number formatting for numeric columns
      excelRow.getCell(3).numFmt = '#,##0.00'; // STCK AW
      excelRow.getCell(4).numFmt = '#,##0.00'; // Barang Masuk
      excelRow.getCell(5).numFmt = '#,##0.00'; // Dipesan
      excelRow.getCell(6).numFmt = '#,##0.00'; // Out Repack
      excelRow.getCell(7).numFmt = '#,##0.00'; // Sample
      excelRow.getCell(8).numFmt = '#,##0.00'; // STCK AKHIR
      excelRow.getCell(9).numFmt = '#,##0.00'; // SO FISIK
      excelRow.getCell(10).numFmt = '#,##0.00'; // Selisih

      // Conditional font color for Selisih (column 10)
      const selisihCell = excelRow.getCell(10);
      const selisihValue = row.selisih;
      if (selisihValue !== null && selisihValue !== undefined) {
        if (selisihValue < 0) {
          selisihCell.font = { color: { argb: 'FFFF0000' } }; // Red for negative
        } else if (selisihValue > 0) {
          selisihCell.font = { color: { argb: 'FF008000' } }; // Green for positive
        }
        // selisihValue === 0 uses default black color (no change)
      }
    });

    // Step 6: Format columns
    worksheet.columns = [
      { key: 'kode', width: 15 },
      { key: 'nama', width: 40 },
      { key: 'stckAw', width: 12 },
      { key: 'barangMasuk', width: 15 },
      { key: 'dipesan', width: 12 },
      { key: 'outRepack', width: 12 },
      { key: 'sample', width: 12 },
      { key: 'stckAkhir', width: 12 },
      { key: 'soFisik', width: 12 },
      { key: 'selisih', width: 12 },
      { key: 'keterangan', width: 30 },
    ];

    // Step 7: Freeze panes (header row stays visible when scrolling)
    const freezeRow = metadata?.userName ? 6 : 5;
    worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: freezeRow }];

    // Step 8: Add borders to all data cells
    const borderStyle: Partial<ExcelJS.Border> = {
      style: 'thin',
      color: { argb: 'FF000000' },
    };

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber >= freezeRow) {
        // Only data rows and header
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.border = {
            top: borderStyle,
            left: borderStyle,
            bottom: borderStyle,
            right: borderStyle,
          };
        });
      }
    });

    // Step 9: Generate buffer
    return await workbook.xlsx.writeBuffer();
  }

  /**
   * Export Materials report to Excel
   * Uses TransactionReportService for accurate date range aggregation
   * Format consistent with Sales Reports
   */
  async exportMaterialsToExcel(
    options: ExcelExportOptionsDto,
    metadata?: { userName?: string; exportedAt?: string },
  ): Promise<ExcelJS.Buffer> {
    const { startDate, endDate, mainCategory } = options;

    // Step 1: Fetch data using TransactionReportService
    const filters: TransactionReportFiltersDto = {
      startDate,
      endDate,
      mainCategory: mainCategory || 'Barang Baku', // Default to Barang Baku
      page: 1,
      limit: 0,
      pageSize: 10000,
    };

    const reportResult =
      await this.transactionReportService.getMaterialsReport(filters);
    const rows: TransactionReportRow[] = reportResult.data;

    // Step 2: Create workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Laporan Material', {
      properties: { defaultColWidth: 15 },
    });

    // Step 3: Add metadata header
    const periodText = this.formatPeriodText(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );

    const categoryName = mainCategory || 'Material';

    worksheet.mergeCells('A1:I1');
    const titleRow = worksheet.getCell('A1');
    titleRow.value = `LAPORAN TRANSAKSI ${categoryName.toUpperCase()}`;
    titleRow.font = { size: 16, bold: true };
    titleRow.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells('A2:I2');
    const periodRow = worksheet.getCell('A2');
    periodRow.value = `Periode: ${periodText}`;
    periodRow.font = { size: 12, bold: true };
    periodRow.alignment = { horizontal: 'center' };

    worksheet.mergeCells('A3:I3');
    const exportRow = worksheet.getCell('A3');
    exportRow.value = `Di-export pada: ${metadata?.exportedAt || new Date().toLocaleString('id-ID')}`;
    exportRow.font = { size: 10 };
    exportRow.alignment = { horizontal: 'center' };

    if (metadata?.userName) {
      worksheet.mergeCells('A4:I4');
      const userRow = worksheet.getCell('A4');
      userRow.value = `Oleh: ${metadata.userName}`;
      userRow.font = { size: 10 };
      userRow.alignment = { horizontal: 'center' };
    }

    // Empty row for spacing
    worksheet.addRow([]);

    // Step 4: Add column headers (9 columns for materials)
    const headerRow = worksheet.addRow([
      'Kode',
      'Nama',
      'STCK AW',
      'Purchase',
      'Out Prod',
      'STCK AKHIR',
      'SO FISIK',
      'Selisih',
      'KETERANGAN',
    ]);

    // Apply header styling to all 9 columns (A-I)
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (colNumber <= 9) {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4472C4' },
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
    });
    headerRow.height = 25;

    // Step 5: Add data rows
    rows.forEach((row) => {
      const excelRow = worksheet.addRow([
        row.productCode,
        row.productName,
        row.stokAwal,
        row.barangMasuk, // Purchase for materials
        row.barangOutProduksi, // Out Prod (production consumption)
        row.stokAkhir,
        row.soFisik || '',
        row.selisih || '',
        row.keterangan || '',
      ]);

      // Number formatting for numeric columns
      excelRow.getCell(3).numFmt = '#,##0.00'; // STCK AW
      excelRow.getCell(4).numFmt = '#,##0.00'; // Purchase
      excelRow.getCell(5).numFmt = '#,##0.00'; // Out Prod
      excelRow.getCell(6).numFmt = '#,##0.00'; // STCK AKHIR
      excelRow.getCell(7).numFmt = '#,##0.00'; // SO FISIK
      excelRow.getCell(8).numFmt = '#,##0.00'; // Selisih

      // Conditional font color for Selisih (column 8)
      const selisihCell = excelRow.getCell(8);
      const selisihValue = row.selisih;
      if (selisihValue !== null && selisihValue !== undefined) {
        if (selisihValue < 0) {
          selisihCell.font = { color: { argb: 'FFFF0000' } }; // Red for negative
        } else if (selisihValue > 0) {
          selisihCell.font = { color: { argb: 'FF008000' } }; // Green for positive
        }
        // selisihValue === 0 uses default black color (no change)
      }
    });

    // Step 6: Format columns
    worksheet.columns = [
      { key: 'kode', width: 15 },
      { key: 'nama', width: 40 },
      { key: 'stckAw', width: 12 },
      { key: 'purchase', width: 15 },
      { key: 'outProd', width: 12 },
      { key: 'stckAkhir', width: 12 },
      { key: 'soFisik', width: 12 },
      { key: 'selisih', width: 12 },
      { key: 'keterangan', width: 30 },
    ];

    // Step 7: Freeze panes
    const freezeRow = metadata?.userName ? 6 : 5;
    worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: freezeRow }];

    // Step 8: Add borders
    const borderStyle: Partial<ExcelJS.Border> = {
      style: 'thin',
      color: { argb: 'FF000000' },
    };

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber >= freezeRow) {
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.border = {
            top: borderStyle,
            left: borderStyle,
            bottom: borderStyle,
            right: borderStyle,
          };
        });
      }
    });

    // Step 9: Generate buffer
    return await workbook.xlsx.writeBuffer();
  }

  /**
   * Export Stock Opname with SO FISIK data (Improved Workflow B)
   * Final export after batch adjustment completed
   *
   * Includes SO FISIK values from stock_opname_records table
   */
  async exportStockOpnameWithData(
    options: ExcelExportOptionsDto,
    metadata?: { userName?: string; exportedAt?: string },
  ): Promise<ExcelJS.Buffer> {
    const { startDate, endDate, mainCategory, reportType } = options;

    // Determine export type from reportType parameter (preferred) or mainCategory (fallback)
    const isFinishedGoods =
      reportType === 'finished-goods' || mainCategory === 'Barang Jadi';

    // Step 1: Fetch transaction report data
    const filters: TransactionReportFiltersDto = {
      startDate,
      endDate,
      mainCategory: isFinishedGoods
        ? 'Barang Jadi'
        : mainCategory || 'Barang Baku',
      page: 1,
      limit: 0,
      pageSize: 10000,
    };

    const reportResult = isFinishedGoods
      ? await this.transactionReportService.getFinishedGoodsReport(filters)
      : await this.transactionReportService.getMaterialsReport(filters);

    const rows: TransactionReportRow[] = reportResult.data;

    // Step 2: Fetch Stock Opname data if sessionDate provided
    // Note: Frontend saves with startDate as sessionDate (consistent with date range start)
    // CRITICAL: Must filter by mainCategory to match only products in current report
    let stockOpnameMap = new Map<number, any>();
    if (startDate) {
      // Determine mainCategory for filtering Stock Opname records
      const categoryFilter = isFinishedGoods
        ? 'Barang Jadi'
        : mainCategory || 'Barang Baku';

      // Use relation-based JOIN (like transaction report) to avoid circular reference
      // This ensures we get the correct category filter and avoid entity loading
      const stockOpnameRecords = await this.stockOpnameRepo
        .createQueryBuilder('so')
        .leftJoin('so.productCode', 'pc')
        .leftJoin('pc.category', 'cat')
        .select('so.productCodeId', 'productCodeId')
        .addSelect('so.soFisik', 'soFisik')
        .addSelect('so.selisih', 'selisih')
        .addSelect('so.keterangan', 'keterangan')
        .where('so.sessionDate = :sessionDate', { sessionDate: startDate })
        .andWhere('cat.name = :categoryName', { categoryName: categoryFilter })
        .getRawMany();

      stockOpnameRecords.forEach((record) => {
        stockOpnameMap.set(record.productCodeId, {
          soFisik: record.soFisik,
          selisih: record.selisih,
          keterangan: record.keterangan,
        });
      });
    }

    // Step 3: Merge Stock Opname data with transaction report
    const mergedRows = rows.map((row) => {
      const soData = stockOpnameMap.get(row.productCodeId);
      return {
        ...row,
        soFisik: soData?.soFisik || row.soFisik,
        selisih: soData?.selisih || row.selisih,
        keterangan: soData?.keterangan || row.keterangan,
      };
    });

    // Step 4: Use appropriate export method with merged data
    if (isFinishedGoods) {
      return this.exportFinishedGoodsWithSOData(
        mergedRows,
        startDate,
        endDate,
        metadata,
      );
    } else {
      return this.exportMaterialsWithSOData(
        mergedRows,
        startDate,
        endDate,
        mainCategory,
        metadata,
      );
    }
  }

  /**
   * Helper: Export Finished Goods with SO data included
   */
  private async exportFinishedGoodsWithSOData(
    rows: TransactionReportRow[],
    startDate?: string,
    endDate?: string,
    metadata?: { userName?: string; exportedAt?: string },
  ): Promise<ExcelJS.Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Stock Opname - Barang Jadi', {
      properties: { defaultColWidth: 15 },
    });

    const periodText = this.formatPeriodText(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );

    worksheet.mergeCells('A1:K1');
    const titleRow = worksheet.getCell('A1');
    titleRow.value = 'STOCK OPNAME - BARANG JADI';
    titleRow.font = { size: 16, bold: true };
    titleRow.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells('A2:K2');
    const periodRow = worksheet.getCell('A2');
    periodRow.value = `Periode: ${periodText}`;
    periodRow.font = { size: 12, bold: true };
    periodRow.alignment = { horizontal: 'center' };

    worksheet.mergeCells('A3:K3');
    const exportRow = worksheet.getCell('A3');
    exportRow.value = `Di-export pada: ${metadata?.exportedAt || new Date().toLocaleString('id-ID')}`;
    exportRow.font = { size: 10 };
    exportRow.alignment = { horizontal: 'center' };

    if (metadata?.userName) {
      worksheet.mergeCells('A4:K4');
      const userRow = worksheet.getCell('A4');
      userRow.value = `Oleh: ${metadata.userName}`;
      userRow.font = { size: 10 };
      userRow.alignment = { horizontal: 'center' };
    }

    worksheet.addRow([]);

    const headerRow = worksheet.addRow([
      'Kode',
      'Nama',
      'STCK AW',
      'Barang Masuk',
      'Dipesan',
      'Out Repack',
      'Sample',
      'STCK AKHIR',
      'SO FISIK',
      'Selisih',
      'KETERANGAN',
    ]);

    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (colNumber <= 11) {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4472C4' },
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
    });
    headerRow.height = 25;

    rows.forEach((row) => {
      const excelRow = worksheet.addRow([
        row.productCode,
        row.productName,
        row.stokAwal,
        row.barangMasuk,
        row.dipesan,
        row.barangOutRepack,
        row.barangOutSample,
        row.stokAkhir,
        row.soFisik !== null && row.soFisik !== undefined ? row.soFisik : '', // Show SO FISIK if exists
        row.selisih !== null && row.selisih !== undefined ? row.selisih : '', // Show Selisih if exists
        row.keterangan || '',
      ]);

      excelRow.getCell(3).numFmt = '#,##0.00';
      excelRow.getCell(4).numFmt = '#,##0.00';
      excelRow.getCell(5).numFmt = '#,##0.00';
      excelRow.getCell(6).numFmt = '#,##0.00';
      excelRow.getCell(7).numFmt = '#,##0.00';
      excelRow.getCell(8).numFmt = '#,##0.00';
      excelRow.getCell(9).numFmt = '#,##0.00';
      excelRow.getCell(10).numFmt = '#,##0.00';

      // Conditional font color for Selisih (column 10)
      const selisihCell = excelRow.getCell(10);
      const selisihValue = row.selisih;
      if (selisihValue !== null && selisihValue !== undefined) {
        if (selisihValue < 0) {
          selisihCell.font = { color: { argb: 'FFFF0000' } }; // Red for negative
        } else if (selisihValue > 0) {
          selisihCell.font = { color: { argb: 'FF008000' } }; // Green for positive
        }
        // selisihValue === 0 uses default black color (no change)
      }
    });

    worksheet.columns = [
      { key: 'kode', width: 15 },
      { key: 'nama', width: 40 },
      { key: 'stckAw', width: 12 },
      { key: 'barangMasuk', width: 15 },
      { key: 'dipesan', width: 12 },
      { key: 'outRepack', width: 12 },
      { key: 'sample', width: 12 },
      { key: 'stckAkhir', width: 12 },
      { key: 'soFisik', width: 12 },
      { key: 'selisih', width: 12 },
      { key: 'keterangan', width: 30 },
    ];

    const freezeRow = metadata?.userName ? 6 : 5;
    worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: freezeRow }];

    const borderStyle: Partial<ExcelJS.Border> = {
      style: 'thin',
      color: { argb: 'FF000000' },
    };

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber >= freezeRow) {
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.border = {
            top: borderStyle,
            left: borderStyle,
            bottom: borderStyle,
            right: borderStyle,
          };
        });
      }
    });

    return await workbook.xlsx.writeBuffer();
  }

  /**
   * Helper: Export Materials with SO data included
   */
  private async exportMaterialsWithSOData(
    rows: TransactionReportRow[],
    startDate?: string,
    endDate?: string,
    mainCategory?: string,
    metadata?: { userName?: string; exportedAt?: string },
  ): Promise<ExcelJS.Buffer> {
    const workbook = new ExcelJS.Workbook();
    const categoryName = mainCategory || 'Material';
    const worksheet = workbook.addWorksheet(`Stock Opname - ${categoryName}`, {
      properties: { defaultColWidth: 15 },
    });

    const periodText = this.formatPeriodText(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );

    worksheet.mergeCells('A1:I1');
    const titleRow = worksheet.getCell('A1');
    titleRow.value = `STOCK OPNAME - ${categoryName.toUpperCase()}`;
    titleRow.font = { size: 16, bold: true };
    titleRow.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells('A2:I2');
    const periodRow = worksheet.getCell('A2');
    periodRow.value = `Periode: ${periodText}`;
    periodRow.font = { size: 12, bold: true };
    periodRow.alignment = { horizontal: 'center' };

    worksheet.mergeCells('A3:I3');
    const exportRow = worksheet.getCell('A3');
    exportRow.value = `Di-export pada: ${metadata?.exportedAt || new Date().toLocaleString('id-ID')}`;
    exportRow.font = { size: 10 };
    exportRow.alignment = { horizontal: 'center' };

    if (metadata?.userName) {
      worksheet.mergeCells('A4:I4');
      const userRow = worksheet.getCell('A4');
      userRow.value = `Oleh: ${metadata.userName}`;
      userRow.font = { size: 10 };
      userRow.alignment = { horizontal: 'center' };
    }

    worksheet.addRow([]);

    const headerRow = worksheet.addRow([
      'Kode',
      'Nama',
      'STCK AW',
      'Purchase',
      'Out Prod',
      'STCK AKHIR',
      'SO FISIK',
      'Selisih',
      'KETERANGAN',
    ]);

    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (colNumber <= 9) {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4472C4' },
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
    });
    headerRow.height = 25;

    rows.forEach((row) => {
      const excelRow = worksheet.addRow([
        row.productCode,
        row.productName,
        row.stokAwal,
        row.barangMasuk,
        row.barangOutProduksi,
        row.stokAkhir,
        row.soFisik !== null && row.soFisik !== undefined ? row.soFisik : '',
        row.selisih !== null && row.selisih !== undefined ? row.selisih : '',
        row.keterangan || '',
      ]);

      excelRow.getCell(3).numFmt = '#,##0.00';
      excelRow.getCell(4).numFmt = '#,##0.00';
      excelRow.getCell(5).numFmt = '#,##0.00';
      excelRow.getCell(6).numFmt = '#,##0.00';
      excelRow.getCell(7).numFmt = '#,##0.00';
      excelRow.getCell(8).numFmt = '#,##0.00';

      // Conditional font color for Selisih (column 8)
      const selisihCell = excelRow.getCell(8);
      const selisihValue = row.selisih;
      if (selisihValue !== null && selisihValue !== undefined) {
        if (selisihValue < 0) {
          selisihCell.font = { color: { argb: 'FFFF0000' } }; // Red for negative
        } else if (selisihValue > 0) {
          selisihCell.font = { color: { argb: 'FF008000' } }; // Green for positive
        }
        // selisihValue === 0 uses default black color (no change)
      }
    });

    worksheet.columns = [
      { key: 'kode', width: 15 },
      { key: 'nama', width: 40 },
      { key: 'stckAw', width: 12 },
      { key: 'purchase', width: 15 },
      { key: 'outProd', width: 12 },
      { key: 'stckAkhir', width: 12 },
      { key: 'soFisik', width: 12 },
      { key: 'selisih', width: 12 },
      { key: 'keterangan', width: 30 },
    ];

    const freezeRow = metadata?.userName ? 6 : 5;
    worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: freezeRow }];

    const borderStyle: Partial<ExcelJS.Border> = {
      style: 'thin',
      color: { argb: 'FF000000' },
    };

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber >= freezeRow) {
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.border = {
            top: borderStyle,
            left: borderStyle,
            bottom: borderStyle,
            right: borderStyle,
          };
        });
      }
    });

    return await workbook.xlsx.writeBuffer();
  }

  /**
   * Format period text for display (consistent with Sales Reports)
   */
  private formatPeriodText(from?: Date, to?: Date): string {
    const formatDate = (date: Date) => {
      return new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(date);
    };

    if (from && to) {
      return `${formatDate(from)} - ${formatDate(to)}`;
    } else if (from) {
      return `Sejak ${formatDate(from)}`;
    } else if (to) {
      return `Sampai ${formatDate(to)}`;
    } else {
      return 'Semua Periode';
    }
  }
}
