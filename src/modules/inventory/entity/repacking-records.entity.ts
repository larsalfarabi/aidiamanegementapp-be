import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  DeleteDateColumn,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
} from 'typeorm';
import { ProductCodes } from '../../products/entity/product_codes.entity';
import { Users } from '../../users/entities/users.entity';
import { InventoryTransactions } from './inventory-transactions.entity';

/**
 * Repacking Status
 */
export enum RepackingStatus {
  PENDING = 'PENDING', // Waiting to be processed
  COMPLETED = 'COMPLETED', // Successfully completed
  CANCELLED = 'CANCELLED', // Cancelled/voided
}

/**
 * RepackingRecords Entity
 * Tracks product repacking/conversion with loss calculation
 *
 * Business Rules:
 * - Records conversions: e.g., 4x Bottle 250ML → 1x Bottle 1000ML
 * - Calculates conversion ratio and loss/waste
 * - Creates two inventory transactions:
 *   1. REPACK_OUT for source product (decrease barangOutRepack)
 *   2. REPACK_IN for target product (increase barangMasuk)
 * - Bidirectional link with inventory_transactions
 *
 * Example Scenario:
 * - Source: Bottle 250ML (4 units consumed)
 * - Target: Bottle 1000ML (1 unit created)
 * - Conversion Ratio: 4.0 (4 small = 1 large)
 * - Expected Target: 1.0 (4 ÷ 4.0)
 * - Actual Target: 0.95 (some spillage during transfer)
 * - Loss: 0.05 × 4 = 0.2 units in source product terms
 * - Loss Percentage: (0.2 / 4) × 100 = 5%
 */
@Entity({ name: 'repacking_records', synchronize: false })
@Index(['businessDate']) // For daily queries
@Index(['sourceProductCodeId']) // For source product tracking
@Index(['targetProductCodeId']) // For target product tracking
@Index(['status']) // For status filtering
export class RepackingRecords {
  @PrimaryGeneratedColumn('increment')
  id: number;

  // Repacking Info
  @Column({
    unique: true,
    length: 50,
    comment: 'Unique repacking number (e.g., REP-20250115-001)',
  })
  repackingNumber: string;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    comment: 'When repacking was performed',
  })
  repackingDate: Date;

  @Column({
    type: 'date',
    comment: 'Business date for daily inventory tracking',
  })
  businessDate: Date;

  // Source Product (what we're converting FROM)
  @Column({
    comment: 'Product being converted FROM (e.g., Bottle 250ML)',
  })
  sourceProductCodeId: number;

  @ManyToOne(() => ProductCodes, { eager: true })
  @JoinColumn({ name: 'sourceProductCodeId' })
  sourceProductCode: ProductCodes;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    comment: 'Quantity taken from source product',
  })
  sourceQuantity: number;

  // Target Product (what we're converting TO)
  @Column({
    comment: 'Product being converted TO (e.g., Bottle 1000ML)',
  })
  targetProductCodeId: number;

  @ManyToOne(() => ProductCodes, { eager: true })
  @JoinColumn({ name: 'targetProductCodeId' })
  targetProductCode: ProductCodes;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    comment: 'Quantity created of target product',
  })
  targetQuantity: number;

  // Conversion Calculation
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    comment: 'Conversion ratio (e.g., 4.0 means 4 small = 1 large)',
  })
  conversionRatio: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    comment: 'Expected target quantity (based on conversion ratio)',
  })
  expectedTargetQty: number;

  // Loss/Waste Tracking
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    comment: 'Loss/waste during conversion (in source units)',
  })
  lossQuantity: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
    comment: 'Loss percentage = (lossQuantity / sourceQuantity) * 100',
  })
  lossPercentage: number;

  // Status & Metadata
  @Column({
    type: 'enum',
    enum: RepackingStatus,
    default: RepackingStatus.COMPLETED,
  })
  status: RepackingStatus;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Reason for repacking (customer request, quality control, etc.)',
  })
  reason: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({
    length: 100,
    nullable: true,
    comment: 'Person who performed the repacking',
  })
  performedBy: string;

  // Links to Inventory Transactions (bidirectional)
  @Column({
    type: 'bigint',
    nullable: true,
    comment: 'Link to inventory_transactions (REPACK_OUT for source)',
  })
  sourceTransactionId: number;

  @OneToOne(() => InventoryTransactions, { nullable: true })
  @JoinColumn({ name: 'sourceTransactionId' })
  sourceTransaction: InventoryTransactions;

  @Column({
    type: 'bigint',
    nullable: true,
    comment: 'Link to inventory_transactions (REPACK_IN for target)',
  })
  targetTransactionId: number;

  @OneToOne(() => InventoryTransactions, { nullable: true })
  @JoinColumn({ name: 'targetTransactionId' })
  targetTransaction: InventoryTransactions;

  // Audit Fields
  @CreateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deletedAt: Date;

  @Column({ nullable: true })
  createdBy: number;

  @Column({ nullable: true })
  updatedBy: number;

  @ManyToOne(() => Users, { nullable: true })
  @JoinColumn({ name: 'createdBy' })
  creator: Users;

  @ManyToOne(() => Users, { nullable: true })
  @JoinColumn({ name: 'updatedBy' })
  updater: Users;

  /**
   * Virtual Property: Conversion Efficiency
   * Shows how efficient the conversion was (100% = no loss)
   */
  get conversionEfficiency(): number {
    return 100 - Number(this.lossPercentage);
  }

  /**
   * Virtual Property: Actual Conversion Ratio
   * Shows the actual conversion achieved (considering loss)
   */
  get actualConversionRatio(): number {
    const target = Number(this.targetQuantity);
    const source = Number(this.sourceQuantity);

    if (source === 0) {
      return 0;
    }

    return source / target;
  }

  /**
   * Virtual Property: Is Within Tolerance
   * Checks if loss is within acceptable tolerance (e.g., 5%)
   */
  isWithinTolerance(maxLossPercentage: number = 5): boolean {
    return Number(this.lossPercentage) <= maxLossPercentage;
  }
}
