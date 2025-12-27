import { BaseEntity } from '../../../common/entities/base.entity';
import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Users } from '../../users/entities/users.entity';

/**
 * ProductSizes Entity - Redesigned for Category-Agnostic Units
 *
 * Supports multiple unit types:
 * - Volume: ML, LITER
 * - Weight: KG, GRAM
 * - Count: PCS, GLN (Galon), BTL (Botol), CUP
 *
 * Examples:
 * - { sizeValue: "250 ML", baseValue: 250, baseUnit: "ML", categoryType: "BARANG_JADI" }
 * - { sizeValue: "1 KG", baseValue: 1, baseUnit: "KG", categoryType: "BAHAN_BAKU" }
 * - { sizeValue: "1 GLN", baseValue: 1, baseUnit: "GLN", categoryType: "BAHAN_KEMASAN" }
 */
@Entity({ synchronize: true })
export class ProductSizes extends BaseEntity {
  @Column({ unique: true, length: 100 })
  sizeValue: string;

  @Column({ length: 20 })
  unitOfMeasure: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment:
      'Numeric value in base unit (e.g., 250 for "250 ML"). Nullable for count units like PCS, GLN, BTL, CUP',
  })
  baseValue?: number;

  @Column({
    length: 20,
    comment:
      'Base unit of measurement (ML, LITER, KG, GRAM, PCS, GLN, BTL, CUP)',
  })
  baseUnit: string;

  @Column({
    length: 50,
    nullable: true,
    comment:
      'Category hint (e.g., "BARANG_JADI", "BAHAN_BAKU", "BAHAN_KEMASAN")',
  })
  categoryType?: string;

  @ManyToOne(() => Users)
  @JoinColumn({ name: 'createdBy' })
  createdBy: Users;

  @ManyToOne(() => Users)
  @JoinColumn({ name: 'updatedBy' })
  updatedBy: Users;
}
