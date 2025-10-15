import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Roles } from '../../modules/roles/entities/roles.entity';
import { Repository } from 'typeorm';
import { Permissions } from '../../modules/permissions/entity/permissions.entity';

@Injectable()
export class RoleSeeder {
  constructor(
    @InjectRepository(Roles) private readonly roleRepo: Repository<Roles>,
    @InjectRepository(Permissions)
    private readonly permissionRepo: Repository<Permissions>,
  ) {}

  async run(): Promise<void> {
    console.log('🚀 Starting Role seeding...');

    // Create Super Admin Role with all permissions
    await this.createSuperAdminRole();

    console.log('✅ Role seeding completed');
  }

  private async createSuperAdminRole(): Promise<void> {
    const superAdminRole = await this.createRoleIfNotExists(
      'Super Admin',
      'Full System Access',
    );

    const allPermissions = await this.permissionRepo.find({
      where: { isActive: true },
    });

    if (allPermissions.length > 0) {
      superAdminRole.permissions = allPermissions;
      await this.roleRepo.save(superAdminRole);
      console.log(
        `✅ Super Admin role assigned ${allPermissions.length} permissions`,
      );
    } else {
      console.log('⚠️ No permissions found for Super Admin role');
    }
  }

  private async createRoleIfNotExists(
    name: string,
    description: string,
  ): Promise<Roles> {
    let role = await this.roleRepo.findOne({
      where: { name },
      relations: ['permissions'],
    });
    if (!role) {
      role = this.roleRepo.create({
        name,
        description,
        isActive: true,
      });
      await this.roleRepo.save(role);
      console.log(`✅ Role "${name}" created successfully.`);
    } else {
      console.log(`ℹ️ Role "${name}" already exists.`);
    }

    return role;
  }
}
