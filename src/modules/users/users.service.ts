import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
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

@Injectable()
export class UsersService extends BaseResponse {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(Users)
    private readonly userRepository: Repository<Users>,
    private readonly redisService: RedisService, // Inject RedisService
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
      console.log('🚀 Data retrieved from Redis cache:', cacheKey);
      return {
        ...cachedData,
        message: cachedData.message + ' (from cache)',
      };
    }

    this.logger.log(`📊 Cache miss for ${cacheKey}, fetching from database...`);
    console.log('📊 Fetching data from database...');

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
        console.log('💾 Data cached in Redis with key:', cacheKey);
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

  async create(payload: CreateUserDto): Promise<ResponseSuccess> {
    const checkExist = await this.userRepository.findOne({
      where: { email: payload.email },
    });

    if (checkExist) throw new ConflictException('Email sudah terdaftar');

    await this.userRepository.save({ ...payload });
    return this._success('Berhasil membuat user');
  }

  async update(id: number, payload: UpdateUserDto): Promise<ResponseSuccess> {
    const result = await this.userRepository.update(id, payload);

    if (result.affected === 0) {
      throw new NotFoundException('Data Pengguna tidak ditemukan');
    }
    return this._success(`Berhasil update user dengan id ${id}`);
  }

  async delete(id: number): Promise<ResponseSuccess> {
    const result = await this.userRepository.delete(id);

    if (result.affected === 0)
      throw new NotFoundException('Data Pengguna tidak ditemukan');

    return this._success(`Berhasil menghapus user dengan id ${id}`);
  }
}
