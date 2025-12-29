import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Users } from '../../modules/users/entities/users.entity';
import { Roles } from '../../modules/roles/entities/roles.entity';
import { HashUtil } from '../../common/utils/hash.util';

@Injectable()
export class UserSeeder {
  constructor(
    @InjectRepository(Users)
    private readonly userRepo: Repository<Users>,
    @InjectRepository(Roles)
    private readonly roleRepo: Repository<Roles>,
    private hashUtil: HashUtil,
  ) {}

  async run(): Promise<void> {
    console.log('🚀 Starting User seeding...');

    // Get roles first
    const superAdminRole = await this.roleRepo.findOne({
      where: { name: 'IT AIDIA' },
    });

    if (!superAdminRole) {
      console.error(
        '❌ Super Admin role not found. Please run role seeder first.',
      );
      return;
    }

    // Define users to create
    const usersData = [
      {
        firstName: 'IT',
        lastName: 'AIDIA',
        email: 'msyamil404@gmail.com',
        password: 'Larsabi@01',
        isActive: true,
        isEmailVerified: true,
        roleId: superAdminRole.id,
      },
    ];

    let createdCount = 0;
    let existingCount = 0;

    for (const userData of usersData) {
      try {
        const exists = await this.userRepo.findOne({
          where: {
            email: userData.email,
          },
        });

        if (!exists) {
          const hashedPassword = await this.hashUtil.hashPassword(
            userData.password,
          );
          await this.userRepo.save({
            ...userData,
            password: hashedPassword,
          });
          createdCount++;
          console.log(`✅ User ${userData.email} created successfully.`);
        } else {
          existingCount++;
          console.log(`ℹ️ User ${userData.email} already exists.`);
        }
      } catch (error) {
        console.error(
          `❌ Error creating user ${userData.email}:`,
          error.message,
        );
      }
    }

    console.log(
      `✅ User seeding completed: ${createdCount} created, ${existingCount} already existed`,
    );
  }
}
