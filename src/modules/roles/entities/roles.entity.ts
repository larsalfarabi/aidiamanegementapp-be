import { BaseEntity } from '../../../common/entities/base.entity';
import { Permissions } from '../../../modules/permissions/entity/permissions.entity';
import { Users } from '../../../modules/users/entities/users.entity';
import { Column, Entity, JoinTable, ManyToMany, OneToMany } from 'typeorm';

@Entity({ synchronize: false })
export class Roles extends BaseEntity {
  @Column({
    length: 100,
    unique: true,
  })
  name: string;

  @Column({
    length: 255,
  })
  description: string;

  @Column({
    default: true,
  })
  isActive: boolean;

  @OneToMany(() => Users, (user) => user.roles)
  users: Users[];

  @ManyToMany(() => Permissions, (permission) => permission.roles, {
    cascade: ['insert', 'update'],
    eager: false,
  })
  @JoinTable({
    name: 'role_permissions',
    joinColumn: { name: 'roleId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permissionId', referencedColumnName: 'id' },
  })
  permissions: Permissions[];
}
