import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtGuard } from '../auth/guards/auth.guard';
import { ProductionFormulaService, ProductionBatchService } from './services';
import {
  CreateFormulaDto,
  UpdateFormulaDto,
  CreateBatchDto,
  RecordStageDto,
  FilterFormulaDto,
  FilterBatchDto,
} from './dto';

@Controller('production')
@UseGuards(JwtGuard)
export class ProductionController {
  constructor(
    private readonly formulaService: ProductionFormulaService,
    private readonly batchService: ProductionBatchService,
  ) {}

  // ==================== FORMULA ENDPOINTS ====================

  /**
   * POST /production/formulas
   * Create new production formula
   */
  @Post('formulas')
  async createFormula(@Body() dto: CreateFormulaDto, @Req() req: any) {
    const userId = req.user?.id || 1;
    return this.formulaService.createFormula(dto, userId);
  }

  /**
   * GET /production/formulas
   * Get all formulas with pagination and filters
   */
  @Get('formulas')
  async getFormulas(@Query() filterDto: FilterFormulaDto) {
    return this.formulaService.getFormulas(filterDto);
  }

  /**
   * GET /production/formulas/:id
   * Get formula by ID
   */
  @Get('formulas/:id')
  async getFormulaById(@Param('id', ParseIntPipe) id: number) {
    return this.formulaService.getFormulaById(id);
  }

  /**
   * GET /production/formulas/active/:productCodeId
   * Get active formula for a product
   */
  @Get('formulas/active/:productCodeId')
  async getActiveFormula(
    @Param('productCodeId', ParseIntPipe) productCodeId: number,
  ) {
    return this.formulaService.getActiveFormulaByProductId(productCodeId);
  }

  /**
   * PUT /production/formulas/:id
   * Update formula
   */
  @Put('formulas/:id')
  async updateFormula(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFormulaDto,
    @Req() req: any,
  ) {
    const userId = req.user?.id || 1;
    return this.formulaService.updateFormula(id, dto, userId);
  }

  /**
   * DELETE /production/formulas/:id
   * Deactivate formula
   */
  @Delete('formulas/:id')
  async deactivateFormula(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    const userId = req.user?.id || 1;
    return this.formulaService.deactivateFormula(id, userId);
  }

  // ==================== BATCH ENDPOINTS ====================

  /**
   * POST /production/batches
   * Create new production batch
   */
  @Post('batches')
  async createBatch(@Body() dto: CreateBatchDto, @Req() req: any) {
    const userId = req.user?.id || 1;
    return this.batchService.createBatch(dto, userId);
  }

  /**
   * POST /production/batches/:id/start
   * Start production batch
   */
  @Post('batches/:id/start')
  async startBatch(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const userId = req.user?.id || 1;
    return this.batchService.startBatch(id, userId);
  }

  /**
   * POST /production/batches/:id/record-stage
   * Record production stage
   */
  @Post('batches/:id/record-stage')
  async recordStage(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordStageDto,
    @Req() req: any,
  ) {
    const userId = req.user?.id || 1;
    return this.batchService.recordStage(id, dto, userId);
  }

  /**
   * POST /production/batches/:id/material-adjustments
   * Record material usage adjustments
   */
  @Post('batches/:id/material-adjustments')
  async recordMaterialAdjustments(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any, // TODO: Create proper DTO
    @Req() req: any,
  ) {
    const userId = req.user?.id || 1;
    return this.batchService.recordMaterialAdjustments(id, dto, userId);
  }

  /**
   * GET /production/batches
   * Get all batches with filters
   */
  @Get('batches')
  async getBatches(@Query() filterDto: FilterBatchDto) {
    return this.batchService.getBatches(filterDto);
  }

  /**
   * GET /production/batches/:id
   * Get batch by ID
   */
  @Get('batches/:id')
  async getBatchById(@Param('id', ParseIntPipe) id: number) {
    return this.batchService.getBatchById(id);
  }

  /**
   * POST /production/batches/:id/cancel
   * Cancel batch
   */
  @Post('batches/:id/cancel')
  async cancelBatch(
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    const userId = req.user?.id || 1;
    return this.batchService.cancelBatch(id, reason, userId);
  }
}
