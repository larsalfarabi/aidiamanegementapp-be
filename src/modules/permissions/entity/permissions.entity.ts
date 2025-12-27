import { BaseEntity } from '../../../common/entities/base.entity';
import { Roles } from '../../../modules/roles/entities/roles.entity';
import { Column, Entity, ManyToMany, Index } from 'typeorm';
import { Action, Resource } from '../../../common/enums/resource.enum';

@Entity({ synchronize: true })
export class Permissions extends BaseEntity {
  @Column({ length: 100 })
  @Index({ unique: true })
  name: string;

  @Column({ type: 'enum', enum: Resource })
  resource: Resource;

  @Column({ type: 'enum', enum: Action })
  action: Action;

  @Column({ length: 255 })
  description: string;

  @Column({ default: true })
  isActive: boolean;

  @ManyToMany(() => Roles, (role) => role.permissions)
  roles: Roles[];

  static createName(resource: Resource, action: Action): string {
    return `${resource}:${action}`;
  }
}
