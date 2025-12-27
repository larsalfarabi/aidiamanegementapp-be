import { Exclude } from 'class-transformer';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Roles } from '../../../modules/roles/entities/roles.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity({ synchronize: true })
export class Users extends BaseEntity {
  @Column({ length: 100 })
  firstName: string;

  @Column({ length: 100 })
  lastName: string;

  @Column({ unique: true, length: 255 })
  email: string;

  @Column({ default: false })
  isEmailVerified: boolean;

  @Column()
  @Exclude()
  password: string;

  @ManyToOne(() => Roles, (roles) => roles.users, {
    eager: false,
  })
  @JoinColumn({ name: 'roleId' })
  roles: Roles;

  @Column()
  roleId: number;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  lastLoginAt?: Date;

  @Column({ nullable: true, type: 'text' })
  refresh_token: string;

  fullname(): string {
    return `${this.firstName} ${this.lastName}`;
  }
}
