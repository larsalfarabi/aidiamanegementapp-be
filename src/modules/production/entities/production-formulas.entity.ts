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
import { Products } from '../../products/entity/products.entity';
import { Users } from '../../users/entities/users.entity';
import { FormulaMaterials } from './formula-materials.entity';
import { ProductionBatches } from './production-batches.entity';

/**
 * ProductionFormulas Entity
 * Master Formula for Production with Versioning Support
 *
 * CRITICAL CHANGE (Dec 2024): Formula now product-based, not productCode-based
 *
 * OLD SYSTEM:
 * - Formula tied to specific ProductCode (e.g., JAMBU-FRESHLY-250ML)
 * - One formula = One product size only
 * - Inflexible for multi-size bottling
 *
 * NEW SYSTEM:
 * - Formula tied to Product concept (e.g., JAMBU JUICE - FRESHLY - RTD)
 * - One formula can produce multiple product sizes
 * - Bottling stage determines final distribution
 *
 * Business Rules:
 * - One formula per product concept (product name + category + type)
 * - Supports versioning (v1.0, v1.1, v2.0)
 * - Only one version can be active at a time
 * - productCodeId kept for backward compatibility (nullable)
 * - Links to FormulaMaterials (BOM - Bill of Materials)
 *
 * Example:
 * Formula: MANGO JUICE - PREMIUM - RTD v1.0
 * - Materials: 10kg Mango per batch, 5kg Sugar, 2L Concentrate Base
 * - Produces 40L concentrate
 * - Bottling outputs:
 *   → 10 bottles × 1L (MANGO-PREMIUM-1L)
 *   → 5 bottles × 250ML (MANGO-PREMIUM-250ML)
 *   → 10 bottles × 5L (MANGO-PREMIUM-5L)
 */
@Entity({ name: 'production_formulas', synchronize: true })
@Index(['productId', 'version'], { unique: true }) // One version per product concept
@Index(['isActive']) // Quick lookup for active formulas
@Index(['formulaCode']) // Quick lookup by code
export class ProductionFormulas extends BaseEntity {
  // Formula Identification
  @Column({
    unique: true,
    length: 100,
    comment: 'Unique formula code (e.g., FORMULA-MANGO-PREMIUM-RTD-v1.0)',
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

  // Product Reference (NEW: Product concept, not specific size)
  @Column({
    comment:
      'Product concept that this formula produces (e.g., MANGO JUICE - PREMIUM - RTD)',
  })
  productId: number;

  @ManyToOne(() => Products, { eager: true })
  @JoinColumn({ name: 'productId' })
  product: Products;

  // Legacy Reference (kept for backward compatibility)
  @Column({
    nullable: true,
    comment:
      'LEGACY: Original product code reference (kept for migration tracking)',
  })
  productCodeId: number | null;

  @ManyToOne(() => ProductCodes, { eager: false })
  @JoinColumn({ name: 'productCodeId' })
  productCode: ProductCodes | null;

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
