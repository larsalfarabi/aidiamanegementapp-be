import { Test, TestingModule } from '@nestjs/testing';
import { ProductionFormulaService } from './production-formula.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProductionFormulas, FormulaMaterials } from '../entities';
import { Products } from '../../products/entity/products.entity';
import { ProductCodes } from '../../products/entity/product_codes.entity';
import { ProductCategories } from '../../products/entity/product_categories.entity';
import { DataSource } from 'typeorm';
import { RedisService } from '../../redis/redis.service';
import { mockDataSourceFactory, mockRepositoryFactory, mockRedisServiceFactory } from '../../../test/mocks';

describe('ProductionFormulaService', () => {
  let service: ProductionFormulaService;
  let redisService: any;
  let formulaRepository: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductionFormulaService,
        {
          provide: getRepositoryToken(ProductionFormulas),
          useFactory: mockRepositoryFactory,
        },
        {
          provide: getRepositoryToken(FormulaMaterials),
          useFactory: mockRepositoryFactory,
        },
        {
          provide: getRepositoryToken(Products),
          useFactory: mockRepositoryFactory,
        },
        {
          provide: getRepositoryToken(ProductCodes),
          useFactory: mockRepositoryFactory,
        },
        {
          provide: getRepositoryToken(ProductCategories),
          useFactory: mockRepositoryFactory,
        },
        {
          provide: DataSource,
          useFactory: mockDataSourceFactory,
        },
        {
          provide: RedisService,
          useFactory: mockRedisServiceFactory,
        },
      ],
    }).compile();

    service = module.get<ProductionFormulaService>(ProductionFormulaService);
    redisService = module.get<RedisService>(RedisService);
    formulaRepository = module.get(getRepositoryToken(ProductionFormulas));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getFormulas (Caching Check)', () => {
    it('should return cached data if available', async () => {
      const filter = { page: 1, pageSize: 10 };
      const cachedData = { data: 'cached', message: 'Formula list' };

      redisService.get.mockResolvedValue(cachedData);

      const result = await service.getFormulas(filter as any);

      expect(result).toEqual({ ...cachedData, message: cachedData.message + ' (from cache)' }); // Logic matches service
      expect(redisService.get).toHaveBeenCalled();
      expect(formulaRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should fetch from DB and cache if no cache available', async () => {
      const filter = { page: 1, pageSize: 10 };
      redisService.get.mockResolvedValue(null);
      
      // Mock QueryBuilder properly
      const qbMock = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      
      formulaRepository.createQueryBuilder.mockReturnValue(qbMock);

      const result = await service.getFormulas(filter as any);

      expect(result).toBeDefined();
      expect(redisService.set).toHaveBeenCalled(); // Should cache the result
    });
  });
});
