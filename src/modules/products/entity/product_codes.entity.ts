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

  // ✅ FIXED: Proper relation type (not number, but entity type)
  @ManyToOne(() => Products)
  @JoinColumn({ name: 'productId' })
  productId: Products;

  @ManyToOne(() => ProductCategories)
  @JoinColumn({ name: 'categoryId' })
  categoryId: ProductCategories;

  @ManyToOne(() => ProductSizes)
  @JoinColumn({ name: 'sizeId' })
  sizeId: ProductSizes;

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

  @ManyToOne(() => Users)
  @JoinColumn({ name: 'deletedBy' })
  deletedBy: Users;
}
