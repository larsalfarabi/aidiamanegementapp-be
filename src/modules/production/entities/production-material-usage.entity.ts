import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import type { ProductionBatches } from './production-batches.entity'; // Changed to TYPE import to fix circular dependency
import { ProductCodes } from '../../products/entity/product_codes.entity';
import { Users } from '../../users/entities/users.entity';

/**
 * ProductionMaterialUsage Entity
 * Records actual material consumption during production
 *
 * Business Rules:
 * - Tracks planned vs actual material usage
 * - Records material cost for costing calculation
 * - Links to production batch
 * - Tracks waste per material
 *
 * Example:
 * Batch: BATCH-20250111-001
 * Material: Jambu Merah
 * - Planned: 10kg @ Rp 5,000/kg = Rp 50,000
 * - Actual: 9.5kg @ Rp 5,000/kg = Rp 47,500
 * - Waste: 0.5kg = Rp 2,500
 */
@Entity({ name: 'production_material_usage', synchronize: true })
@Index(['batchId'])
@Index(['materialProductCodeId'])
export class ProductionMaterialUsage extends BaseEntity {
  // Batch Reference
  @Column({
    comment: 'Production batch that used this material',
  })
  batchId: number;

  @ManyToOne('ProductionBatches', (batch: any) => batch.materialUsages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'batchId' })
  batch: ProductionBatches;

  // Material Info
  @Column({
    comment: 'Material product code used',
  })
  materialProductCodeId: number;

  @ManyToOne(() => ProductCodes, { eager: true })
  @JoinColumn({ name: 'materialProductCodeId' })
  materialProductCode: ProductCodes;

  // Quantity Tracking
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    comment: 'Planned quantity (from formula)',
  })
  plannedQuantity: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    comment: 'Actual quantity used',
  })
  actualQuantity: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    default: 0,
    comment: 'Waste quantity (planned - actual)',
  })
  wasteQuantity: number;

  @Column({
    length: 20,
    comment: 'Unit of measurement (KG, LITER, PCS)',
  })
  unit: string;

  // Costing
  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    comment: 'Unit cost (Rp per KG/LITER/PCS)',
  })
  unitCost: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    comment: 'Total cost (actualQuantity * unitCost)',
  })
  totalCost: number;

  // Additional Info
  @Column({
    type: 'text',
    nullable: true,
    comment: 'Notes about material usage',
  })
  notes: string;

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
   * Calculate Total Cost
   */
  calculateTotalCost(): number {
    return Number(this.actualQuantity) * Number(this.unitCost);
  }

  /**
   * Calculate Waste Quantity
   */
  calculateWaste(): number {
    return Number(this.plannedQuantity) - Number(this.actualQuantity);
  }

  /**
   * Virtual Property: Usage Efficiency
   */
  get usageEfficiency(): number {
    if (Number(this.plannedQuantity) === 0) {
      return 0;
    }
    return (Number(this.actualQuantity) / Number(this.plannedQuantity)) * 100;
  }

  /**
   * Virtual Property: Variance (Actual - Planned)
   * Excel Column I pattern
   */
  get variance(): number {
    return Number(this.actualQuantity) - Number(this.plannedQuantity);
  }

  /**
   * Virtual Property: Variance Percentage
   */
  get variancePercentage(): number {
    if (Number(this.plannedQuantity) === 0) return 0;
    return (this.variance / Number(this.plannedQuantity)) * 100;
  }

  /**
   * Virtual Property: Variance Status for UI color coding
   * 🟢 <3% = good
   * 🟡 3-5% = warning
   * 🔴 >5% = critical
   */
  get varianceStatus(): 'good' | 'warning' | 'critical' {
    const absVariance = Math.abs(this.variancePercentage);
    if (absVariance < 3) return 'good';
    if (absVariance < 5) return 'warning';
    return 'critical';
  }
}
