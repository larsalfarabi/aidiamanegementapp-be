import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  DeleteDateColumn,
} from 'typeorm';
import { ProductCodes } from '../../products/entity/product_codes.entity';
import { Users } from '../../users/entities/users.entity';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * DailyInventory Entity
 * NEW Daily Inventory System with Daily Reset at 00:00 WIB
 *
 * Business Rules (Juice Factory):
 * - One record per product per business date
 * - Daily columns reset at 00:00 WIB (via cron job)
 * - stokAkhir is GENERATED COLUMN (auto-calculated by database)
 * - stokAwal carries forward from previous day's stokAkhir
 * - dipesan column updated when invoice date is set (from orders)
 * - barangMasuk updated when production/repack-in/sample-return occurs
 * - barangOutRepack updated when repacking (e.g., 4x 250ML → 1x 1000ML)
 * - barangOutSample updated when samples are distributed
 *
 * Formula (GENERATED COLUMN):
 * stokAkhir = stokAwal + barangMasuk - dipesan - barangOutRepack - barangOutSample - barangOutProduksi
 */
@Entity({ name: 'daily_inventory', synchronize: true })
@Index(['productCodeId', 'businessDate'], { unique: true }) // One record per product per day
@Index(['businessDate']) // For daily queries
@Index(['isActive']) // For active records only
export class DailyInventory extends BaseEntity {
  // Business Date (partition key)
  @Column({ type: 'date', comment: 'Business date (partition by date)' })
  businessDate: Date;

  // Product Reference
  @Column({ comment: 'Foreign key to product_codes table' })
  productCodeId: number;

  @ManyToOne(() => ProductCodes, { eager: true })
  @JoinColumn({ name: 'productCodeId' })
  productCode: ProductCodes;

  // Daily Stock Columns (Reset at 00:00 WIB)
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    comment: 'Opening stock (carried forward from previous day)',
  })
  stokAwal: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    comment: 'Goods in (production, repack-in, sample-return)',
  })
  barangMasuk: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    comment: 'Orders with invoice date = today (auto from orders)',
  })
  dipesan: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    comment: 'Goods out for repacking (e.g., 4x 250ML to make 1x 1000ML)',
  })
  barangOutRepack: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    comment: 'Goods out as samples (promotion, demo, quality test)',
  })
  barangOutSample: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    comment: 'Goods out for production (material consumption)',
  })
  barangOutProduksi: number;

  /**
   * GENERATED COLUMN - Auto-calculated by database
   * Formula: stokAkhir = stokAwal + barangMasuk - dipesan - barangOutRepack - barangOutSample - barangOutProduksi
   *
   * NOTE: This column is NOT managed by TypeORM!
   * The database automatically calculates this value using GENERATED ALWAYS AS.
   * DO NOT set this value in application code - it will be ignored.
   */
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    generatedType: 'STORED',
    asExpression:
      '(stokAwal + barangMasuk - dipesan - barangOutRepack - barangOutSample - barangOutProduksi)',
    comment:
      'Ending stock (GENERATED COLUMN - includes production material out)',
    insert: false, // Prevent insertion
    update: false, // Prevent updates
    select: true, // Include in SELECT queries
  })
  stokAkhir: number;

  // Stock Thresholds (Planning)
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: 'Minimum stock level for production planning',
  })
  minimumStock: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: 'Maximum stock capacity',
  })
  maximumStock: number;

  // Status & Notes
  @Column({ default: true, comment: 'Active record indicator' })
  isActive: boolean;

  @Column({ type: 'text', nullable: true, comment: 'Additional notes' })
  notes: string;

  // User Tracking
  @Column({ nullable: true, comment: 'User ID who created this record' })
  createdBy: number;

  @ManyToOne(() => Users, { nullable: true })
  @JoinColumn({ name: 'createdBy' })
  creator: Users;

  @Column({ nullable: true, comment: 'User ID who last updated this record' })
  updatedBy: number;

  @ManyToOne(() => Users, { nullable: true })
  @JoinColumn({ name: 'updatedBy' })
  updater: Users;

  @DeleteDateColumn({
    type: 'timestamp',
    nullable: true,
    comment: 'Soft delete timestamp',
  })
  deletedAt: Date;

  /**
   * Virtual Property: Stock Status
   * Calculates stock level status based on thresholds
   */
  get stockStatus(): 'OUT_OF_STOCK' | 'LOW_STOCK' | 'AVAILABLE' | 'OVERSTOCK' {
    const available = Number(this.stokAkhir) || 0;
    const minimum = Number(this.minimumStock) || 0;
    const maximum = Number(this.maximumStock) || 0;

    if (available <= 0) {
      return 'OUT_OF_STOCK';
    }

    if (minimum > 0 && available <= minimum) {
      return 'LOW_STOCK';
    }

    if (maximum > 0 && available >= maximum) {
      return 'OVERSTOCK';
    }

    return 'AVAILABLE';
  }

  /**
   * Virtual Property: Stock Utilization Percentage
   * Shows how much of maximum capacity is being used
   */
  get stockUtilization(): number | null {
    const maximum = Number(this.maximumStock) || 0;
    const available = Number(this.stokAkhir) || 0;

    if (maximum <= 0) {
      return null;
    }

    return (available / maximum) * 100;
  }

  /**
   * Virtual Property: Days Until Reorder
   * Estimates days until minimum stock level based on average daily usage
   * Requires historical data to calculate avgDailyUsage
   */
  getDaysUntilReorder(avgDailyUsage: number): number | null {
    const available = Number(this.stokAkhir) || 0;
    const minimum = Number(this.minimumStock) || 0;

    if (minimum <= 0 || avgDailyUsage <= 0 || available <= minimum) {
      return null;
    }

    return Math.floor((available - minimum) / avgDailyUsage);
  }
}
