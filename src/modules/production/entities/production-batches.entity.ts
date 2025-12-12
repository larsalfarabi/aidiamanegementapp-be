import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { ProductionFormulas } from './production-formulas.entity';
import { ProductCodes } from '../../products/entity/product_codes.entity';
import { Products } from '../../products/entity/products.entity';
import { Users } from '../../users/entities/users.entity';
import { ProductionMaterialUsage } from './production-material-usage.entity';
import { ProductionStageTracking } from './production-stage-tracking.entity';
import { InventoryTransactions } from '../../inventory/entity/inventory-transactions.entity';

/**
 * Production Batch Status
 */
export enum BatchStatus {
  PLANNED = 'PLANNED', // Batch planned, not started
  IN_PROGRESS = 'IN_PROGRESS', // Production in progress
  QC_PENDING = 'QC_PENDING', // Waiting for QC approval
  COMPLETED = 'COMPLETED', // Production completed, passed QC
  CANCELLED = 'CANCELLED', // Production cancelled
  REJECTED = 'REJECTED', // Failed QC, rejected
}

/**
 * QC Status
 */
export enum QCStatus {
  PENDING = 'PENDING', // Waiting for QC
  PASS = 'PASS', // QC approved
  FAIL = 'FAIL', // QC rejected
  PARTIAL = 'PARTIAL', // Some items passed, some failed
}

/**
 * ProductionBatches Entity
 * Records actual production batch execution
 *
 * CRITICAL CHANGE (Dec 2024): Batch now product-based with multi-size support
 *
 * OLD SYSTEM:
 * - Batch produces one specific product size (productCodeId)
 * - Simple: plannedQuantity, actualQuantity for single SKU
 *
 * NEW SYSTEM:
 * - Batch produces concentrate for a product concept (productId)
 * - Bottling stage distributes to multiple sizes (ProductionBottlingOutput)
 * - productCodeId nullable (set later during bottling, or kept for single-size batches)
 *
 * Business Rules:
 * - One batch = one production run based on a formula
 * - Tracks planned vs actual concentrate volume (liters)
 * - Multi-size batches: bottling outputs tracked separately
 * - Single-size batches: productCodeId set, no bottling outputs
 * - Links to material usage and stage tracking
 * - QC checkpoint before inventory update
 * - Cost calculation after completion
 *
 * Flow (Multi-size batch):
 * 1. PLANNED → Create batch with formula (productId)
 * 2. IN_PROGRESS → Record material usage & stages
 * 3. QC_PENDING → Concentrate done, waiting QC
 * 4. COMPLETED → QC pass → Bottling stage (create ProductionBottlingOutput records)
 * 5. Each bottling output → Create PRODUCTION_IN transaction
 *
 * Flow (Single-size batch - backward compatible):
 * 1. PLANNED → Create batch with productCodeId
 * 2-5. Same as old system
 */
@Entity({ name: 'production_batches', synchronize: false })
@Index(['batchNumber'], { unique: true })
@Index(['productionDate'])
@Index(['status'])
@Index(['formulaId'])
@Index(['productId'])
@Index(['productCodeId'])
export class ProductionBatches extends BaseEntity {
  // Batch Identification
  @Column({
    unique: true,
    length: 50,
    comment: 'Unique batch number (e.g., BATCH-20250111-001)',
  })
  batchNumber: string;

  @Column({
    type: 'date',
    comment: 'Production date (business date)',
  })
  productionDate: Date;

  // Formula & Product
  @Column({
    comment: 'Formula used for this batch',
  })
  formulaId: number;

  @ManyToOne(() => ProductionFormulas, (formula) => formula.batches, {
    eager: true,
  })
  @JoinColumn({ name: 'formulaId' })
  formula: ProductionFormulas;

  // NEW: Product concept reference
  @Column({
    comment: 'Product concept produced (e.g., MANGO JUICE - PREMIUM - RTD)',
  })
  productId: number;

  @ManyToOne(() => Products, { eager: true })
  @JoinColumn({ name: 'productId' })
  product: Products;

  // NULLABLE: Specific product size (for single-size batches or legacy)
  @Column({
    nullable: true,
    comment: 'OPTIONAL: Specific product size (null for multi-size batches)',
  })
  productCodeId: number | null;

  @ManyToOne(() => ProductCodes, { eager: false })
  @JoinColumn({ name: 'productCodeId' })
  productCode: ProductCodes | null;

  // Production Planning
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    comment:
      'Planned quantity (concentrate volume for multi-size, bottles for single-size)',
  })
  plannedQuantity: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: 'Planned concentrate output in liters',
  })
  plannedConcentrate: number | null;

  // Production Results
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    comment: 'Actual concentrate produced (in liters)',
  })
  actualConcentrate: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    comment: 'Actual quantity produced (after bottling)',
  })
  actualQuantity: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    comment: 'Quantity that passed QC',
  })
  qcPassedQuantity: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    comment: 'Quantity that failed QC',
  })
  qcFailedQuantity: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    comment: 'Total waste quantity (planned - actual)',
  })
  wasteQuantity: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
    comment: 'Waste percentage = (wasteQuantity / plannedQuantity) * 100',
  })
  wastePercentage: number;

  // QC Information
  @Column({
    type: 'enum',
    enum: QCStatus,
    default: QCStatus.PENDING,
    comment: 'Quality Control status',
  })
  qcStatus: QCStatus;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'When QC was performed',
  })
  qcDate: Date;

  @Column({
    nullable: true,
    comment: 'User who performed QC',
  })
  qcPerformedBy: number;

  @ManyToOne(() => Users, { nullable: true })
  @JoinColumn({ name: 'qcPerformedBy' })
  qcPerformer: Users;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'QC notes/feedback',
  })
  qcNotes: string | null;

  // Costing (Material Cost Only)
  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    comment: 'Total material cost for this batch',
  })
  totalMaterialCost: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    comment: 'Cost per unit (totalMaterialCost / qcPassedQuantity)',
  })
  costPerUnit: number;

  // Status & Timing
  @Column({
    type: 'enum',
    enum: BatchStatus,
    default: BatchStatus.PLANNED,
    comment: 'Current batch status',
  })
  status: BatchStatus;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'When production started',
  })
  startedAt: Date;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'When production completed',
  })
  completedAt: Date;

  // Additional Info
  @Column({
    type: 'text',
    nullable: true,
    comment: 'Production notes',
  })
  notes: string | null;

  @Column({
    type: 'varchar',
    length: 200,
    nullable: true,
    comment: 'Person who performed the production (staff name)',
  })
  performedBy: string | null;

  // Link to Inventory Transaction
  @Column({
    type: 'bigint',
    nullable: true,
    comment: 'Link to inventory_transactions (PRODUCTION_IN)',
  })
  inventoryTransactionId: number;

  @ManyToOne(() => InventoryTransactions, { nullable: true })
  @JoinColumn({ name: 'inventoryTransactionId' })
  inventoryTransaction: InventoryTransactions;

  // Relations
  @OneToMany(() => ProductionMaterialUsage, (usage) => usage.batch, {
    cascade: true,
  })
  materialUsages: ProductionMaterialUsage[];

  @OneToMany(() => ProductionStageTracking, (stage) => stage.batch, {
    cascade: true,
  })
  stages: ProductionStageTracking[];
  // Audit
  @Column({ nullable: true })
  createdBy: number;

  @ManyToOne(() => Users, { nullable: true })
  @JoinColumn({ name: 'createdBy' })
  creator: Users;

  @Column({ nullable: true })
  updatedBy: number;

  @ManyToOne(() => Users, { nullable: true })
  @JoinColumn({ name: 'updatedBy' })
  updater: Users;

  /**
   * Calculate Yield Percentage
   */
  calculateYield(): number {
    if (Number(this.plannedQuantity) === 0) {
      return 0;
    }
    return (Number(this.actualQuantity) / Number(this.plannedQuantity)) * 100;
  }

  /**
   * Calculate Waste Percentage
   */
  calculateWaste(): number {
    if (Number(this.plannedQuantity) === 0) {
      return 0;
    }
    const waste = Number(this.plannedQuantity) - Number(this.actualQuantity);
    return (waste / Number(this.plannedQuantity)) * 100;
  }

  /**
   * Calculate Cost Per Unit
   */
  calculateCostPerUnit(): number {
    if (Number(this.qcPassedQuantity) === 0) {
      return 0;
    }
    return Number(this.totalMaterialCost) / Number(this.qcPassedQuantity);
  }

  /**
   * Virtual Property: Production Duration
   */
  get productionDuration(): number | null {
    if (!this.startedAt || !this.completedAt) {
      return null;
    }
    const start = new Date(this.startedAt).getTime();
    const end = new Date(this.completedAt).getTime();
    return Math.round((end - start) / 1000 / 60); // Minutes
  }
}
