import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Orders } from './entity/orders.entity';
import { OrderItems } from './entity/order_items.entity';
import { Customers } from '../customers/entity/customers.entity';
import { CustomerProductCatalogs } from '../customers/entity/customer_product_catalog.entity';
import { ProductCodes } from '../products/entity/product_codes.entity';
import { InventoryTransactionService } from '../inventory/services/inventory-transaction.service';
import { DataSource } from 'typeorm';
import { mockDataSourceFactory, mockRepositoryFactory } from '../../test/mocks';

describe('OrdersService', () => {
  let service: OrdersService;
  let ordersRepo: any;
  let productCodesRepo: any;
  let customerCatalogRepo: any;

  const mockInventoryTransactionService = {
    recordSale: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: getRepositoryToken(Orders),
          useFactory: mockRepositoryFactory,
        },
        {
          provide: getRepositoryToken(OrderItems),
          useFactory: mockRepositoryFactory,
        },
        {
          provide: getRepositoryToken(Customers),
          useFactory: mockRepositoryFactory,
        },
        {
          provide: getRepositoryToken(CustomerProductCatalogs),
          useFactory: mockRepositoryFactory,
        },
        {
          provide: getRepositoryToken(ProductCodes),
          useFactory: mockRepositoryFactory,
        },
        {
          provide: InventoryTransactionService,
          useValue: mockInventoryTransactionService,
        },
        {
          provide: DataSource,
          useFactory: mockDataSourceFactory,
        },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    ordersRepo = module.get(getRepositoryToken(Orders));
    productCodesRepo = module.get(getRepositoryToken(ProductCodes));
    customerCatalogRepo = module.get(getRepositoryToken(CustomerProductCatalogs));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateOrderPricing', () => {
    // We access the private method via casting or testing public createOrder
    // But better to test createOrder which calls it.

    it('should create order successfully', async () => {
        // Prepare DTO
        const createOrderDto = {
            customerId: 1,
            createdBy: 1, // Fix: Add required field
            orderItems: [
                { productCodeId: 101, quantity: 2 }
            ],
            // ... other props
        } as any;

        // Mocks for Transaction
        const queryRunner = (service as any).dataSource.createQueryRunner();
        
        // 1. Customer Mock
        queryRunner.manager.findOne.mockResolvedValueOnce({ 
            id: 1, 
            customerName: 'Test Customer', 
            taxType: 'NON PPN',
            isActive: true 
        });

        // 2. ProductCode Mock (for calculateOrderPricing batch fetch)
        productCodesRepo.find.mockResolvedValue([
            {
                id: 101,
                productCode: 'P-101',
                isActive: true,
                product: { name: 'Test Product' },
                category: { name: 'Test Category' },
                size: { sizeValue: '250ml', unitOfMeasure: 'PCS' }
            }
        ]);

        // 3. CustomerCatalog Mock (for pricing)
        customerCatalogRepo.find.mockResolvedValue([
            {
                id: 501,
                productCodeId: 101,
                customerId: 1,
                customerPrice: 10000,
                isActive: true
            }
        ]);

        // 4. Save Order result
        queryRunner.manager.save.mockResolvedValueOnce({ id: 999, orderNumber: 'ORD-123' }); // Order
        // 5. Save OrderItems result
        queryRunner.manager.save.mockResolvedValueOnce({ id: 888, orderId: 999 }); // Items

        // 6. FindOne (at the end)
        ordersRepo.findOne.mockResolvedValue({ id: 999, data: { whatever: true } });

        // Act
        const result = await service.createOrder(createOrderDto);

        // Assert
        expect(result).toBeDefined();
        // Since findAll/findOne mocks are generic, the result structure depends on what findOne returns
        // Key check is that repository methods were called
        expect(productCodesRepo.find).toHaveBeenCalled();
        expect(customerCatalogRepo.find).toHaveBeenCalled();
        expect(queryRunner.commitTransaction).toHaveBeenCalled();
    });
  });
});

