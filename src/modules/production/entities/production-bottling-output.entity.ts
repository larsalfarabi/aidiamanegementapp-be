import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { ProductionBatches } from './production-batches.entity';
import { ProductCodes } from '../../products/entity/product_codes.entity';
import { Users } from '../../users/entities/users.entity';

/**
 * ProductionBottlingOutput Entity
 * Records bottling output per product size from a production batch
 *
 * Purpose:
 * - Support multi-size bottling from single concentrate batch
 * - Track quantity and waste per product size (SKU)
 * - Enable flexible product distribution (one batch → many sizes)
 *
 * Business Context:
 * - One batch produces concentrate for a product concept
 * - Bottling stage distributes concentrate to multiple bottle sizes
 * - Example: 40L concentrate → 60 botol 600ml + 40 botol 1L
 * - Each size has separate inventory transaction (PRODUCTION_IN)
 *
 * Business Rules:
 * - Each output must match parent batch's product concept
 *   - Same product name (e.g., "Jambu Merah")
 *   - Same category (e.g., "Finished Goods")
 *   - Same product type (e.g., "SYRUP")
 * - quantity = good output (added to inventory)
 * - wasteQuantity = defective/damaged bottles (not added to inventory)
 * - Multiple outputs per batch allowed (different sizes)
 * - One inventory transaction per output
 *
 * Example:
 * Batch: BATCH-20250116-001 (Jambu Merah concentrate, 40L)
 * Outputs:
 * 1. 60 bottles @ 600ml (code: JM-600) → PRODUCTION_IN +60
 * 2. 40 bottles @ 1L (code: JM-1000) → PRODUCTION_IN +40
 * 3. Waste: 5 bottles @ 600ml → Not added to inventory
 *
 * Date: December 16, 2024
 */
@Entity({ name: 'production_bottling_outputs', synchronize: false })
@Index(['batchId'])
@Index(['productCodeId'])
export class ProductionBottlingOutput extends BaseEntity {
  // Batch Reference
  @Column({
    comment: 'FK to production_batches - parent batch',
  })
  batchId: number;

  @ManyToOne(() => ProductionBatches, (batch) => batch.bottlingOutputs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'batchId' })
  batch: ProductionBatches;

  // Product Size (SKU)
  @Column({
    comment: 'FK to product_codes - specific size/SKU produced',
  })
  productCodeId: number;

  @ManyToOne(() => ProductCodes, { eager: true })
  @JoinColumn({ name: 'productCodeId' })
  productCode: ProductCodes;

  // Quantities
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 3,
    comment: 'Good output quantity for this size (in bottles/units)',
  })
  quantity: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 3,
    default: 0,
    comment: 'Waste quantity for this size (in bottles/units)',
  })
  wasteQuantity: number;

  // Notes
  @Column({
    type: 'text',
    nullable: true,
    comment: 'Optional notes for this bottling output',
  })
  notes: string;

  // Audit Fields
  @Column({ nullable: true })
  createdBy: number;

  @ManyToOne(() => Users, { eager: false })
  @JoinColumn({ name: 'createdBy' })
  creator: Users;

  @Column({ nullable: true })
  updatedBy: number;

  @ManyToOne(() => Users, { eager: false })
  @JoinColumn({ name: 'updatedBy' })
  updater: Users;

  // Helper Methods
  /**
   * Calculate total bottles produced (good + waste)
   */
  getTotalBottles(): number {
    return Number(this.quantity) + Number(this.wasteQuantity);
  }

  /**
   * Calculate waste percentage
   */
  getWastePercentage(): number {
    const total = this.getTotalBottles();
    if (total === 0) return 0;
    return (Number(this.wasteQuantity) / total) * 100;
  }

  /**
   * Get product size label for display
   */
  getProductSizeLabel(): string {
    if (!this.productCode) return '';
    const productName = this.productCode.product?.name || '';
    const sizeValue = this.productCode.size?.sizeValue || '';
    return `${productName} ${sizeValue}`.trim();
  }
}
