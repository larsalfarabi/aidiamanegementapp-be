import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import BaseResponse from '../../common/response/base.response';
import { InjectRepository } from '@nestjs/typeorm';
import { Users } from './entities/users.entity';
import { Repository, Like } from 'typeorm';
import { ResponsePagination } from '../../common/interface/response.interface';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { RedisService } from '../redis/redis.service';
import { ResponseSuccess } from '../../common/interface/response.interface';
import { CreateUserDto, UpdateUserDto } from './dto/users.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { MailService } from '../mail/mail.service';
import { HashUtil } from 'src/common/utils/hash.util';
import * as crypto from 'crypto';

@Injectable()
export class UsersService extends BaseResponse {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(Users)
    private readonly userRepository: Repository<Users>,
    private readonly redisService: RedisService,
    private readonly mailService: MailService,
    private readonly hashUtil: HashUtil,
  ) {
    super();
  }

  async findAll(query: PaginationDto): Promise<ResponsePagination> {
    const { page, pageSize, limit, search } = query;

    const whereCondition = search
      ? [
          {
            firstName: Like(`%${search}%`),
          },
          {
            lastName: Like(`%${search}%`),
          },
          {
            email: Like(`%${search}%`),
          },
        ]
      : {};

    // Create cache key based on pagination parameters
    const cacheKey = `users:page:${page}:size:${pageSize}:search:${search}`;

    this.logger.debug(`🔍 Searching for cache key: ${cacheKey}`);

    // Check Redis connection first
    const isRedisConnected = await this.redisService.isConnected();
    this.logger.debug(`🔗 Redis connection status: ${isRedisConnected}`);

    if (!isRedisConnected) {
      this.logger.warn('⚠️ Redis is not connected, falling back to database');
    }

    // Try to get data from Redis cache first
    const cachedData =
      await this.redisService.get<ResponsePagination>(cacheKey);

    if (cachedData) {
      this.logger.log(`🚀 Data retrieved from Redis cache: ${cacheKey}`);
      return {
        ...cachedData,
        message: cachedData.message + ' (from cache)',
      };
    }

    this.logger.log(`📊 Cache miss for ${cacheKey}, fetching from database...`);

    const [result, count] = await this.userRepository.findAndCount({
      where: whereCondition,
      relations: ['roles'],
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        lastLoginAt: true,
        roles: {
          id: true,
          name: true,
        },
      },
      take: pageSize,
      skip: limit,
    });

    const paginationResult = this._pagination(
      'Berhasil mengambil data user',
      result,
      count,
      page!,
      pageSize!,
    );

    // Cache the result for specified TTL (300 seconds from env)
    if (isRedisConnected) {
      try {
        await this.redisService.set(cacheKey, paginationResult, 300);
        this.logger.log(`💾 Data cached in Redis with key: ${cacheKey}`);
      } catch (error) {
        this.logger.error(`❌ Failed to cache data: ${error.message}`);
      }
    } else {
      this.logger.warn('⚠️ Skipping cache due to Redis connection issue');
    }

    return paginationResult;
  }

  async findOne(id: number): Promise<ResponseSuccess> {
    const result = await this.userRepository.findOne({
      where: { id },
      relations: ['roles', 'roles.permissions'],
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        lastLoginAt: true,
        roles: {
          id: true,
          name: true,
        },
      },
    });

    if (!result) throw new NotFoundException('User tidak ditemukan');

    return this._success(
      `Berhasil mengambil data user dengan id ${id}`,
      result,
    );
  }

  /**
   * Generate secure random password
   * Format: 3 uppercase + 3 lowercase + 3 digits + 1 special = 10 chars
   * Example: ABC123xyz!
   */
  private generateSecurePassword(): string {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const digits = '0123456789';
    const special = '!@#$%^&*';

    const getRandomChars = (charset: string, length: number): string => {
      return Array.from(
        crypto.randomBytes(length * 2),
        (byte) => charset[byte % charset.length],
      )
        .slice(0, length)
        .join('');
    };

    // Generate components
    const upper = getRandomChars(uppercase, 3);
    const lower = getRandomChars(lowercase, 3);
    const digit = getRandomChars(digits, 3);
    const spec = getRandomChars(special, 1);

    // Combine and shuffle
    const combined = (upper + lower + digit + spec).split('');
    for (let i = combined.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [combined[i], combined[j]] = [combined[j], combined[i]];
    }

    return combined.join('');
  }

  async create(payload: CreateUserDto): Promise<ResponseSuccess> {
    const checkExist = await this.userRepository.findOne({
      where: { email: payload.email },
    });

    if (checkExist) throw new ConflictException('Email sudah terdaftar');

    // Generate password if not provided
    const generatedPassword = this.generateSecurePassword();

    // Hash password before saving
    const hashedPassword = await this.hashUtil.hashPassword(generatedPassword);

    const userPayload = {
      ...payload,
      password: hashedPassword, // Hashed password for database
    };

    // Save user to database
    const savedUser = await this.userRepository.save(userPayload);

    // Get user with role information for email
    const userWithRole = await this.userRepository.findOne({
      where: { id: savedUser.id },
      relations: ['roles'],
    });

    // Send welcome email with credentials
    try {
      const loginUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';

      await this.mailService.sendWelcomeEmail({
        userEmail: savedUser.email,
        userName: `${savedUser.firstName} ${savedUser.lastName}`,
        generatedPassword: generatedPassword,
        loginUrl: loginUrl,
        createdAt: new Date().toLocaleString('id-ID', {
          dateStyle: 'long',
          timeStyle: 'short',
          timeZone: 'Asia/Jakarta',
        }),
        roleName: userWithRole?.roles?.name || 'User',
      });

      this.logger.log(`✅ Welcome email sent to ${savedUser.email}`);
    } catch (emailError) {
      this.logger.error(
        `⚠️ Failed to send welcome email to ${savedUser.email}:`,
        emailError.message,
      );
      // Don't throw error - user is created successfully, email is optional
    }

    return this._success(
      'Berhasil membuat user. Email dengan kredensial login telah dikirim.',
      {
        email: savedUser.email,
        emailSent: true,
      },
    );
  }

  async update(id: number, payload: UpdateUserDto): Promise<ResponseSuccess> {
    const result = await this.userRepository.update(id, payload);

    if (result.affected === 0) {
      throw new NotFoundException('Data Pengguna tidak ditemukan');
    }
    return this._success(`Berhasil update user dengan id ${id}`);
  }

  /**
   * Change password for user
   * Verifies current password before updating to new password
   */
  async changePassword(
    userId: number,
    payload: ChangePasswordDto,
  ): Promise<ResponseSuccess> {
    // Validate passwords match
    if (payload.newPassword !== payload.confirmPassword) {
      throw new BadRequestException(
        'Konfirmasi kata sandi tidak cocok dengan kata sandi baru',
      );
    }

    // Get user with password
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'password'],
    });

    if (!user) {
      throw new NotFoundException('Pengguna tidak ditemukan');
    }

    // Verify current password
    const isCurrentPasswordValid = await this.hashUtil.verifyPassword(
      payload.currentPassword,
      user.password,
    );

    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Kata sandi saat ini tidak benar');
    }

    // Hash new password
    const hashedNewPassword = await this.hashUtil.hashPassword(
      payload.newPassword,
    );

    // Update password
    await this.userRepository.update(userId, {
      password: hashedNewPassword,
    });

    this.logger.log(`✅ Password changed successfully for user ID: ${userId}`);

    return this._success('Kata sandi berhasil diubah');
  }

  async delete(id: number): Promise<ResponseSuccess> {
    const result = await this.userRepository.delete(id);

    if (result.affected === 0)
      throw new NotFoundException('Data Pengguna tidak ditemukan');

    return this._success(`Berhasil menghapus user dengan id ${id}`);
  }
}
