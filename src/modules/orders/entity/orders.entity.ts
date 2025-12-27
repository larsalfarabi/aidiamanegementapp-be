import { BaseEntity } from '../../../common/entities/base.entity';
import { Entity, Column, ManyToOne, JoinColumn, OneToMany, Index } from 'typeorm';
import { Users } from '../../users/entities/users.entity';
import { Customers } from '../../customers/entity/customers.entity';
import { OrderItems } from './order_items.entity';

@Entity({ synchronize: false })
@Index(['isDeleted']) // Speed up soft-delete filtering
export class Orders extends BaseEntity {
  @Column({ unique: true, length: 50 })
  orderNumber: string; // Order number (internal)

  @Column({ unique: true, length: 50, nullable: true })
  invoiceNumber: string; // Invoice number (SL/OJ-MKT/IX/25/0001)

  @ManyToOne(() => Customers)
  @JoinColumn({ name: 'customerId' })
  customer: Customers;

  @Column()
  @Index() // Speed up filtering by customer
  customerId: number;

  @Column({ type: 'date' })
  @Index() // Speed up date range reports
  orderDate: Date; // Tanggal Order

  @Column({ type: 'date', nullable: true })
  invoiceDate: Date; // Tanggal Invoice

  @Column({ length: 500, nullable: true })
  customerNotes: string; // Keterangan dari customer

  @Column({ length: 100 })
  customerCode: string; // Kode Pelanggan

  @Column({ length: 200 })
  customerName: string; // Nama Pelanggan (denormalized untuk performa)

  @Column({ type: 'text' })
  customerAddress: string; // Alamat Pelanggan (denormalized)

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  subtotal: number; // Jumlah sebelum pajak

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  taxPercentage: number; // Persentase pajak (11% untuk PPN)

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  taxAmount: number; // Jumlah pajak

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  grandTotal: number; // Grand Total

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  paidAmount: number; // Jumlah yang sudah dibayar

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  remainingAmount: number; // Sisa yang harus dibayar (Terbilang)

  @Column({ type: 'text', nullable: true })
  paymentInfo: string; // Info Rekening Bayar (permanen tampilan)

  @Column({ type: 'text', nullable: true })
  internalNotes: string; // Catatan internal

  @OneToMany(() => OrderItems, (orderItem) => orderItem.order, {
    cascade: true,
  })
  orderItems: OrderItems[];

  @Column({ nullable: true })
  isDeleted: boolean;

  @ManyToOne(() => Users)
  @JoinColumn({ name: 'createdBy' })
  createdBy: Users;

  @ManyToOne(() => Users)
  @JoinColumn({ name: 'updatedBy' })
  updatedBy: Users;

  @ManyToOne(() => Users, { nullable: true })
  @JoinColumn({ name: 'approvedBy' })
  approvedBy: Users;

  @ManyToOne(() => Users, { nullable: true })
  @JoinColumn({ name: 'deletedBy' })
  deletedBy: Users;

  @Column({ type: 'timestamp', nullable: true })
  deletedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  approvedAt: Date;
}
