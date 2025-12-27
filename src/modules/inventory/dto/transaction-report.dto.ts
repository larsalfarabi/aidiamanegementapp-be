import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsInt,
  IsNumber,
  Min,
  IsArray,
  ValidateNested,
} from 'class-validator';

/**
 * DTO for Transaction Report Filters
 * Used by both Finished Goods and Materials reports
 */
export class TransactionReportFiltersDto {
  @IsOptional()
  @IsDateString()
  startDate?: string; // YYYY-MM-DD

  @IsOptional()
  @IsDateString()
  endDate?: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  mainCategory?: string; // "Barang Jadi" | "Barang Baku" | "Barang Pembantu" | "Barang Kemasan"

  @IsOptional()
  @IsInt()
  productCodeId?: number; // Filter by specific product

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  pageSize?: number = 50;
}

/**
 * Response interface for Transaction Report
 * Includes all columns matching Excel template
 */
export interface TransactionReportRow {
  // Product Info
  productCodeId: number; // Required for Stock Opname inline editing
  productCode: string;
  productName: string;

  // Stock Columns (matching Excel)
  stokAwal: number; // STCK AW
  barangMasuk: number; // In Prod (for finished goods) or Purchase (for materials)
  dipesan: number; // Out Sales (finished goods only)
  barangOutRepack: number; // Out Repack (finished goods only, Excel shows "Out Prod")
  barangOutSample: number; // Sample
  barangOutProduksi: number; // Out Prod (materials only - for production consumption)
  stokAkhir: number; // STCK AKHIR (calculated)

  // Stock Opname (manual entry columns - empty for export)
  soFisik: number | null; // SO H/I - Stock Opname Fisik (manual entry)
  selisih: number | null; // Selisih = SO Fisik - STCK AKHIR (calculated after manual entry)

  // Metadata
  keterangan: string; // KETERANGAN - notes/remarks
}

/**
 * DTO for Quick Adjustment from Report
 * Allows inline stock adjustment directly from report view
 */
export class QuickAdjustmentDto {
  @IsInt()
  productCodeId: number;

  @IsDateString()
  businessDate: string;

  @IsInt()
  adjustmentQuantity: number; // Can be positive or negative

  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * Stock Opname Single Entry DTO
 * For batch save operations
 */
export class StockOpnameEntryDto {
  @IsInt()
  productCodeId: number;

  @IsNumber()
  stokAkhir: number; // From system

  @IsOptional()
  @IsNumber()
  soFisik?: number; // Manual entry

  @IsOptional()
  @IsString()
  keterangan?: string;
}

/**
 * Batch Stock Opname Save DTO
 * Improved Workflow B: Input SO FISIK di system, batch save
 */
export class BatchStockOpnameSaveDto {
  @IsDateString()
  sessionDate: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  mainCategory?: string; // "Barang Jadi" | Materials

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockOpnameEntryDto)
  entries: StockOpnameEntryDto[];
}

/**
 * Stock Opname Session Filters
 */
export class StockOpnameFiltersDto {
  @IsOptional()
  @IsDateString()
  sessionDate?: string;

  @IsOptional()
  @IsString()
  mainCategory?: string;

  @IsOptional()
  @IsString()
  status?: 'DRAFT' | 'COMPLETED';
}

/**
 * Excel Export Options
 */
export class ExcelExportOptionsDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  mainCategory?: string;

  @IsOptional()
  @IsString()
  reportType?: 'finished-goods' | 'materials'; // Determines column structure
}
