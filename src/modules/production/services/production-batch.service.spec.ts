import { Test, TestingModule } from '@nestjs/testing';
import { ProductionBatchService } from './production-batch.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { 
    ProductionBatches, 
    ProductionFormulas,
    ProductionStageTracking,
    ProductionMaterialUsage,
    ProductionBottlingOutput
} from '../entities';
import { ProductCodes } from '../../products/entity/product_codes.entity';
import { ProductionFormulaService } from './production-formula.service';
import { InventoryLegacyService } from '../../inventory/services/inventory-legacy.service';
import { NotificationEventEmitter } from '../../notifications/services/notification-event-emitter.service';
import { DataSource } from 'typeorm';
import { mockDataSourceFactory, mockRepositoryFactory } from '../../../test/mocks';
import { CheckMaterialStockDto } from '../dto/check-material-stock.dto';

describe('ProductionBatchService', () => {
  let service: ProductionBatchService;
  let productCodeRepository: any;
  let dataSource: any;

  // Partial Mock for Formula Service
  const mockFormulaService = {
    calculateMaterialRequirements: jest.fn(),
  };

  const mockInventoryService = {
    recordProduction: jest.fn(),
  };

  const mockNotificationEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductionBatchService,
        {
          provide: getRepositoryToken(ProductionBatches),
          useFactory: mockRepositoryFactory,
        },
        {
          provide: getRepositoryToken(ProductionFormulas),
          useFactory: mockRepositoryFactory,
        },
        {
          provide: getRepositoryToken(ProductionStageTracking),
          useFactory: mockRepositoryFactory,
        },
        {
          provide: getRepositoryToken(ProductionMaterialUsage),
          useFactory: mockRepositoryFactory,
        },
        {
          provide: getRepositoryToken(ProductionBottlingOutput),
          useFactory: mockRepositoryFactory,
        },
        {
          provide: getRepositoryToken(ProductCodes),
          useFactory: mockRepositoryFactory,
        },
        // We might not need ProductionBatchMaterials directly if it's not injected in constructor, 
        // but checking the file again, it might NOT be injected!
        // The constructor I read checks out: Batches, Formulas, Stages, Usage, Bottling, ProductCodes.
        // It does NOT have ProductionBatchMaterials in the list I read in Step 778!
        // Wait, Step 778 output:
        // constructor( ... batchRepo, formulaRepo, stageRepo, materialUsageRepo, bottlingOutputRepo, productCodeRepo ...)
        // It does NOT show ProductionBatchMaterials.
        
        {
          provide: ProductionFormulaService,
          useValue: mockFormulaService,
        },
        {
          provide: InventoryLegacyService,
          useValue: mockInventoryService,
        },
        {
          provide: NotificationEventEmitter,
          useValue: mockNotificationEmitter,
        },
        {
          provide: DataSource,
          useFactory: mockDataSourceFactory,
        },
      ],
    }).compile();

    service = module.get<ProductionBatchService>(ProductionBatchService);
    productCodeRepository = module.get(getRepositoryToken(ProductCodes));
    dataSource = module.get(DataSource);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkMaterialStock (N+1 Optimization Check)', () => {
    it('should validate stock using batch queries', async () => {
      // Input
      const dto: CheckMaterialStockDto = {
        productionDate: new Date(),
        materials: [
          { materialProductCodeId: 101, plannedQuantity: 10, rumus: 1 },
          { materialProductCodeId: 102, plannedQuantity: 5, rumus: 0.5 },
        ],
      } as any;

      // Mock Product Codes (Batch Fetch)
      productCodeRepository.find.mockResolvedValue([
        { id: 101, productCode: 'MAT-1', isActive: true, product: { name: 'Mat 1' }, size: { sizeValue: 'kg' } },
        { id: 102, productCode: 'MAT-2', isActive: true, product: { name: 'Mat 2' }, size: { sizeValue: 'kg' } },
      ]);

      // Mock Daily Inventory (Batch Fetch via DataSource)
      const mockDailyRepo = mockRepositoryFactory();
      dataSource.getRepository.mockReturnValue(mockDailyRepo);
      
      mockDailyRepo.find.mockResolvedValue([
        { productCodeId: 101, stokAkhir: 100 },
        { productCodeId: 102, stokAkhir: 2 }, // Shortage for 102 (Need 5, have 2)
      ]);

      // Act
      const result = await service.checkMaterialStock(dto);

      // Assert
      expect(result).toBeDefined();
      expect(productCodeRepository.find).toHaveBeenCalled(); // Should be called once with In([])
      expect(mockDailyRepo.find).toHaveBeenCalled(); // Should be called once with In([])
      
      // Verify Logic Results (Access via .data if it returns formatted response, or directly if raw)
      // Assuming it returns standard response wrapper:
      const responseData = result['data'] || result; // Fallback

      // Item 1: Need 10, Have 100 -> Sufficient
      expect(responseData.items[0].stockStatus).toBe('SUFFICIENT');
      expect(responseData.items[0].isValid).toBe(true);

      // Item 2: Need 5, Have 2 -> Insufficient
      expect(responseData.items[1].stockStatus).toBe('INSUFFICIENT');
      expect(responseData.items[1].isValid).toBe(false);
      
      // Verify Overall Result
      expect(responseData.isValid).toBe(false);
      expect(responseData.items.length).toBe(2);
    });
  });
});
