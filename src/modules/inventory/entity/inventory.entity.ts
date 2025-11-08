import { BaseEntity } from '../../../common/entities/base.entity';
import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { ProductCodes } from '../../products/entity/product_codes.entity';

import { Users } from '../../users/entities/users.entity';
import { InventoryTransactions } from './inventory_transactions.entity';

/**
 * Inventory Entity
 * Stores the current stock balance for finished goods (juice products)
 * This is the SINGLE SOURCE OF TRUTH for stock levels
 *
 * Business Rules (Juice Factory):
 * - One record per product code (finished goods only)
 * - Stock increases from production (PRODUCTION_IN)
 * - Stock decreases from sales/orders (SALE)
 * - Factory and warehouse are in the same location
 * - Tracks finished products: Bottle 250ML, 1000ML, Jerigen 5L
 */
@Entity({ synchronize: false })
@Index(['productCodeId'], { unique: true }) // One record per product
export class Inventory extends BaseEntity {
  @Column()
  productCodeId: number;

  @ManyToOne(() => ProductCodes, { eager: true })
  @JoinColumn({ name: 'productCodeId' })
  productCode: ProductCodes;

  // Stock Quantities
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  quantityOnHand: number; // Current physical stock

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  quantityReserved: number; // Reserved for orders (not yet shipped)

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  quantityAvailable: number; // Available = OnHand - Reserved

  // Production Planning
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  minimumStock: number; // Minimum stock level before production

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  maximumStock: number; // Maximum stock capacity

  // Last Transaction Info
  @Column({ type: 'timestamp', nullable: true, default: null })
  lastTransactionDate: Date;

  @Column({ length: 50, nullable: true })
  lastTransactionType: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string;

  // Relations
  @OneToMany(
    () => InventoryTransactions,
    (transaction) => transaction.inventory,
  )
  transactions: InventoryTransactions[];

  // Audit fields
  @ManyToOne(() => Users)
  @JoinColumn({ name: 'createdBy' })
  createdBy: Users;

  @ManyToOne(() => Users)
  @JoinColumn({ name: 'updatedBy' })
  updatedBy: Users;

  get stockStatus(): 'OUT_OF_STOCK' | 'LOW_STOCK' | 'AVAILABLE' | 'OVERSTOCK' {
    const available = Number(this.quantityAvailable) || 0;
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
}
