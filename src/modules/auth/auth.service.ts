import * as dotenv from 'dotenv';
dotenv.config();
import { Injectable, UnauthorizedException } from '@nestjs/common';
import BaseResponse from '../../common/response/base.response';
import { Users } from '../users/entities/users.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { jwtPayload } from './auth.interface';
import { ResponseSuccess } from '../../common/interface/response.interface';
import { LoginDto, RefreshTokenDto } from './dto/auth.dto';
import { NotFoundException } from '@nestjs/common/exceptions';
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
    console.log('payload email =>', payload.email);
    const user = await this.userRepository.findOne({
      where: { email: payload.email },
    });

    if (!user) {
      throw new NotFoundException(
        'Email yang Anda masukkan belum terdaftar. Silakan periksa kembali atau hubungi admin untuk mendaftar.',
      );
    }

    if (!user.isActive) {
      throw new UnauthorizedException(
        'Akun Anda sedang tidak aktif. Silakan hubungi admin untuk mengaktifkan kembali akun Anda.',
      );
    }

    const isPasswordValid = await this.hashUtil.verifyPassword(
      payload.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException(
        'Password yang Anda masukkan salah. Silakan coba lagi atau gunakan fitur lupa password.',
      );
    }

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

    // Update refresh token and last login
    this.userRepository
      .update(user.id, {
        refresh_token: refresh_token,
        lastLoginAt: new Date(),
      })
      .catch((err) => {
        console.error('Failed to update user login data:', err);
      });

    return this._success('Berhasil masuk! Selamat datang kembali.', {
      data: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        roleId: user.roleId,
        roles: user.roles,
        isEmailVerified: user.isEmailVerified,
        isActive: user.isActive,
        lastLoginAt: new Date(),
      },
      access_token,
      refresh_token,
    });
  }

  async refreshToken(payload: RefreshTokenDto): Promise<ResponseSuccess> {
    // Check if refresh_token is provided and not empty
    if (!payload.refresh_token || payload.refresh_token.trim() === '') {
      throw new UnauthorizedException(
        'Sesi Anda telah berakhir. Silakan login kembali untuk melanjutkan.',
      );
    }

    const user = await this.userRepository.findOne({
      where: {
        id: payload.id,
        refresh_token: payload.refresh_token,
        isActive: true,
      },
      relations: ['roles'],
    });

    if (!user) {
      throw new UnauthorizedException(
        'Sesi Anda tidak valid atau telah berakhir. Silakan login kembali.',
      );
    }

    try {
      await this.jwtService.verify(payload.refresh_token, {
        secret: jwtConfig.refresh_token_secret,
      });
    } catch (error) {
      throw new UnauthorizedException(
        'Sesi Anda telah berakhir atau tidak valid. Silakan login kembali untuk melanjutkan.',
      );
    }

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

    // Update refresh token di database
    await this.userRepository.update(user.id, {
      refresh_token: new_refresh_token,
      lastLoginAt: new Date(),
    });

    return this._success('Sesi berhasil diperbarui', {
      access_token,
      refresh_token: new_refresh_token,
    });
  }

  async logout(userId: number): Promise<ResponseSuccess> {
    const user = await this.userRepository.findOne({
      where: { id: userId, isActive: true },
      select: ['id', 'refresh_token'],
    });

    if (!user) {
      throw new NotFoundException(
        'Akun Anda tidak ditemukan. Silakan periksa kembali atau hubungi admin.',
      );
    }

    await this.userRepository.update(userId, {
      refresh_token: null!,
    });

    return this._success('Berhasil keluar. Sampai jumpa lagi!');
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
