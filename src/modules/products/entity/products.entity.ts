import { BaseEntity } from '../../../common/entities/base.entity';
import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Users } from '../../users/entities/users.entity';
export enum ProductType {
  RTD = 'RTD',
  CONC = 'CONC',
}
@Entity({ synchronize: false })
export class Products extends BaseEntity {
  @Column({ nullable: false, length: 200 })
  name: string;
  
  // TODO: Uncomment if product types are needed in the future
  @Column({ type: 'enum', enum: ProductType, nullable: false })
  productType: ProductType;

  @Column({ nullable: true, type: 'text' })
  imageUrl: string;

  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => Users)
  @JoinColumn({ name: 'createdBy' })
  createdBy: Users;

  @ManyToOne(() => Users)
  @JoinColumn({ name: 'updatedBy' })
  updatedBy: Users;
}
