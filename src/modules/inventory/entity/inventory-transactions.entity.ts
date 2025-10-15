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
} from 'typeorm';
import { ProductCodes } from '../../products/entity/product_codes.entity';
import { Orders } from '../../orders/entity/orders.entity';
import { OrderItems } from '../../orders/entity/order_items.entity';
import { Users } from '../../users/entities/users.entity';
import { RepackingRecords } from './repacking-records.entity';

/**
 * Enhanced Transaction Types for Juice Factory (Daily Inventory System)
 *
 * IN Transactions (Stock Increase):
 * - PRODUCTION_IN: Finished goods from production (juice bottles/jerrycan ready)
 * - REPACK_IN: Product created from repacking (e.g., 4x 250ML → 1x 1000ML creates 1000ML)
 * - SAMPLE_RETURN: Sample returned (e.g., demo unit returned after event)
 * - ADJUSTMENT: Stock correction (can be positive or negative based on reason)
 *
 * OUT Transactions (Stock Decrease):
 * - SALE: Sales to customers (order with invoice date = today)
 * - REPACK_OUT: Product consumed for repacking (e.g., 4x 250ML → 1x 1000ML consumes 250ML)
 * - SAMPLE_OUT: Sample distribution (promotion, demo, quality test)
 * - WASTE: Damaged/expired products disposal
 * - SALE_RETURN: Customer returns (rare case, defective products returned - creates negative sale)
 */
export enum TransactionType {
  // IN Transactions (positive quantity)
  PRODUCTION_IN = 'PRODUCTION_IN', // Hasil produksi masuk ke gudang
  REPACK_IN = 'REPACK_IN', // Barang hasil repacking (target product)
  SAMPLE_RETURN = 'SAMPLE_RETURN', // Sample dikembalikan

  // OUT Transactions (negative quantity)
  SALE = 'SALE', // Penjualan ke customer (dari invoice date)
  REPACK_OUT = 'REPACK_OUT', // Barang untuk repacking (source product)
  SAMPLE_OUT = 'SAMPLE_OUT', // Sample untuk promosi/demo/test
  WASTE = 'WASTE', // Barang rusak/kadaluarsa

  // Special Transactions
  ADJUSTMENT = 'ADJUSTMENT', // Koreksi stok (bisa + atau -)
  SALE_RETURN = 'SALE_RETURN', // Customer return barang (negative sale)
}

/**
 * Transaction Status
 */
export enum TransactionStatus {
  PENDING = 'PENDING', // Waiting to be processed
  COMPLETED = 'COMPLETED', // Successfully completed
  CANCELLED = 'CANCELLED', // Cancelled/voided
}

/**
 * InventoryTransactions Entity (Enhanced for Daily Inventory)
 * Records every finished goods movement with full audit trail
 *
 * Business Rules:
 * - Immutable once created (soft delete only via deletedAt)
 * - Links to daily_inventory via productCodeId + businessDate
 * - Transactions update corresponding daily column:
 *   * PRODUCTION_IN, REPACK_IN, SAMPLE_RETURN → barangMasuk++
 *   * SALE → dipesan++ (only if invoiceDate = today)
 *   * REPACK_OUT → barangOutRepack++
 *   * SAMPLE_OUT → barangOutSample++
 *   * ADJUSTMENT → stokAwal adjustment (not daily column)
 * - balanceAfter = stokAkhir after this transaction applied
 */
@Entity({ name: 'inventory_transactions', synchronize: false })
@Index(['productCodeId', 'businessDate']) // For daily inventory updates
@Index(['transactionType', 'businessDate']) // For transaction reports
@Index(['orderId']) // For order tracking
@Index(['repackingId']) // For repacking tracking
@Index(['productionBatchNumber']) // For production tracking
@Index(['businessDate']) // For date range queries
export class InventoryTransactions {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  // Transaction Info
  @Column({
    unique: true,
    length: 50,
    comment: 'Unique transaction number (e.g., TRX-20250115-001)',
  })
  transactionNumber: string;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    comment: 'When the transaction occurred',
  })
  transactionDate: Date;

  @Column({
    type: 'date',
    comment: 'Business date for daily inventory tracking',
  })
  businessDate: Date;

  @Column({
    type: 'enum',
    enum: TransactionType,
    comment: 'Type of inventory transaction',
  })
  transactionType: TransactionType;

  // Product Reference
  @Column({ comment: 'Foreign key to product_codes table' })
  productCodeId: number;

  @ManyToOne(() => ProductCodes, { eager: true })
  @JoinColumn({ name: 'productCodeId' })
  productCode: ProductCodes;

  // Quantity & Balance
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    comment: 'Quantity (positive for IN, negative for OUT)',
  })
  quantity: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    comment: 'Stock balance after transaction (for verification)',
  })
  balanceAfter: number;

  // Reference to Source Documents
  @Column({
    nullable: true,
    comment: 'Link to orders table (for SALE transactions)',
  })
  orderId: number;

  @Column({
    nullable: true,
    comment: 'Link to order_items table (for SALE transactions)',
  })
  orderItemId: number;

  @ManyToOne(() => Orders, { nullable: true })
  @JoinColumn({ name: 'orderId' })
  order: Orders;

  @ManyToOne(() => OrderItems, { nullable: true })
  @JoinColumn({ name: 'orderItemId' })
  orderItem: OrderItems;

  @Column({
    nullable: true,
    comment: 'Link to repacking_records table (for REPACK transactions)',
  })
  repackingId: number;

  @ManyToOne(() => RepackingRecords, { nullable: true })
  @JoinColumn({ name: 'repackingId' })
  repacking: RepackingRecords;

  @Column({
    length: 100,
    nullable: true,
    comment: 'Production batch number (for PRODUCTION_IN)',
  })
  productionBatchNumber: string;

  @Column({
    length: 100,
    nullable: true,
    comment: 'External reference (invoice number, waste report, etc.)',
  })
  referenceNumber: string;

  // Status & Metadata
  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.COMPLETED,
  })
  status: TransactionStatus;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Reason for transaction (waste, adjustment, sample purpose)',
  })
  reason: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({
    length: 100,
    nullable: true,
    comment: 'Person who performed the transaction',
  })
  performedBy: string;

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
   * Virtual Property: Is Stock In
   * Determines if this transaction increases stock
   */
  get isStockIn(): boolean {
    return (
      [
        TransactionType.PRODUCTION_IN,
        TransactionType.REPACK_IN,
        TransactionType.SAMPLE_RETURN,
      ].includes(this.transactionType) ||
      (this.transactionType === TransactionType.ADJUSTMENT &&
        Number(this.quantity) > 0)
    );
  }

  /**
   * Virtual Property: Is Stock Out
   * Determines if this transaction decreases stock
   */
  get isStockOut(): boolean {
    return (
      [
        TransactionType.SALE,
        TransactionType.REPACK_OUT,
        TransactionType.SAMPLE_OUT,
        TransactionType.WASTE,
        TransactionType.SALE_RETURN,
      ].includes(this.transactionType) ||
      (this.transactionType === TransactionType.ADJUSTMENT &&
        Number(this.quantity) < 0)
    );
  }

  /**
   * Virtual Property: Absolute Quantity
   * Returns the absolute value of quantity
   */
  get absoluteQuantity(): number {
    return Math.abs(Number(this.quantity));
  }
}
