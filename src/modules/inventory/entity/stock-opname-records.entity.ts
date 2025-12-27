import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ProductCodes } from '../../products/entity/product_codes.entity';
import { Users } from '../../users/entities/users.entity';

/**
 * StockOpnameRecords Entity
 * Session-based Stock Opname (SO FISIK) untuk reporting
 *
 * Business Rules:
 * - Terpisah dari daily_inventory transactions
 * - Tidak mempengaruhi stock real-time
 * - Session per tanggal + user (bisa save progress)
 * - Untuk stock opname reporting & variance analysis
 * - Final export Excel include SO FISIK values
 *
 * Workflow:
 * 1. User buka laporan → toggle "Mode Stock Opname"
 * 2. Input SO FISIK untuk multiple products (batch)
 * 3. Auto-calculate selisih = SO FISIK - STCK AKHIR
 * 4. Save session (progress)
 * 5. Export Excel final dengan SO FISIK dan Selisih
 */
@Entity({ name: 'stock_opname_records', synchronize: false })
@Index(['sessionDate', 'productCodeId'], { unique: true }) // One SO per product per session date
@Index(['sessionDate', 'createdBy']) // Query by session and user
@Index(['productCodeId']) // Query by product
export class StockOpnameRecords {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  // Session Info
  @Column({
    type: 'date',
    comment: 'Session date (grouping for batch stock opname)',
  })
  sessionDate: Date;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: 'Session identifier (optional, for multiple sessions per day)',
  })
  sessionId: string;

  // Product Reference
  @Column({ comment: 'Foreign key to product_codes table' })
  productCodeId: number;

  @ManyToOne(() => ProductCodes, { eager: false })
  @JoinColumn({ name: 'productCodeId' })
  productCode: ProductCodes;

  // Stock Opname Data
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    comment: 'Stock akhir from system (reference from daily_inventory)',
  })
  stokAkhir: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: 'Physical stock count (SO FISIK - manual entry)',
  })
  soFisik: number | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: 'Variance = SO FISIK - STCK AKHIR (auto-calculated)',
  })
  selisih: number | null;

  // Additional Info
  @Column({
    type: 'text',
    nullable: true,
    comment: 'Remarks/notes for this stock opname entry',
  })
  keterangan: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'DRAFT',
    comment: 'Status: DRAFT (in-progress), COMPLETED (finalized)',
  })
  status: 'DRAFT' | 'COMPLETED';

  // Audit Fields
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ comment: 'User who created this SO record' })
  createdBy: number;

  @ManyToOne(() => Users)
  @JoinColumn({ name: 'createdBy' })
  creator: Users;

  @Column({ nullable: true, comment: 'User who last updated this SO record' })
  updatedBy: number;

  @ManyToOne(() => Users)
  @JoinColumn({ name: 'updatedBy' })
  updater: Users;
}
