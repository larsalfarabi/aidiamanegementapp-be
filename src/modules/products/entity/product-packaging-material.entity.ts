import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { ProductCodes } from './product_codes.entity';
import { Users } from '../../users/entities/users.entity';

/**
 * ProductPackagingMaterial Entity
 * Standard Packaging Bill of Materials (BOM) per Product Size (SKU)
 *
 * Purpose:
 * - Maps Finished Good SKU (e.g., Jambu 5L) to Packaging SKU (e.g., Botol 5L, Stiker 5L)
 * - Used to automatically deduct packaging stock upon Bottling / Batch Completion
 * - Separated from ProductionFormula to keep Formula focused on "Cooking/Concentrate"
 *
 * Business Rules:
 * - One Product SKU can have multiple Packaging Materials (One-to-Many)
 * - Excludes products marked as `canBeProduced` (Intermediate goods), unless they are final goods
 *
 * Example:
 * Product: BJ2PG4R (Pink Guava 5L)
 * Materials:
 * 1. BKBT5 (Botol 5L) x 1
 * 2. BKTTP5 (Tutup 5L) x 1
 * 3. BKST5 (Stiker 5L) x 1
 */
@Entity({ name: 'product_packaging_materials', synchronize: false })
@Index(['productCodeId'])
@Index(['materialProductCodeId'])
@Index(['isActive'])
export class ProductPackagingMaterial extends BaseEntity {
  // The Finished Good SKU (e.g., JM-600)
  @Column({
    comment: 'Finished Good SKU that requires this packaging',
  })
  productCodeId: number;

  @ManyToOne(() => ProductCodes, { eager: false })
  @JoinColumn({ name: 'productCodeId' })
  productCode: ProductCodes;

  // The Packaging Material SKU (e.g., BTL-600)
  @Column({
    comment: 'Packaging Material SKU',
  })
  materialProductCodeId: number;

  @ManyToOne(() => ProductCodes, { eager: false })
  @JoinColumn({ name: 'materialProductCodeId' })
  materialProductCode: ProductCodes;

  // Usage Quantity
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    default: 1,
    comment: 'Quantity of packaging used per 1 unit of finished good',
  })
  quantity: number;

  // Status
  @Column({
    default: true,
    comment: 'Is this packaging rule active?',
  })
  isActive: boolean;

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
}
