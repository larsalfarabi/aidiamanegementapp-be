import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Users } from './entities/users.entity';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RedisModule } from '../redis/redis.module';
import { MailModule } from '../mail/mail.module';
import { HashUtil } from 'src/common/utils/hash.util';

@Module({
  imports: [TypeOrmModule.forFeature([Users]), RedisModule, MailModule],
  controllers: [UsersController],
  providers: [UsersService, PermissionGuard, HashUtil],
})
export class UsersModule {}
