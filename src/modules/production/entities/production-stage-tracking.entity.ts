import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { ProductionBatches } from './production-batches.entity';
import { Users } from '../../users/entities/users.entity';

/**
 * Production Stage Enum
 * Simplified 3-stage process based on user requirements
 */
export enum ProductionStage {
  PRODUCTION = 'PRODUCTION', // Stage 1: Bahan Baku → Concentrate (500L)
  BOTTLING = 'BOTTLING', // Stage 2: Concentrate → Bottles
  QC = 'QC', // Stage 3: Quality Control → Pass/Fail
}

/**
 * Stage Status
 */
export enum StageStatus {
  PENDING = 'PENDING', // Not started yet
  IN_PROGRESS = 'IN_PROGRESS', // Currently in progress
  COMPLETED = 'COMPLETED', // Stage completed
  FAILED = 'FAILED', // Stage failed (e.g., QC rejected)
}

/**
 * ProductionStageTracking Entity
 * Tracks each stage of production process
 *
 * Business Rules:
 * - 3 stages: PRODUCTION → BOTTLING → QC
 * - Sequential execution (must complete stage 1 before stage 2)
 * - Tracks output and waste per stage
 * - Records timing for each stage
 *
 * Example Flow for Batch BATCH-20250111-001:
 *
 * Stage 1 - PRODUCTION:
 * - Input: 100kg Jambu + 50kg Gula
 * - Output: 500 Liter Concentrate
 * - Waste: 20kg (kulit, biji)
 *
 * Stage 2 - BOTTLING:
 * - Input: 500 Liter Concentrate
 * - Output: 1900 Bottles (250ml each = 475L)
 * - Waste: 25 Liter (spillage, sisa)
 *
 * Stage 3 - QC:
 * - Input: 1900 Bottles
 * - Pass: 1850 Bottles
 * - Fail: 50 Bottles (kualitas tidak sesuai)
 */
@Entity({ name: 'production_stage_tracking', synchronize: true })
@Index(['batchId'])
@Index(['stage'])
@Index(['status'])
export class ProductionStageTracking extends BaseEntity {
  // Batch Reference
  @Column({
    comment: 'Production batch being tracked',
  })
  batchId: number;

  @ManyToOne(() => ProductionBatches, (batch) => batch.stages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'batchId' })
  batch: ProductionBatches;

  // Stage Info
  @Column({
    type: 'enum',
    enum: ProductionStage,
    comment: 'Production stage (PRODUCTION, BOTTLING, QC)',
  })
  stage: ProductionStage;

  @Column({
    type: 'int',
    comment: 'Stage sequence (1, 2, 3)',
  })
  stageSequence: number;

  @Column({
    type: 'enum',
    enum: StageStatus,
    default: StageStatus.PENDING,
    comment: 'Current status of this stage',
  })
  status: StageStatus;

  // Timing
  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'When stage started',
  })
  startTime: Date;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'When stage completed',
  })
  endTime: Date;

  // Output Tracking
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    comment: 'Output quantity from this stage',
  })
  outputQuantity: number;

  @Column({
    length: 20,
    nullable: true,
    comment: 'Output unit (LITERS for PRODUCTION, BOTTLES for BOTTLING)',
  })
  outputUnit: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    comment: 'Waste quantity at this stage',
  })
  wasteQuantity: number;

  @Column({
    length: 20,
    nullable: true,
    comment: 'Waste unit',
  })
  wasteUnit: string;

  // QC Specific Fields (for QC stage only)
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: 'Quantity that passed QC (QC stage only)',
  })
  qcPassedQty: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: 'Quantity that failed QC (QC stage only)',
  })
  qcFailedQty: number;

  // Personnel
  @Column({
    type: 'varchar',
    length: 200,
    nullable: true,
    comment: 'Staff/person who performed this stage',
  })
  performedBy: string | null;

  // Notes
  @Column({
    type: 'text',
    nullable: true,
    comment: 'Notes about this stage execution',
  })
  notes: string | null;

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
   * Virtual Property: Stage Duration in Minutes
   */
  get durationMinutes(): number | null {
    if (!this.startTime || !this.endTime) {
      return null;
    }
    const start = new Date(this.startTime).getTime();
    const end = new Date(this.endTime).getTime();
    return Math.round((end - start) / 1000 / 60);
  }

  /**
   * Virtual Property: Waste Percentage
   */
  get wastePercentage(): number {
    const total = Number(this.outputQuantity) + Number(this.wasteQuantity);
    if (total === 0) {
      return 0;
    }
    return (Number(this.wasteQuantity) / total) * 100;
  }

  /**
   * Virtual Property: QC Pass Rate (for QC stage)
   */
  get qcPassRate(): number | null {
    if (this.stage !== ProductionStage.QC) {
      return null;
    }
    const total = Number(this.qcPassedQty || 0) + Number(this.qcFailedQty || 0);
    if (total === 0) {
      return null;
    }
    return (Number(this.qcPassedQty || 0) / total) * 100;
  }
}
