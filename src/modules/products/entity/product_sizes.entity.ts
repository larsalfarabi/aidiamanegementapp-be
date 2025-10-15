import { BaseEntity } from '../../../common/entities/base.entity';
import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Users } from '../../users/entities/users.entity';

@Entity({ synchronize: false })
export class ProductSizes extends BaseEntity {
  @Column({ unique: true, length: 100 })
  sizeValue: string;

  @Column({length: 10})
  unitOfMeasure: string;

  @Column()
  volumeMili: number;

  @ManyToOne(() => Users)
  @JoinColumn({ name: 'createdBy' })
  createdBy: Users;

  @ManyToOne(() => Users)
  @JoinColumn({ name: 'updatedBy' })
  updatedBy: Users;
}
