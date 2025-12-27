import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Products } from './entity/products.entity';
import { ProductCodes } from './entity/product_codes.entity';
import { ProductSizes } from './entity/product_sizes.entity';
import { ProductCategories } from './entity/product_categories.entity';
import { RedisService } from '../redis/redis.service';
import { mockRepositoryFactory, mockRedisServiceFactory } from '../../test/mocks';
import { ProductCodeQueryDto } from './dto/products.dto';

describe('ProductsService', () => {
  let service: ProductsService;
  let redisService: any;
  let productCodeRepo: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: getRepositoryToken(ProductCodes),
          useFactory: mockRepositoryFactory,
        },
        {
          provide: getRepositoryToken(Products),
          useFactory: mockRepositoryFactory,
        },
        {
          provide: getRepositoryToken(ProductSizes),
          useFactory: mockRepositoryFactory,
        },
        {
          provide: getRepositoryToken(ProductCategories),
          useFactory: mockRepositoryFactory,
        },
        {
          provide: RedisService,
          useFactory: mockRedisServiceFactory,
        },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    redisService = module.get<RedisService>(RedisService);
    productCodeRepo = module.get(getRepositoryToken(ProductCodes));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return cached codes if available', async () => {
      const query: ProductCodeQueryDto = { page: 1, pageSize: 10, limit: 10 };
      const cachedResponse = {
        data: [{ id: 1, code: 'P01' }],
        message: 'Cached Data',
        meta: { total: 1, page: 1, limit: 10, totalPage: 1 }
      };

      redisService.get.mockResolvedValue(cachedResponse);

      const result = await service.findAll(query);

      expect(result).toEqual({ ...cachedResponse, message: 'Cached Data (from cache)' });
      expect(redisService.get).toHaveBeenCalled();
      // Ensure DB was not hit (qb is created in method before cache check? No, usually after)
      // Check implementation: implementation checks cache BEFORE qb.
      expect(productCodeRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should fetch from DB and cache logic if no cache', async () => {
      const query: ProductCodeQueryDto = { page: 1, pageSize: 10, limit: 10 };
      redisService.get.mockResolvedValue(null);

      // Mock QB properly
      const qbMock = {
        leftJoin: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([ [], 0 ]),
      };
      productCodeRepo.createQueryBuilder.mockReturnValue(qbMock);

      const result = await service.findAll(query);

      expect(result).toBeDefined();
      expect(redisService.set).toHaveBeenCalled(); // Should cache
    });
  });
});
