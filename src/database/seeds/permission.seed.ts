import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Permissions } from '../../modules/permissions/entity/permissions.entity';
import { Repository } from 'typeorm';
import { Resource, Action } from '../../common/enums/resource.enum';

@Injectable()
export class PermissionSeeder {
  constructor(
    @InjectRepository(Permissions)
    private readonly permissionRepo: Repository<Permissions>,
  ) {}

  async run(): Promise<void> {
    console.log('🚀 Starting Permission seeding...');

    const permissionData = [
      // User Permission
      {
        name: Permissions.createName(Resource.USER, Action.VIEW),
        resource: Resource.USER,
        action: Action.VIEW,
        description: 'View users',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.USER, Action.CREATE),
        resource: Resource.USER,
        action: Action.CREATE,
        description: 'Create users',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.USER, Action.UPDATE),
        resource: Resource.USER,
        action: Action.UPDATE,
        description: 'Update users',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.USER, Action.DELETE),
        resource: Resource.USER,
        action: Action.DELETE,
        description: 'Delete users',
        isActive: true,
      },

      //  Role Permission
      {
        name: Permissions.createName(Resource.ROLE, Action.VIEW),
        resource: Resource.ROLE,
        action: Action.VIEW,
        description: 'View roles',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.ROLE, Action.CREATE),
        resource: Resource.ROLE,
        action: Action.CREATE,
        description: 'Create roles',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.ROLE, Action.UPDATE),
        resource: Resource.ROLE,
        action: Action.UPDATE,
        description: 'Update roles',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.ROLE, Action.DELETE),
        resource: Resource.ROLE,
        action: Action.DELETE,
        description: 'Delete roles',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.ROLE, Action.ASSIGN),
        resource: Resource.ROLE,
        action: Action.ASSIGN,
        description: 'Assign roles to users',
        isActive: true,
      },

      //  Permission Permissions
      {
        name: Permissions.createName(Resource.PERMISSION, Action.VIEW),
        resource: Resource.PERMISSION,
        action: Action.VIEW,
        description: 'View permissions',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.PERMISSION, Action.CREATE),
        resource: Resource.PERMISSION,
        action: Action.CREATE,
        description: 'Create permissions',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.PERMISSION, Action.UPDATE),
        resource: Resource.PERMISSION,
        action: Action.UPDATE,
        description: 'Update permissions',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.PERMISSION, Action.DELETE),
        resource: Resource.PERMISSION,
        action: Action.DELETE,
        description: 'Delete permissions',
        isActive: true,
      },
    ];

    let createdCount = 0;
    let existingCount = 0;

    for (const permission of permissionData) {
      try {
        const exist = await this.permissionRepo.findOne({
          where: {
            name: permission.name,
          },
        });

        if (!exist) {
          await this.permissionRepo.save(permission);
          createdCount++;
          console.log(`✅ Permission ${permission.name} created successfully.`);
        } else {
          existingCount++;
          console.log(`ℹ️ Permission ${permission.name} already exists.`);
        }
      } catch (error) {
        console.error(
          `❌ Error creating permission ${permission.name}:`,
          error.message,
        );
      }
    }

    console.log(
      `✅ Permission seeding completed: ${createdCount} created, ${existingCount} already existed`,
    );
  }
}
