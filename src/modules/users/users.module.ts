import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Users } from './entities/users.entity';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Users]),
    RedisModule, // Import RedisModule untuk akses Redis
  ],
  controllers: [UsersController],
  providers: [UsersService, PermissionGuard],
})
export class UsersModule {}
