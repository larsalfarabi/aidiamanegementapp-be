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
import { InjectCreatedBy } from '../../common/decorator/inject-createdBy.decorator';
import { InjectDeletedBy } from '../../common/decorator/inject-deletedBy.decorator';
import { DeleteOrderDto } from './dto/orders.dto';

@UseGuards(JwtGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * Create new order
   */
  @Post()
  async create(@InjectCreatedBy() createOrderDto: CreateOrderDto) {
    return this.ordersService.createOrder(createOrderDto);
  }

  /**
   * Get all orders with filtering and pagination
   */
  @Get()
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
  async getOrderSummary(@Query() filters: OrderFilterDto) {
    return this.ordersService.getOrderSummary(filters);
  }

  /**
   * Get single order by ID
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.ordersService.findOne(+id);
  }

  /**
   * Get customer order history
   */
  @Get('customer/:customerId/history')
  async getCustomerOrderHistory(
    @Param('customerId') customerId: string,
    @Pagination() query: PaginationDto,
  ) {
    return this.ordersService.getCustomerOrderHistory(+customerId, query);
  }

  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @InjectDeletedBy() payload: DeleteOrderDto,
  ) {
    return this.ordersService.delete(+id, payload);
  }
}
