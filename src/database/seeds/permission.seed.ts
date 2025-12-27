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
      // ==================== USER MANAGEMENT ====================
      {
        name: Permissions.createName(Resource.USER, Action.VIEW),
        resource: Resource.USER,
        action: Action.VIEW,
        description: 'View users list and details',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.USER, Action.CREATE),
        resource: Resource.USER,
        action: Action.CREATE,
        description: 'Create new users',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.USER, Action.UPDATE),
        resource: Resource.USER,
        action: Action.UPDATE,
        description: 'Update user information',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.USER, Action.DELETE),
        resource: Resource.USER,
        action: Action.DELETE,
        description: 'Delete users',
        isActive: true,
      },

      // ==================== ROLE MANAGEMENT ====================
      {
        name: Permissions.createName(Resource.ROLE, Action.VIEW),
        resource: Resource.ROLE,
        action: Action.VIEW,
        description: 'View roles list and details',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.ROLE, Action.CREATE),
        resource: Resource.ROLE,
        action: Action.CREATE,
        description: 'Create new roles',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.ROLE, Action.UPDATE),
        resource: Resource.ROLE,
        action: Action.UPDATE,
        description: 'Update role information',
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

      // ==================== PERMISSION MANAGEMENT ====================
      {
        name: Permissions.createName(Resource.PERMISSION, Action.VIEW),
        resource: Resource.PERMISSION,
        action: Action.VIEW,
        description: 'View permissions list and details',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.PERMISSION, Action.CREATE),
        resource: Resource.PERMISSION,
        action: Action.CREATE,
        description: 'Create new permissions',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.PERMISSION, Action.UPDATE),
        resource: Resource.PERMISSION,
        action: Action.UPDATE,
        description: 'Update permission information',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.PERMISSION, Action.DELETE),
        resource: Resource.PERMISSION,
        action: Action.DELETE,
        description: 'Delete permissions',
        isActive: true,
      },

      // ==================== CUSTOMER MANAGEMENT ====================
      {
        name: Permissions.createName(Resource.CUSTOMER, Action.VIEW),
        resource: Resource.CUSTOMER,
        action: Action.VIEW,
        description: 'View customers list and details',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.CUSTOMER, Action.CREATE),
        resource: Resource.CUSTOMER,
        action: Action.CREATE,
        description: 'Create new customers',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.CUSTOMER, Action.UPDATE),
        resource: Resource.CUSTOMER,
        action: Action.UPDATE,
        description: 'Update customer information',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.CUSTOMER, Action.DELETE),
        resource: Resource.CUSTOMER,
        action: Action.DELETE,
        description: 'Delete customers',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.CUSTOMER, Action.EXPORT),
        resource: Resource.CUSTOMER,
        action: Action.EXPORT,
        description: 'Export customer data',
        isActive: true,
      },

      // ==================== ORDER MANAGEMENT ====================
      {
        name: Permissions.createName(Resource.ORDER, Action.VIEW),
        resource: Resource.ORDER,
        action: Action.VIEW,
        description: 'View orders list and details',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.ORDER, Action.CREATE),
        resource: Resource.ORDER,
        action: Action.CREATE,
        description: 'Create new orders/invoices',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.ORDER, Action.UPDATE),
        resource: Resource.ORDER,
        action: Action.UPDATE,
        description: 'Update order information',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.ORDER, Action.DELETE),
        resource: Resource.ORDER,
        action: Action.DELETE,
        description: 'Delete/cancel orders',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.ORDER, Action.EXPORT),
        resource: Resource.ORDER,
        action: Action.EXPORT,
        description: 'Export order data',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.ORDER, Action.CANCEL),
        resource: Resource.ORDER,
        action: Action.CANCEL,
        description: 'Cancel orders',
        isActive: true,
      },

      // ==================== PRODUCT MANAGEMENT ====================
      {
        name: Permissions.createName(Resource.PRODUCT, Action.VIEW),
        resource: Resource.PRODUCT,
        action: Action.VIEW,
        description: 'View products list and details',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.PRODUCT, Action.CREATE),
        resource: Resource.PRODUCT,
        action: Action.CREATE,
        description: 'Create new products',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.PRODUCT, Action.UPDATE),
        resource: Resource.PRODUCT,
        action: Action.UPDATE,
        description: 'Update product information',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.PRODUCT, Action.DELETE),
        resource: Resource.PRODUCT,
        action: Action.DELETE,
        description: 'Delete products',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.PRODUCT, Action.EXPORT),
        resource: Resource.PRODUCT,
        action: Action.EXPORT,
        description: 'Export product data',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.PRODUCT, Action.IMPORT),
        resource: Resource.PRODUCT,
        action: Action.IMPORT,
        description: 'Import product data',
        isActive: true,
      },

      // ==================== INVENTORY MANAGEMENT ====================
      {
        name: Permissions.createName(Resource.INVENTORY, Action.VIEW),
        resource: Resource.INVENTORY,
        action: Action.VIEW,
        description: 'View inventory levels and transactions',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.INVENTORY, Action.CREATE),
        resource: Resource.INVENTORY,
        action: Action.CREATE,
        description: 'Create inventory transactions',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.INVENTORY, Action.UPDATE),
        resource: Resource.INVENTORY,
        action: Action.UPDATE,
        description: 'Update inventory records',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.INVENTORY, Action.DELETE),
        resource: Resource.INVENTORY,
        action: Action.DELETE,
        description: 'Delete inventory transactions',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.INVENTORY, Action.ADJUST),
        resource: Resource.INVENTORY,
        action: Action.ADJUST,
        description: 'Adjust stock levels manually',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.INVENTORY, Action.TRANSFER),
        resource: Resource.INVENTORY,
        action: Action.TRANSFER,
        description: 'Transfer stock between locations',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.INVENTORY, Action.REPACK),
        resource: Resource.INVENTORY,
        action: Action.REPACK,
        description: 'Perform repacking operations',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.INVENTORY, Action.EXPORT),
        resource: Resource.INVENTORY,
        action: Action.EXPORT,
        description: 'Export inventory reports',
        isActive: true,
      },

      // ==================== PRODUCTION FORMULA MANAGEMENT ====================
      {
        name: Permissions.createName(Resource.FORMULA, Action.VIEW),
        resource: Resource.FORMULA,
        action: Action.VIEW,
        description: 'View production formulas',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.FORMULA, Action.CREATE),
        resource: Resource.FORMULA,
        action: Action.CREATE,
        description: 'Create new production formulas',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.FORMULA, Action.UPDATE),
        resource: Resource.FORMULA,
        action: Action.UPDATE,
        description: 'Update production formulas',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.FORMULA, Action.DELETE),
        resource: Resource.FORMULA,
        action: Action.DELETE,
        description: 'Delete/deactivate formulas',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.FORMULA, Action.APPROVE),
        resource: Resource.FORMULA,
        action: Action.APPROVE,
        description: 'Approve formula versions',
        isActive: true,
      },

      // ==================== PRODUCTION BATCH MANAGEMENT ====================
      {
        name: Permissions.createName(Resource.BATCH, Action.VIEW),
        resource: Resource.BATCH,
        action: Action.VIEW,
        description: 'View production batches',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.BATCH, Action.CREATE),
        resource: Resource.BATCH,
        action: Action.CREATE,
        description: 'Create new production batches',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.BATCH, Action.UPDATE),
        resource: Resource.BATCH,
        action: Action.UPDATE,
        description: 'Update batch information and stages',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.BATCH, Action.DELETE),
        resource: Resource.BATCH,
        action: Action.DELETE,
        description: 'Delete batches (planned only)',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.BATCH, Action.START),
        resource: Resource.BATCH,
        action: Action.START,
        description: 'Start production batches',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.BATCH, Action.CANCEL),
        resource: Resource.BATCH,
        action: Action.CANCEL,
        description: 'Cancel production batches',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.BATCH, Action.APPROVE),
        resource: Resource.BATCH,
        action: Action.APPROVE,
        description: 'Approve/complete batches (QC)',
        isActive: true,
      },

      // ==================== REPORTING ====================
      {
        name: Permissions.createName(Resource.REPORT, Action.VIEW),
        resource: Resource.REPORT,
        action: Action.VIEW,
        description: 'View all reports and analytics',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.REPORT, Action.EXPORT),
        resource: Resource.REPORT,
        action: Action.EXPORT,
        description: 'Export reports to Excel/PDF',
        isActive: true,
      },

      // ==================== SYSTEM SETTINGS ====================
      {
        name: Permissions.createName(Resource.SETTING, Action.VIEW),
        resource: Resource.SETTING,
        action: Action.VIEW,
        description: 'View system settings',
        isActive: true,
      },
      {
        name: Permissions.createName(Resource.SETTING, Action.UPDATE),
        resource: Resource.SETTING,
        action: Action.UPDATE,
        description: 'Update system settings',
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
    console.log(`📊 Total permissions in system: ${permissionData.length}`);
  }
}
