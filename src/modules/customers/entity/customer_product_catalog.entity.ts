import { BaseEntity } from '../../../common/entities/base.entity';
import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Users } from '../../users/entities/users.entity';
import type { Customers } from './customers.entity';
import { ProductCodes } from '../../products/entity/product_codes.entity';

@Entity({ synchronize: true })
export class CustomerProductCatalogs extends BaseEntity {
  @Column()
  customerId: number;

  @Column()
  productCodeId: number;

  @ManyToOne("Customers", (customer: any) => customer.customerProductCatalog)
  @JoinColumn({ name: 'customerId' })
  customer: Customers;

  @ManyToOne(() => ProductCodes)
  @JoinColumn({ name: 'productCodeId' })
  productCode: ProductCodes;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  customerPrice: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  discountPercentage: number;

  @Column({ type: 'date', nullable: true })
  effectiveDate: Date;

  @Column({ type: 'date', nullable: true })
  expiryDate: Date;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @ManyToOne(() => Users)
  @JoinColumn({ name: 'createdBy' })
  createdBy: Users;

  @ManyToOne(() => Users)
  @JoinColumn({ name: 'updatedBy' })
  updatedBy: Users;
}
