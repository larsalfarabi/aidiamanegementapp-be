import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { ProductCodes } from '../../products/entity/product_codes.entity';
import { Users } from '../../users/entities/users.entity';
import { FormulaMaterials } from './formula-materials.entity';
import { ProductionBatches } from './production-batches.entity';

/**
 * ProductionFormulas Entity
 * Master Formula for Production with Versioning Support
 *
 * Business Rules:
 * - One formula per finished product (e.g., Jambu 250ML)
 * - Supports versioning (v1.0, v1.1, v2.0)
 * - Only one version can be active at a time
 * - Tracks expected yield percentage for waste monitoring
 * - Links to FormulaMaterials (BOM - Bill of Materials)
 *
 * Example:
 * Formula: Jambu 250ML v1.0
 * - Materials: 10kg Jambu per batch, 5kg Gula, 2L Concentrate Base
 * - Batch quantity determined at production time via plannedQuantity
 * - Expected Yield: 95% (5% waste normal)
 */
@Entity({ name: 'production_formulas', synchronize: false })
@Index(['productCodeId', 'version'], { unique: true }) // One version per product
@Index(['isActive']) // Quick lookup for active formulas
@Index(['formulaCode']) // Quick lookup by code
export class ProductionFormulas extends BaseEntity {
  // Formula Identification
  @Column({
    unique: true,
    length: 100,
    comment: 'Unique formula code (e.g., FORMULA-JAMBU-250ML-v1.0)',
  })
  formulaCode: string;

  @Column({
    length: 200,
    comment: 'Formula name/description',
  })
  formulaName: string;

  @Column({
    length: 50,
    comment: 'Version number (e.g., 1.0, 1.1, 2.0)',
  })
  version: string;

  // Product Reference (Finished Goods)
  @Column({
    comment: 'Finished product that this formula produces',
  })
  productCodeId: number;

  @ManyToOne(() => ProductCodes, { eager: true })
  @JoinColumn({ name: 'productCodeId' })
  productCode: ProductCodes;

  // Production Metadata
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: 'Expected concentrate output in liters (e.g., 500L)',
  })
  concentrateOutput: number | null;

  // Production Metadata
  @Column({
    type: 'int',
    nullable: true,
    comment: 'Estimated production time in minutes',
  })
  productionTimeMinutes: number | null;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Production instructions/notes',
  })
  instructions: string | null;

  // Status & Lifecycle
  @Column({
    default: true,
    comment: 'Is this formula currently active?',
  })
  isActive: boolean;

  @Column({
    type: 'date',
    comment: 'Date when this formula becomes effective',
  })
  effectiveFrom: Date;

  @Column({
    type: 'date',
    nullable: true,
    comment: 'Date when this formula expires (null = no expiry)',
  })
  effectiveTo: Date | null;

  // Relations
  @OneToMany(() => FormulaMaterials, (material) => material.formula, {
    cascade: true,
  })
  materials: FormulaMaterials[];

  @OneToMany(() => ProductionBatches, (batch) => batch.formula)
  batches: ProductionBatches[];

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
   * Virtual Property: Is Formula Valid for Today?
   */
  get isValidForToday(): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const effectiveFrom = new Date(this.effectiveFrom);
    effectiveFrom.setHours(0, 0, 0, 0);

    if (today < effectiveFrom) {
      return false;
    }

    if (this.effectiveTo) {
      const effectiveTo = new Date(this.effectiveTo);
      effectiveTo.setHours(0, 0, 0, 0);

      if (today > effectiveTo) {
        return false;
      }
    }

    return this.isActive;
  }

  /**
   * Virtual Property: Formula Display Name
   */
  get displayName(): string {
    return `${this.formulaName} v${this.version}`;
  }
}
