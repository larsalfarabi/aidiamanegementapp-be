import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';
import { ProductCodes } from '../../products/entity/product_codes.entity';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * DailyInventorySnapshots Entity
 * Historical Daily Inventory Snapshots (1-year retention)
 *
 * Business Rules:
 * - Created automatically by cron job at 00:00 WIB
 * - Immutable (never updated or deleted until automatic cleanup)
 * - Retention: 1 year (365 days)
 * - Used for historical reporting and analysis
 * - stokAkhir is REGULAR column (not generated) - stored snapshot value
 * - Snapshots are taken BEFORE daily reset occurs
 *
 * Auto Cleanup:
 * - Cron job deletes snapshots older than 1 year
 * - Query: DELETE FROM daily_inventory_snapshots WHERE snapshotDate < CURDATE() - INTERVAL 1 YEAR
 */
@Entity({ name: 'daily_inventory_snapshots', synchronize: true })
@Index(['productCodeId', 'snapshotDate']) // For product history queries
@Index(['snapshotDate']) // For date range queries
export class DailyInventorySnapshots {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  // Snapshot Date & Time
  @Column({
    type: 'date',
    comment: 'Date of the snapshot (partition key for future optimization)',
  })
  snapshotDate: Date;

  @Column({
    type: 'time',
    nullable: true,
    comment: 'Time when snapshot was taken (typically 00:00:00)',
  })
  snapshotTime: string;

  // Product Reference
  @Column({ comment: 'Foreign key to product_codes table' })
  productCodeId: number;

  @ManyToOne(() => ProductCodes, { eager: true })
  @JoinColumn({ name: 'productCodeId' })
  productCode: ProductCodes;

  // Snapshot Values (Read-only after creation)
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    comment: 'Opening stock at snapshot time',
  })
  stokAwal: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    comment: 'Goods in during the day',
  })
  barangMasuk: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    comment: 'Orders with invoice date on snapshot date',
  })
  dipesan: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    comment: 'Goods out for repacking',
  })
  barangOutRepack: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    comment: 'Goods out as samples',
  })
  barangOutSample: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    default: 0,
    comment: 'Goods out for production (materials only)',
  })
  barangOutProduksi: number;

  /**
   * REGULAR COLUMN (not generated)
   * This is the calculated ending stock value at the time of snapshot
   * Stored as-is from daily_inventory.stokAkhir
   */
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    comment: 'Ending stock (snapshot value, not generated)',
  })
  stokAkhir: number;

  // Metadata
  @CreateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  createdAt: Date;

  /**
   * Virtual Property: Day-over-Day Change
   * Calculates the change in ending stock from opening stock
   */
  get stockChange(): number {
    return Number(this.stokAkhir) - Number(this.stokAwal);
  }

  /**
   * Virtual Property: Stock Change Percentage
   * Shows percentage change from opening to ending stock
   */
  get stockChangePercentage(): number | null {
    const stokAwal = Number(this.stokAwal);
    const stockChange = this.stockChange;

    if (stokAwal === 0) {
      return stockChange > 0 ? 100 : stockChange < 0 ? -100 : 0;
    }

    return (stockChange / stokAwal) * 100;
  }

  /**
   * Virtual Property: Total Activity
   * Shows total inventory movement (in + out)
   */
  get totalActivity(): number {
    return (
      Number(this.barangMasuk) +
      Number(this.dipesan) +
      Number(this.barangOutRepack) +
      Number(this.barangOutSample)
    );
  }

  /**
   * Virtual Property: Turnover Ratio
   * Shows how many times the stock turned over during the day
   * Higher values indicate more activity relative to stock level
   */
  get turnoverRatio(): number | null {
    const avgStock = (Number(this.stokAwal) + Number(this.stokAkhir)) / 2;
    const totalOut =
      Number(this.dipesan) +
      Number(this.barangOutRepack) +
      Number(this.barangOutSample);

    if (avgStock === 0) {
      return null;
    }

    return totalOut / avgStock;
  }
}
