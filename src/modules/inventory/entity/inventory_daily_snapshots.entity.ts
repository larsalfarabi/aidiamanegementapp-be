import { BaseEntity } from '../../../common/entities/base.entity';
import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { ProductCodes } from '../../products/entity/product_codes.entity';
import { Inventory } from './inventory.entity';

/**
 * InventoryDailySnapshots Entity
 * Stores daily inventory snapshots for historical reporting
 *
 * Business Context:
 * - One snapshot per product per day
 * - Captures end-of-day (midnight) stock positions
 * - Used for historical reports and trend analysis
 * - Auto-generated via scheduled job at 00:00 WIB
 *
 * Snapshot Calculation:
 * - openingStock: Stock at start of day (previous day's closing)
 * - incomingStock: SUM(PRODUCTION_IN + SALE_RETURN + ADJUSTMENT_IN) for the day
 * - orderedStock: SUM(order quantities) with status CONFIRMED/SHIPPED for the day
 * - availableStock: openingStock + incomingStock - orderedStock
 * - closingStock: Final stock at end of day (becomes next day's opening)
 */
@Entity({ synchronize: false })
@Index(['productCodeId', 'snapshotDate'], { unique: true }) // One snapshot per product per day
@Index(['snapshotDate']) // For date range queries
export class InventoryDailySnapshots extends BaseEntity {
  @Column({ type: 'date' })
  snapshotDate: Date; // The date this snapshot represents (e.g., '2025-10-13')

  @Column()
  productCodeId: number;

  @Column()
  inventoryId: number;

  @ManyToOne(() => ProductCodes, { eager: true })
  @JoinColumn({ name: 'productCodeId' })
  productCode: ProductCodes;

  @ManyToOne(() => Inventory)
  @JoinColumn({ name: 'inventoryId' })
  inventory: Inventory;

  // Stock Positions
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  openingStock: number; // Stock at start of day (00:00)

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  incomingStock: number; // Total IN transactions (PRODUCTION_IN + SALE_RETURN + ADJUSTMENT_IN)

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  outgoingStock: number; // Total OUT transactions (SALE + WASTE + ADJUSTMENT_OUT)

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  orderedStock: number; // Orders created/confirmed on this day (CONFIRMED + SHIPPED status)

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  availableStock: number; // Calculated: openingStock + incomingStock - orderedStock

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  closingStock: number; // Stock at end of day (23:59) - becomes next day's opening

  // Transaction Counts (for analytics)
  @Column({ type: 'int', default: 0 })
  productionCount: number; // Number of PRODUCTION_IN transactions

  @Column({ type: 'int', default: 0 })
  saleCount: number; // Number of SALE transactions

  @Column({ type: 'int', default: 0 })
  wasteCount: number; // Number of WASTE transactions

  @Column({ type: 'int', default: 0 })
  adjustmentCount: number; // Number of ADJUSTMENT transactions (IN + OUT)

  @Column({ type: 'int', default: 0 })
  orderCount: number; // Number of orders created/confirmed

  // Stock Status at Snapshot Time
  @Column({
    type: 'enum',
    enum: ['OUT_OF_STOCK', 'LOW_STOCK', 'AVAILABLE', 'OVERSTOCK'],
    default: 'AVAILABLE',
  })
  stockStatus: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'AVAILABLE' | 'OVERSTOCK';

  @Column({ type: 'text', nullable: true })
  notes: string; // Any special notes for the day (e.g., "Stock opname conducted")

  // Snapshot metadata
  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  snapshotCreatedAt: Date; // When this snapshot was created (should be ~00:00 next day)

  @Column({ type: 'boolean', default: false })
  isManualSnapshot: boolean; // True if manually triggered (vs auto-generated)
}
