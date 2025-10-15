import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Users } from '../users/entities/users.entity';

// import { Verification } from './entities/verification.entity'; // Optional - not used yet
import { JwtModule } from '@nestjs/jwt';
import { jwtConfig } from '../../config/jwt.config';
import { PassportModule } from '@nestjs/passport';
import { JwtAccessTokenStrategy } from './strategies/jwtAccessToken.strategy';
import { JwtRefreshTokenStrategy } from './strategies/jwtRefreshToken.strategy';
import { HashUtil } from '../../common/utils/hash.util';
import { RedisModule } from '../redis/redis.module';


@Module({
  imports: [
    // Only register tables that are actually created
    TypeOrmModule.forFeature([Users]),
    PassportModule.register({
      defaultStrategy: 'jwt',
      property: 'user',
      session: false,
    }),
    JwtModule.register({
      secret: jwtConfig.secret,
      signOptions: {
        expiresIn: jwtConfig.expired,
      },
    }),
    RedisModule,
  ],

  controllers: [
    AuthController,
  ],
  providers: [
    AuthService,
    JwtAccessTokenStrategy,
    JwtRefreshTokenStrategy,
    HashUtil,

  ],
})
export class AuthModule {}
