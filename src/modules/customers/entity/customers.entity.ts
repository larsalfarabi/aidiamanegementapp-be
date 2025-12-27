import { BaseEntity } from '../../../common/entities/base.entity';
import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Users } from '../../users/entities/users.entity';
import { CustomerProductCatalogs } from './customer_product_catalog.entity';

@Entity({ synchronize: true })
export class Customers extends BaseEntity {
  @Column({ unique: true, length: 20 })
  customerCode: string;

  @Column({ length: 200 })
  customerName: string;

  @Column({ length: 500 })
  address: string;

  @Column({ length: 20 })
  contactPerson: string;

  @Column({ length: 200, nullable: true })
  companyName: string;

  @Column({ length: 20 })
  phoneNumber: string;

  @Column({
    type: 'enum',
    enum: ['Hotel', 'Cafe & Resto', 'Catering', 'Reseller'],
    default: 'Reseller',
  })
  customerType: string;

  @Column({
    type: 'enum',
    enum: ['PPN', 'Non PPN'],
    default: 'Non PPN',
  })
  taxType: string;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => CustomerProductCatalogs, (catalog) => catalog.customerId)
  customerProductCatalog: CustomerProductCatalogs[];

  @Column({ nullable: true })
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
