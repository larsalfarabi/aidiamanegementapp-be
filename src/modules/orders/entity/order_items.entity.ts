import { BaseEntity } from '../../../common/entities/base.entity';
import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import type { Orders } from './orders.entity';
import { ProductCodes } from '../../products/entity/product_codes.entity';
import { CustomerProductCatalogs } from '../../customers/entity/customer_product_catalog.entity';

@Entity({ synchronize: true })
export class OrderItems extends BaseEntity {
  @ManyToOne("Orders", (order: any) => order.orderItems, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Orders;

  @Column()
  orderId: number;

  @ManyToOne(() => ProductCodes)
  @JoinColumn({ name: 'productCodeId' })
  productCode: ProductCodes;

  @Column()
  productCodeId: number;

  @ManyToOne(() => CustomerProductCatalogs, { nullable: true })
  @JoinColumn({ name: 'customerCatalogId' })
  customerCatalog: CustomerProductCatalogs;

  @Column({ nullable: true })
  customerCatalogId: number;

  // Denormalized product data for performance and history preservation
  @Column({ length: 50 })
  productCodeValue: string; // Kode Barang dari capture

  @Column({ length: 300 })
  productName: string; // Nama Barang dari capture

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  unitPrice: number; // Harga Barang (harga saat order dibuat)

  @Column({ type: 'int' })
  quantity: number; // Jumlah Barang

  @Column({ length: 50, nullable: true })
  unit: string; // Unit (pcs, box, dll)

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  lineTotal: number; // Total per line (quantity * unitPrice)

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  discountPercentage: number; // Diskon jika ada

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  discountAmount: number; // Jumlah diskon

  @Column({ type: 'text', nullable: true })
  notes: string; // Catatan untuk item ini

  @Column({ default: true })
  isActive: boolean;
}
