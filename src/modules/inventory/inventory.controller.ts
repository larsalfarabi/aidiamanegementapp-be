import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { DailyInventoryService } from './services/daily-inventory.service';
import { DailyInventoryResetService } from './services/daily-inventory-reset.service';
import { InventoryTransactionService } from './services/inventory-transaction.service';
import { JwtGuard } from '../auth/guards/auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermissions } from '../../common/decorator/permission.decorator';
import { Resource, Action } from '../../common/enums/resource.enum';
import {
  CreateInventoryDto,
  UpdateInventoryDto,
  FilterInventoryDto,
  FilterTransactionsDto,
  RecordProductionDto,
  CreatePurchaseDto,
  RecordWasteDto,
  AdjustStockDto,
  FilterDailyInventoryDto,
  CheckStockDto,
} from './dto';

interface AuthRequest extends Request {
  user: { id: number };
}

@UseGuards(JwtGuard, PermissionGuard)
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly dailyInventoryService: DailyInventoryService,
    private readonly dailyResetService: DailyInventoryResetService,
    private readonly transactionService: InventoryTransactionService,
  ) {}

  // ==================== DAILY INVENTORY CRUD ====================

  /**
   * GET /inventory/daily - Get daily inventory with filters
   * Query params: businessDate (YYYY-MM-DD, default: today), productCodeId, stockStatus, isActive, page, pageSize
   *
   * Returns daily inventory records with:
   * - stokAwal (Opening Stock)
   * - barangMasuk (Goods In)
   * - dipesan (Ordered)
   * - barangOutRepack (Out for Repacking)
   * - barangOutSample (Out as Samples)
   * - stokAkhir (Ending Stock - GENERATED COLUMN)
   */
  @RequirePermissions(`${Resource.INVENTORY}:${Action.VIEW}`)
  @Get('daily')
  async getDailyInventory(@Query() query: FilterDailyInventoryDto) {
    return this.dailyInventoryService.findAll(query);
  }

  /**
   * GET /inventory/daily/low-stock - Get products with low stock
   * Query params: businessDate (optional, default: today)
   */
  @RequirePermissions(`${Resource.INVENTORY}:${Action.VIEW}`)
  @Get('daily/low-stock')
  async getLowStockProductsDaily(@Query('businessDate') businessDate?: string) {
    return this.dailyInventoryService.getLowStockProducts(businessDate);
  }

  /**
   * GET /inventory/daily/summary - Get stock summary for a date
   * Query params: businessDate (optional, default: today)
   */
  @Get('daily/summary')
  async getDailySummary(@Query('businessDate') businessDate?: string) {
    return this.dailyInventoryService.getStockSummary(businessDate);
  }

  /**
   * GET /inventory/daily/:id - Get daily inventory by ID
   */
  @Get('daily/:id')
  async getDailyInventoryById(@Param('id', ParseIntPipe) id: number) {
    return this.dailyInventoryService.findById(id);
  }

  /**
   * POST /inventory/daily - Create initial inventory record
   * Biasanya tidak diperlukan karena cron job otomatis membuat record baru.
   * Digunakan untuk setup awal atau recovery.
   */
  @RequirePermissions(`${Resource.INVENTORY}:${Action.CREATE}`)
  @Post('daily')
  @HttpCode(HttpStatus.CREATED)
  async createDailyInventory(@Body() dto: any, @Req() req: AuthRequest) {
    return this.dailyInventoryService.create(dto, req.user.id);
  }

  /**
   * PATCH /inventory/daily/:id - Update inventory settings
   * Hanya bisa update: minimumStock, maximumStock, notes, isActive
   */
  @RequirePermissions(`${Resource.INVENTORY}:${Action.UPDATE}`)
  @Patch('daily/:id')
  async updateDailyInventory(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
    @Req() req: AuthRequest,
  ) {
    return this.dailyInventoryService.update(id, dto, req.user.id);
  }

  /**
   * DELETE /inventory/daily/:id - Soft delete inventory record
   */
  @RequirePermissions(`${Resource.INVENTORY}:${Action.DELETE}`)
  @Delete('daily/:id')
  async deleteDailyInventory(@Param('id', ParseIntPipe) id: number) {
    return this.dailyInventoryService.softDelete(id);
  }

  /**
   * POST /inventory/daily/bulk-register - Bulk register products to inventory
   *
   * Human-Centered Design: One-click setup for testing or deployment
   *
   * Body params:
   * - mainCategory?: string (optional - if null, register ALL products)
   * - initialStock?: number (default: 100)
   * - minimumStock?: number (default: 10)
   */
  @Post('daily/bulk-register')
  @HttpCode(HttpStatus.CREATED)
  async bulkRegisterProducts(
    @Body('mainCategory') mainCategory: string | null,
    @Body('initialStock') initialStock: number = 100,
    @Body('minimumStock') minimumStock: number = 10,
    @Req() req: AuthRequest,
  ) {
    const userId = req.user?.id || 1;
    return this.dailyInventoryService.bulkRegisterProducts(
      mainCategory,
      initialStock,
      minimumStock,
      userId,
    );
  }

  /**
   * GET /inventory/snapshots - Get historical snapshots
   * Query params: productCodeId, startDate, endDate, page, pageSize
   */
  @Get('snapshots')
  async getSnapshots(@Query() query: any) {
    return this.dailyInventoryService.getSnapshots(query);
  }

  /**
   * GET /inventory/product/:productCodeId/history - Get inventory history for a product
   * Query params: startDate, endDate
   */
  @Get('product/:productCodeId/history')
  async getProductHistory(
    @Param('productCodeId', ParseIntPipe) productCodeId: number,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.dailyInventoryService.getProductHistory(
      productCodeId,
      startDate,
      endDate,
    );
  }

  // ==================== INVENTORY TRANSACTION OPERATIONS ====================

  /**
   * POST /inventory/transactions/production
   * Record production output (finished goods masuk gudang)
   * Updates: daily_inventory.barangMasuk++
   */
  @RequirePermissions(`${Resource.INVENTORY}:${Action.CREATE}`)
  @Post('transactions/production')
  @HttpCode(HttpStatus.CREATED)
  async recordProductionTransaction(
    @Body() dto: RecordProductionDto,
    @Req() req: AuthRequest,
  ) {
    return this.transactionService.recordProduction(dto, req.user.id);
  }

  /**
   * POST /inventory/transactions/purchase
   * Record material purchase (Bahan Baku, Pembantu, Kemasan)
   * Updates: daily_inventory.barangMasuk++
   */
  @RequirePermissions(`${Resource.INVENTORY}:${Action.CREATE}`)
  @Post('transactions/purchase')
  @HttpCode(HttpStatus.CREATED)
  async recordPurchaseTransaction(
    @Body() dto: CreatePurchaseDto,
    @Req() req: AuthRequest,
  ) {
    return this.transactionService.recordPurchase(dto, req.user.id);
  }

  /**
   * POST /inventory/transactions/sale
   * Record sale/order fulfillment
   * Updates: daily_inventory.dipesan++
   */
  @Post('transactions/sale')
  @HttpCode(HttpStatus.CREATED)
  async recordSaleTransaction(
    @Body() dto: any, // RecordSaleDto from record-transaction.dto.ts
    @Req() req: AuthRequest,
  ) {
    return this.transactionService.recordSale(dto, req.user.id);
  }

  /**
   * POST /inventory/transactions/repacking
   * Record repacking operation (e.g., 1L → 4x 250ML)
   * Updates: source.barangOutRepack++, target.barangMasuk++
   */
  @RequirePermissions(`${Resource.INVENTORY}:${Action.REPACK}`)
  @Post('transactions/repacking')
  @HttpCode(HttpStatus.CREATED)
  async recordRepackingTransaction(
    @Body() dto: any, // RecordRepackingDto from record-transaction.dto.ts
    @Req() req: AuthRequest,
  ) {
    return this.transactionService.recordRepacking(dto, req.user.id);
  }

  /**
   * POST /inventory/transactions/sample-out
   * Record sample distribution to customer
   * Updates: daily_inventory.barangOutSample++
   */
  @Post('transactions/sample-out')
  @HttpCode(HttpStatus.CREATED)
  async recordSampleOutTransaction(
    @Body() dto: any, // RecordSampleDto from record-transaction.dto.ts
    @Req() req: AuthRequest,
  ) {
    return this.transactionService.recordSampleOut(dto, req.user.id);
  }

  /**
   * POST /inventory/transactions/sample-return
   * Record sample return from customer
   * Updates: daily_inventory.barangMasuk++ (if returned)
   */
  @Post('transactions/sample-return')
  @HttpCode(HttpStatus.CREATED)
  async recordSampleReturnTransaction(
    @Body() dto: any, // ReturnSampleDto from record-transaction.dto.ts
    @Req() req: AuthRequest,
  ) {
    return this.transactionService.recordSampleReturn(dto, req.user.id);
  }

  /**
   * POST /inventory/transactions/reverse-sale
   * Reverse/cancel a sale transaction (decrements dipesan)
   * Used for order cancellations or manual adjustments
   * Body: { orderId, productCodeId, quantity, reason }
   */
  @Post('transactions/reverse-sale')
  @HttpCode(HttpStatus.CREATED)
  async reverseSaleTransaction(
    @Body() dto: any, // ReverseSaleDto from record-transaction.dto.ts
    @Req() req: AuthRequest,
  ) {
    return this.transactionService.reverseSale(
      dto.orderId,
      dto.productCodeId,
      dto.quantity,
      req.user.id,
      dto.reason,
    );
  }

  /**
   * POST /inventory/transactions/adjustment
   * Manual stock adjustment - Directly modifies stokAkhir
   *
   * Use cases:
   * - Stock opname corrections (hasil stock opname tidak sesuai sistem)
   * - Damaged/expired goods removal (barang rusak/kadaluarsa)
   * - Missing stock correction (selisih fisik vs sistem)
   * - Data entry error fixes
   *
   * Impact: stokAkhir baru = stokAkhir lama + adjustmentQuantity
   * - Positive (+): Increase stock (tambah stok)
   * - Negative (-): Decrease stock (kurangi stok)
   *
   * Body: { productCodeId, adjustmentQuantity, reason, notes?, performedBy? }
   *
   * Returns: { transactionNumber, productCode, stockBefore, adjustmentQuantity, stockAfter }
   */
  @RequirePermissions(`${Resource.INVENTORY}:${Action.UPDATE}`)
  @Post('transactions/adjustment')
  @HttpCode(HttpStatus.CREATED)
  async adjustStockTransaction(
    @Body() dto: AdjustStockDto,
    @Req() req: AuthRequest,
  ) {
    return this.transactionService.adjustStock(dto, req.user.id);
  }

  /**
   * GET /inventory/transactions/history - Get transaction history
   * Query params: productCodeId, transactionType, startDate, endDate, orderId, productionBatchNumber, page, limit
   *
   * Returns paginated transaction history with filtering support
   */
  @RequirePermissions(`${Resource.INVENTORY}:${Action.VIEW}`)
  @Get('transactions/history')
  async getTransactionHistory(@Query() query: FilterTransactionsDto) {
    return this.transactionService.getTransactionHistory(query);
  }

  // ==================== REPACKING QUERY ENDPOINTS ====================

  /**
   * GET /inventory/repackings - Get all repacking records with filters
   * Query params: startDate, endDate, sourceProductCodeId, targetProductCodeId, status, page, limit
   */
  @Get('repackings')
  async getAllRepackings(@Query() query: any) {
    return this.transactionService.getAllRepackings(query);
  }

  /**
   * GET /inventory/repackings/:id - Get repacking record by ID
   */
  @Get('repackings/:id')
  async getRepackingById(@Param('id', ParseIntPipe) id: number) {
    return this.transactionService.getRepackingById(id);
  }

  /**
   * GET /inventory/repackings/history/:productCodeId - Get repacking history for a product
   * Query params: asSource (boolean, default: true)
   */
  @Get('repackings/history/:productCodeId')
  async getRepackingHistory(
    @Param('productCodeId', ParseIntPipe) productCodeId: number,
    @Query('asSource') asSource?: string,
  ) {
    return this.transactionService.getRepackingHistory(
      productCodeId,
      asSource !== 'false',
    );
  }

  // ==================== SAMPLE TRACKING QUERY ENDPOINTS ====================

  /**
   * GET /inventory/samples - Get all sample records with filters
   * Query params: status, recipientName, startDate, endDate, productCodeId, page, limit
   */
  @Get('samples')
  async getAllSamples(@Query() query: any) {
    return this.transactionService.getAllSamples(query);
  }

  /**
   * GET /inventory/samples/active - Get outstanding samples (DISTRIBUTED status)
   */
  @Get('samples/active')
  async getActiveSamples() {
    return this.transactionService.getActiveSamples();
  }

  /**
   * GET /inventory/samples/follow-up - Get samples due for follow-up
   */
  @Get('samples/follow-up')
  async getSamplesDueForFollowUp() {
    return this.transactionService.getSamplesDueForFollowUp();
  }

  /**
   * GET /inventory/samples/product/:productCodeId - Get sample history for a product
   */
  @Get('samples/product/:productCodeId')
  async getSamplesByProduct(
    @Param('productCodeId', ParseIntPipe) productCodeId: number,
  ) {
    return this.transactionService.getSamplesByProduct(productCodeId);
  }

  /**
   * GET /inventory/samples/:id - Get sample record by ID
   */
  @Get('samples/:id')
  async getSampleById(@Param('id', ParseIntPipe) id: number) {
    return this.transactionService.getSampleById(id);
  }

  // ==================== LEGACY ENDPOINTS REMOVED ====================
  // Removed 10 unused endpoints:
  // - GET /inventory (findAll)
  // - GET /inventory/low-stock (getLowStockProducts)
  // - GET /inventory/balance (getStockBalance)
  // - GET /inventory/:id (findById)
  // - POST /inventory (create)
  // - PATCH /inventory/:id (update)
  // - POST /inventory/production (recordProduction)
  // - POST /inventory/waste (recordWaste)
  // - POST /inventory/adjust (adjustStock)
  // - GET /inventory/transactions/history (getTransactionHistory)
  //
  // These were NOT used by frontend. Use these instead:
  // - Daily inventory operations: /inventory/daily/*
  // - Transaction operations: /inventory/transactions/* (from InventoryTransactionService)

  // ==================== ADMIN OPERATIONS (Daily Reset) ====================

  /**
   * POST /inventory/admin/trigger-reset - Manually trigger daily reset
   *
   * Use cases:
   * - Testing the reset process
   * - Recovery after system downtime
   * - Manual execution if cron job failed
   *
   * WARNING: This should only be used by administrators.
   * Consider adding additional authorization checks (e.g., admin role only)
   */
  @Post('admin/trigger-reset')
  @HttpCode(HttpStatus.OK)
  async triggerDailyReset() {
    return this.dailyResetService.triggerManualReset();
  }

  /**
   * GET /inventory/admin/reset-status - Get daily reset job status
   *
   * Returns:
   * - Job enabled status
   * - Cron schedule
   * - Timezone
   * - Last snapshot information
   * - Next scheduled run time
   */
  @Get('admin/reset-status')
  async getResetStatus() {
    return this.dailyResetService.getResetStatus();
  }

  /**
   * GET /inventory/admin/check-dates - Check inventory dates in database
   *
   * Returns list of dates with inventory records for debugging
   */
  @Get('admin/check-dates')
  async checkInventoryDates() {
    return this.dailyResetService.checkInventoryDates();
  }

  // ==================== STOCK VALIDATION ====================

  /**
   * POST /inventory/check-stock - Check stock availability for order items
   *
   * This endpoint validates stock based on invoice date.
   * - SAME_DAY orders: Blocks if insufficient stock
   * - FUTURE_DATE orders: Shows warning but allows proceed
   * - PAST_DATE orders: Historical validation only
   *
   * Request body:
   * {
   *   "invoiceDate": "2025-10-20",
   *   "orderItems": [
   *     { "productCodeId": 1, "quantity": 100 },
   *     { "productCodeId": 2, "quantity": 50 }
   *   ]
   * }
   *
   * Response:
   * {
   *   "isValid": true/false,
   *   "shouldBlock": true/false,
   *   "validationType": "SAME_DAY" | "FUTURE_DATE" | "PAST_DATE",
   *   "items": [...],
   *   "summary": { totalItems, sufficientItems, insufficientItems, ... }
   * }
   */
  @RequirePermissions(`${Resource.INVENTORY}:${Action.VIEW}`)
  @Post('check-stock')
  @HttpCode(HttpStatus.OK)
  async checkStock(@Body() checkStockDto: CheckStockDto) {
    return this.dailyInventoryService.checkStock(
      checkStockDto.invoiceDate,
      checkStockDto.orderItems,
    );
  }
}
