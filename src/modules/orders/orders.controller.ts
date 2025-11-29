import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  UseGuards,
  Delete,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto, OrderFilterDto } from './dto/orders.dto';
import { Pagination } from '../../common/decorator/pagination.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtGuard } from '../auth/guards/auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermissions } from '../../common/decorator/permission.decorator';
import { Resource, Action } from '../../common/enums/resource.enum';
import { InjectCreatedBy } from '../../common/decorator/inject-createdBy.decorator';
import { InjectDeletedBy } from '../../common/decorator/inject-deletedBy.decorator';
import { DeleteOrderDto } from './dto/orders.dto';

@UseGuards(JwtGuard, PermissionGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * Create new order
   */
  @Post()
  @RequirePermissions(`${Resource.ORDER}:${Action.CREATE}`)
  async create(@InjectCreatedBy() createOrderDto: CreateOrderDto) {
    return this.ordersService.createOrder(createOrderDto);
  }

  /**
   * Get all orders with filtering and pagination
   */
  @Get()
  @RequirePermissions(`${Resource.ORDER}:${Action.VIEW}`)
  async findAll(
    @Pagination() query: PaginationDto,
    @Query() filters: OrderFilterDto,
  ) {
    return this.ordersService.findAll(query, filters);
  }

  /**
   * Get order summary for dashboard
   */
  @Get('summary')
  @RequirePermissions(`${Resource.ORDER}:${Action.VIEW}`)
  async getOrderSummary(@Query() filters: OrderFilterDto) {
    return this.ordersService.getOrderSummary(filters);
  }

  /**
   * Get single order by ID
   */
  @Get(':id')
  @RequirePermissions(`${Resource.ORDER}:${Action.VIEW}`)
  async findOne(@Param('id') id: string) {
    return this.ordersService.findOne(+id);
  }

  /**
   * Get customer order history
   */
  @Get('customer/:customerId/history')
  @RequirePermissions(`${Resource.ORDER}:${Action.VIEW}`)
  async getCustomerOrderHistory(
    @Param('customerId') customerId: string,
    @Pagination() query: PaginationDto,
  ) {
    return this.ordersService.getCustomerOrderHistory(+customerId, query);
  }

  @Delete(':id')
  @RequirePermissions(`${Resource.ORDER}:${Action.DELETE}`)
  async delete(
    @Param('id') id: string,
    @InjectDeletedBy() payload: DeleteOrderDto,
  ) {
    return this.ordersService.delete(+id, payload);
  }
}
