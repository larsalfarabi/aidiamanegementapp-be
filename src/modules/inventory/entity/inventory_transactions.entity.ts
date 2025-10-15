import { BaseEntity } from '../../../common/entities/base.entity';
import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { ProductCodes } from '../../products/entity/product_codes.entity';
import { Inventory } from './inventory.entity';
import { Orders } from '../../orders/entity/orders.entity';
import { OrderItems } from '../../orders/entity/order_items.entity';
import { Users } from '../../users/entities/users.entity';

/**
 * Transaction Types for Juice Factory
 *
 * IN Transactions (Stock Increase):
 * - PRODUCTION_IN: Finished goods from production (juice bottles/jerrycan ready)
 * - SALE_RETURN: Customer returns (rare case, defective products returned)
 * - ADJUSTMENT_IN: Stock correction (stock opname found additional items)
 *
 * OUT Transactions (Stock Decrease):
 * - SALE: Sales to customers (order shipment)
 * - WASTE: Damaged/expired products disposal
 * - ADJUSTMENT_OUT: Stock correction (stock opname, lost/damaged items)
 */
export enum TransactionType {
  // IN Transactions
  PRODUCTION_IN = 'PRODUCTION_IN', // Hasil produksi masuk ke gudang
  SALE_RETURN = 'SALE_RETURN', // Customer return barang
  ADJUSTMENT_IN = 'ADJUSTMENT_IN', // Koreksi tambah (stock opname)

  // OUT Transactions
  SALE = 'SALE', // Penjualan ke customer
  WASTE = 'WASTE', // Barang rusak/kadaluarsa
  ADJUSTMENT_OUT = 'ADJUSTMENT_OUT', // Koreksi kurang (stock opname)
}

/**
 * InventoryTransactions Entity
 * Records every finished goods movement with full audit trail
 *
 * Business Rules (Juice Factory):
 * - Records finished goods only (Bottle 250ML, 1000ML, Jerigen 5L)
 * - Stock IN: Production results
 * - Stock OUT: Customer orders/sales
 * - Immutable once created (no updates/deletes)
 * - Running balance for verification
 * - Links to production batches and sales orders
 */
@Entity({ synchronize: false })
@Index(['productCodeId', 'transactionDate']) // For quick queries
@Index(['transactionType', 'transactionDate']) // For reports
@Index(['orderId']) // For order tracking
@Index(['productionBatchNumber']) // For production tracking
export class InventoryTransactions extends BaseEntity {
  // Transaction Info
  @Column({ unique: true, length: 50 })
  transactionNumber: string; // e.g., "TRX-20250105-001"

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  transactionDate: Date;

  @Column({ type: 'enum', enum: TransactionType })
  transactionType: TransactionType;

  // Product (Finished Goods Only)
  @Column()
  productCodeId: number;

  @Column()
  inventoryId: number;

  @ManyToOne(() => ProductCodes, { eager: true })
  @JoinColumn({ name: 'productCodeId' })
  productCode: ProductCodes;

  @ManyToOne(() => Inventory, (inventory) => inventory.transactions)
  @JoinColumn({ name: 'inventoryId' })
  inventory: Inventory;

  // Quantity & Cost
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantity: number; // Positive for IN, Negative for OUT

  // Balance After Transaction (for verification)
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  balanceAfter: number; // Stock balance after this transaction

  // Reference to Source Documents
  @Column({ nullable: true })
  orderId: number; // Link to Orders (for SALE transactions)

  @Column({ nullable: true })
  orderItemId: number; // Link to OrderItems (for SALE transactions)

  @ManyToOne(() => Orders, { nullable: true })
  @JoinColumn({ name: 'orderId' })
  order: Orders;

  @ManyToOne(() => OrderItems, { nullable: true })
  @JoinColumn({ name: 'orderItemId' })
  orderItem: OrderItems;

  @Column({ length: 100, nullable: true })
  productionBatchNumber: string; // Batch number for PRODUCTION_IN (e.g., "BATCH-20250105-001")

  @Column({ length: 100, nullable: true })
  referenceNumber: string; // Order Number, Waste Report Number, etc.

  @Column({
    type: 'enum',
    enum: ['PENDING', 'COMPLETED', 'CANCELLED'],
    default: 'COMPLETED',
  })
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';

  // Additional Info
  @Column({ type: 'text', nullable: true })
  reason: string; // Reason for waste, adjustment, return, etc.

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ length: 100, nullable: true })
  performedBy: string; // Person who physically handled the transaction (production staff, warehouse staff)

  // Audit fields
  @ManyToOne(() => Users)
  @JoinColumn({ name: 'createdBy' })
  createdBy: Users; // User who created the transaction in system
}
