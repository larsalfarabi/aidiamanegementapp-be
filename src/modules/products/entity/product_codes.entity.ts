import { ProductCategories } from './product_categories.entity';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Users } from '../../users/entities/users.entity';
import { Products } from './products.entity';
import { ProductSizes } from './product_sizes.entity';

@Entity({ synchronize: false })
export class ProductCodes extends BaseEntity {
  @Column({ unique: true, length: 50 })
  productCode: string;

  @ManyToOne(() => Products)
  @JoinColumn({ name: 'productId' })
  product: Products;

  // ✅ SWAPPED STRUCTURE: categoryId → Main Category (level 0)
  // Relasi ke Main Category (Barang Jadi, Barang Baku, dll) dari product_categories
  @ManyToOne(() => ProductCategories)
  @JoinColumn({ name: 'categoryId' })
  category: ProductCategories;

  @ManyToOne(() => ProductSizes, { nullable: true })
  @JoinColumn({ name: 'sizeId' })
  size: ProductSizes | null;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isDeleted: boolean;

  @ManyToOne(() => Users)
  @JoinColumn({ name: 'createdBy' })
  createdBy: Users;

  @ManyToOne(() => Users)
  @JoinColumn({ name: 'updatedBy' })
  updatedBy: Users;

  @ManyToOne(() => Users, { nullable: true })
  @JoinColumn({ name: 'deletedBy' })
  deletedBy: Users;
}
