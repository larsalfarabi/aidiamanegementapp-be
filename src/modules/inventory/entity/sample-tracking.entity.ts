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
import { Orders } from '../../orders/entity/orders.entity';
import { InventoryTransactions } from './inventory-transactions.entity';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * Sample Purpose Types
 */
export enum SamplePurpose {
  PROMOTION = 'PROMOTION', // Promotional giveaway
  DEMO = 'DEMO', // Product demonstration
  QUALITY_TEST = 'QUALITY_TEST', // Quality testing/analysis
  PARTNERSHIP = 'PARTNERSHIP', // Partnership/collaboration
  EVENT = 'EVENT', // Event/exhibition
  OTHER = 'OTHER', // Other purposes
}

/**
 * Sample Tracking Status
 */
export enum SampleStatus {
  PENDING = 'PENDING', // Pending distribution
  DISTRIBUTED = 'DISTRIBUTED', // Sample distributed
  RETURNED = 'RETURNED', // Sample returned
  CONVERTED = 'CONVERTED', // Converted to sale
  CLOSED = 'CLOSED', // Closed without conversion
}

/**
 * SampleTracking Entity
 * Tracks sample distribution and ROI (Optional Feature)
 *
 * Business Rules:
 * - Records sample distribution (promotion, demo, quality test)
 * - Links to inventory_transactions (SAMPLE_OUT when distributed)
 * - Tracks returns via SAMPLE_RETURN transaction
 * - Measures sales conversion (if sample leads to actual order)
 * - Follow-up scheduling for sales team
 * - Optional feature - can be used when needed
 *
 * Example Scenarios:
 * 1. Promotional Sample (No Return Expected):
 *    - Give 2 bottles to potential customer
 *    - Schedule follow-up after 1 week
 *    - Track if they place order (convertedToSale = true)
 *
 * 2. Demo Sample (Return Expected):
 *    - Lend 5 bottles for event demonstration
 *    - Track return after event
 *    - Calculate ROI if event generates sales
 *
 * 3. Quality Test Sample:
 *    - Send 1 bottle to lab for testing
 *    - Track return or disposal
 *    - Link to quality control report
 */
@Entity({ name: 'sample_tracking', synchronize: true })
@Index(['businessDate']) // For daily queries
@Index(['productCodeId']) // For product tracking
@Index(['status']) // For status filtering
@Index(['convertedToSale']) // For conversion tracking
@Index(['followUpDate']) // For follow-up reminders
export class SampleTracking extends BaseEntity {
  // Sample Info
  @Column({
    unique: true,
    length: 50,
    comment: 'Unique sample tracking number (e.g., SMP-20250115-001)',
  })
  sampleNumber: string;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    comment: 'When sample was given',
  })
  sampleDate: Date;

  @Column({
    type: 'date',
    comment: 'Business date for daily inventory tracking',
  })
  businessDate: Date;

  // Product & Quantity
  @Column({ comment: 'Product given as sample' })
  productCodeId: number;

  @ManyToOne(() => ProductCodes, { eager: true })
  @JoinColumn({ name: 'productCodeId' })
  productCode: ProductCodes;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    comment: 'Quantity of samples given',
  })
  quantity: number;

  // Recipient Information
  @Column({
    length: 200,
    comment: 'Name of person/company receiving sample',
  })
  recipientName: string;

  @Column({ length: 20, nullable: true })
  recipientPhone: string;

  @Column({ length: 100, nullable: true })
  recipientEmail: string;

  @Column({ type: 'text', nullable: true })
  recipientAddress: string;

  // Sample Purpose
  @Column({
    type: 'enum',
    enum: SamplePurpose,
    default: SamplePurpose.PROMOTION,
    comment: 'Purpose of sample distribution',
  })
  purpose: SamplePurpose;

  @Column({
    length: 200,
    nullable: true,
    comment: 'Event name if sample for event',
  })
  eventName: string;

  // Return Tracking (if applicable)
  @Column({
    default: false,
    comment: 'Whether sample is expected to be returned',
  })
  expectedReturn: boolean;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'When sample was returned (if applicable)',
  })
  returnDate: Date;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: 'Quantity returned',
  })
  returnQuantity: number;

  @Column({
    type: 'bigint',
    nullable: true,
    comment: 'Link to inventory_transactions (SAMPLE_RETURN)',
  })
  returnTransactionId: number;

  @OneToOne(() => InventoryTransactions, { nullable: true })
  @JoinColumn({ name: 'returnTransactionId' })
  returnTransaction: InventoryTransactions;

  // Sales Conversion Tracking
  @Column({
    type: 'date',
    nullable: true,
    comment: 'Scheduled follow-up date',
  })
  followUpDate: Date;

  @Column({
    default: false,
    comment: 'Whether sample resulted in actual sale',
  })
  convertedToSale: boolean;

  @Column({
    nullable: true,
    comment: 'Link to order if converted to sale',
  })
  orderId: number;

  @ManyToOne(() => Orders, { nullable: true })
  @JoinColumn({ name: 'orderId' })
  order: Orders;

  // Status & Metadata
  @Column({
    type: 'enum',
    enum: SampleStatus,
    default: SampleStatus.DISTRIBUTED,
  })
  status: SampleStatus;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({
    length: 100,
    nullable: true,
    comment: 'Sales person who distributed sample',
  })
  distributedBy: string;

  // Link to Inventory Transaction
  @Column({
    type: 'bigint',
    nullable: true,
    comment: 'Link to inventory_transactions (SAMPLE_OUT)',
  })
  outTransactionId: number;

  @OneToOne(() => InventoryTransactions, { nullable: true })
  @JoinColumn({ name: 'outTransactionId' })
  outTransaction: InventoryTransactions;

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

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deletedAt: Date;

  /**
   * Virtual Property: Is Overdue for Follow-up
   * Checks if follow-up date has passed and not yet converted
   */
  get isOverdueForFollowUp(): boolean {
    if (
      !this.followUpDate ||
      this.convertedToSale ||
      this.status === SampleStatus.CLOSED
    ) {
      return false;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const followUp = new Date(this.followUpDate);
    followUp.setHours(0, 0, 0, 0);

    return followUp < today;
  }

  /**
   * Virtual Property: Days Since Distribution
   * Shows how many days ago the sample was distributed
   */
  get daysSinceDistribution(): number {
    const today = new Date();
    const distributed = new Date(this.sampleDate);
    const diffTime = Math.abs(today.getTime() - distributed.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Virtual Property: Return Rate
   * Percentage of samples returned (if return was expected)
   */
  get returnRate(): number | null {
    if (!this.expectedReturn || !this.returnQuantity) {
      return null;
    }

    const quantity = Number(this.quantity);
    const returned = Number(this.returnQuantity);

    if (quantity === 0) {
      return null;
    }

    return (returned / quantity) * 100;
  }

  /**
   * Virtual Property: Unreturned Quantity
   * Shows how many samples have not been returned (if return was expected)
   */
  get unreturnedQuantity(): number | null {
    if (!this.expectedReturn) {
      return null;
    }

    const quantity = Number(this.quantity);
    const returned = Number(this.returnQuantity) || 0;

    return quantity - returned;
  }

  /**
   * Virtual Property: Sample ROI Indicator
   * Simple indicator of sample effectiveness
   * - CONVERTED: Sample led to sale (high ROI)
   * - PENDING_FOLLOWUP: Waiting for follow-up (potential ROI)
   * - NO_CONVERSION: No sale resulted (low ROI)
   * - RETURNED: Sample returned without conversion
   */
  get roiIndicator():
    | 'CONVERTED'
    | 'PENDING_FOLLOWUP'
    | 'NO_CONVERSION'
    | 'RETURNED' {
    if (this.convertedToSale) {
      return 'CONVERTED';
    }

    if (this.status === SampleStatus.RETURNED) {
      return 'RETURNED';
    }

    if (this.followUpDate && !this.isOverdueForFollowUp) {
      return 'PENDING_FOLLOWUP';
    }

    return 'NO_CONVERSION';
  }
}
