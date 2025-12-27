import * as dotenv from 'dotenv';
dotenv.config();
import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import BaseResponse from '../../common/response/base.response';
import { Users } from '../users/entities/users.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { jwtPayload } from './auth.interface';
import { ResponseSuccess } from '../../common/interface/response.interface';
import { LoginDto, RefreshTokenDto } from './dto/auth.dto';
import { HashUtil } from '../../common/utils/hash.util';
import { jwtConfig } from '../../config/jwt.config';

@Injectable()
export class AuthService extends BaseResponse {
  constructor(
    @InjectRepository(Users)
    private readonly userRepository: Repository<Users>,
    private jwtService: JwtService,
    private hashUtil: HashUtil,
  ) {
    super();
  }

  generateJWT(
    payload: jwtPayload,
    expiresIn: string | number | undefined,
    secret: string,
  ) {
    return this.jwtService.sign(payload, {
      secret: secret,
      expiresIn: expiresIn,
    });
  }

  async login(payload: LoginDto): Promise<ResponseSuccess> {
    console.log('🔐 [AUTH] Login attempt for email:', payload.email);

    const user = await this.userRepository.findOne({
      where: {
        email: payload.email,
      },
      relations: ['roles', 'roles.permissions'],
    });

    if (!user) {
      console.error('❌ [AUTH] User not found:', payload.email);
      throw new NotFoundException('User tidak ditemukan');
    }

    if (!user.isActive) {
      console.error('❌ [AUTH] User inactive:', payload.email);
      throw new UnauthorizedException('Akun Anda tidak aktif');
    }

    const validate = await this.hashUtil.verifyPassword(
      payload.password,
      user.password,
    );
    if (!validate) {
      console.error('❌ [AUTH] Invalid password for:', payload.email);
      throw new BadRequestException('Email atau password salah');
    }

    console.log('✅ [AUTH] Password validated, generating tokens...');

    const jwtPayload: jwtPayload = {
      id: user.id,
      firstname: user.firstName,
      lastname: user.lastName,
      email: user.email,
      roleId: user.roleId,
      isEmailVerified: user.isEmailVerified,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
    };

    const [access_token, refresh_token] = await Promise.all([
      this.generateJWT(
        jwtPayload,
        process.env.JWT_EXPIRES_IN,
        jwtConfig.access_token_secret,
      ),
      this.generateJWT(
        { id: user.id, email: user.email },
        process.env.JWT_REFRESH_EXPIRES_IN,
        jwtConfig.refresh_token_secret,
      ),
    ]);

    await this.userRepository.update(user.id, {
      refresh_token: refresh_token,
      lastLoginAt: new Date(),
    });

    const { password, ...userWithoutPassword } = user;

    console.log(
      '✅ [AUTH] Login successful for:',
      user.email,
      '| Role:',
      user.roles?.name,
    );

    return this._success('Login berhasil', {
      access_token,
      refresh_token,
      user: userWithoutPassword,
    });
  }

  async refreshToken(payload: RefreshTokenDto): Promise<ResponseSuccess> {
    console.log(
      '🔄 [AUTH] Refresh token request for refresh token:',
      payload.refresh_token,
    );

    // Check if refresh_token is provided and not empty
    if (!payload.refresh_token || payload.refresh_token.trim() === '') {
      console.error('❌ [AUTH] No refresh token provided');
      throw new UnauthorizedException(
        'Sesi Anda telah berakhir. Silakan login kembali untuk melanjutkan.',
      );
    }

    // Verify token first before database lookup (performance optimization)
    try {
      await this.jwtService.verify(payload.refresh_token, {
        secret: jwtConfig.refresh_token_secret,
      });
      console.log('✅ [AUTH] Refresh token verified successfully');
    } catch (error) {
      console.error(
        '❌ [AUTH] Refresh token verification failed:',
        error.message,
      );
      throw new UnauthorizedException(
        'Sesi Anda telah berakhir atau tidak valid. Silakan login kembali untuk melanjutkan.',
      );
    }

    // Find user with matching refresh token
    const user = await this.userRepository.findOne({
      where: {
        id: payload.id,
        refresh_token: payload.refresh_token,
        isActive: true,
      },
      relations: ['roles'],
    });

    if (!user) {
      console.error(
        '❌ [AUTH] User not found or refresh token mismatch for ID:',
        payload.id,
      );
      throw new UnauthorizedException(
        'Sesi Anda tidak valid atau telah berakhir. Silakan login kembali.',
      );
    }

    console.log('✅ [AUTH] User found, generating new tokens...');

    const jwtPayload: jwtPayload = {
      id: user.id,
      firstname: user.firstName,
      lastname: user.lastName,
      email: user.email,
      roleId: user.roleId,
      isEmailVerified: user.isEmailVerified,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
    };

    // Generate new tokens
    const [access_token, new_refresh_token] = await Promise.all([
      this.generateJWT(
        jwtPayload,
        process.env.JWT_EXPIRES_IN,
        jwtConfig.access_token_secret,
      ),
      this.generateJWT(
        { id: user.id, email: user.email },
        process.env.JWT_REFRESH_EXPIRES_IN,
        jwtConfig.refresh_token_secret,
      ),
    ]);

    // Update refresh token di database (rotate token)
    await this.userRepository.update(user.id, {
      refresh_token: new_refresh_token,
      lastLoginAt: new Date(),
    });

    console.log(
      '✅ [AUTH] Tokens refreshed successfully for user:',
      user.email,
    );

    return this._success('Sesi berhasil diperbarui', {
      access_token,
      refresh_token: new_refresh_token,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        roleId: user.roleId,
      },
    });
  }

  async logout(id: number): Promise<ResponseSuccess> {
    console.log('🚪 [AUTH] Logout request for user ID:', id);

    const user = await this.userRepository.findOne({
      where: { id },
    });

    if (!user) {
      console.error('❌ [AUTH] Logout failed - User not found:', id);
      throw new NotFoundException('User tidak ditemukan');
    }

    await this.userRepository.update(id, {
      refresh_token: undefined,
    });

    console.log('✅ [AUTH] Logout successful for:', user.email);

    return this._success('Logout berhasil');
  }

  async getProfile(userId: number): Promise<ResponseSuccess> {
    const user = await this.userRepository.findOne({
      where: { id: userId, isActive: true },
      relations: ['roles', 'roles.permissions'],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        roleId: true,
        isEmailVerified: true,
        isActive: true,
        lastLoginAt: true,
        roles: {
          id: true,
          name: true,
          permissions: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(
        'Profil Anda tidak ditemukan. Silakan login kembali atau hubungi admin.',
      );
    }

    return this._success('Berhasil mengambil profile user', user);
  }
}
