import { BaseEntity } from '../../../common/entities/base.entity';
import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Users } from '../../users/entities/users.entity';

export enum CategoryType {
  MAIN = 'MAIN',
  SUB = 'SUB',
  DETAIL = 'DETAIL',
}

@Entity({ synchronize: false })
export class ProductCategories extends BaseEntity {
  @Column({ unique: true, length: 100 })
  name: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  // ✅ NEW: Hierarchical structure - Self-referencing untuk parent-child relationship
  @Column({ nullable: true })
  parentId: number;

  @ManyToOne(() => ProductCategories, (category) => category.children, {
    nullable: true,
  })
  @JoinColumn({ name: 'parentId' })
  parent: ProductCategories;

  @OneToMany(() => ProductCategories, (category) => category.parent)
  children: ProductCategories[];

  // ✅ NEW: Level indicator (0 = Main Category, 1 = Sub-Category, 2 = Detail)
  @Column({ type: 'int', default: 0 })
  level: number;

  // ✅ NEW: Category type untuk filtering dan validasi
  @Column({
    type: 'enum',
    enum: CategoryType,
    default: CategoryType.MAIN,
  })
  categoryType: CategoryType;

  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => Users)
  @JoinColumn({ name: 'createdBy' })
  createdBy: Users;

  @ManyToOne(() => Users)
  @JoinColumn({ name: 'updatedBy' })
  updatedBy: Users;
}
