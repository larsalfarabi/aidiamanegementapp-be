import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtGuard } from '../auth/guards/auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermissions } from '../../common/decorator/permission.decorator';
import { Resource, Action } from '../../common/enums/resource.enum';
import { ProductionFormulaService, ProductionBatchService } from './services';
import {
  CreateFormulaDto,
  UpdateFormulaDto,
  CreateBatchDto,
  RecordStageDto,
  FilterFormulaDto,
  FilterBatchDto,
  CompleteBatchDto,
  CheckMaterialStockDto,
} from './dto';
import { Pagination } from 'src/common/decorator/pagination.decorator';

@Controller('production')
@UseGuards(JwtGuard, PermissionGuard)
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
  @RequirePermissions(`${Resource.FORMULA}:${Action.CREATE}`)
  @Post('formulas')
  async createFormula(@Body() dto: CreateFormulaDto, @Req() req: any) {
    const userId = req.user?.id || 1;
    return this.formulaService.createFormula(dto, userId);
  }

  /**
   * GET /production/formulas
   * Get all formulas with pagination and filters
   */
  @RequirePermissions(`${Resource.FORMULA}:${Action.VIEW}`)
  @Get('formulas')
  async getFormulas(@Pagination() filterDto: FilterFormulaDto) {
    return this.formulaService.getFormulas(filterDto);
  }

  /**
   * GET /production/formulas/:id
   * Get formula by ID
   */
  @RequirePermissions(`${Resource.FORMULA}:${Action.VIEW}`)
  @Get('formulas/:id')
  async getFormulaById(@Param('id', ParseIntPipe) id: number) {
    return this.formulaService.getFormulaById(id);
  }

  /**
   * GET /production/formulas/active/:productCodeId
   * Get active formula for a product
   */
  @RequirePermissions(`${Resource.FORMULA}:${Action.VIEW}`)
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
  @RequirePermissions(`${Resource.FORMULA}:${Action.UPDATE}`)
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
  @RequirePermissions(`${Resource.FORMULA}:${Action.DELETE}`)
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
   * POST /production/batches/check-material-stock
   * Check material stock availability before batch creation
   * Human-Centered Design: Clear feedback with actionable information
   */
  @RequirePermissions(`${Resource.BATCH}:${Action.CREATE}`)
  @Post('batches/check-material-stock')
  async checkMaterialStock(@Body() dto: CheckMaterialStockDto) {
    return this.batchService.checkMaterialStock(dto);
  }

  /**
   * POST /production/batches
   * Create new production batch
   */
  @RequirePermissions(`${Resource.BATCH}:${Action.CREATE}`)
  @Post('batches')
  async createBatch(@Body() dto: CreateBatchDto, @Req() req: any) {
    const userId = req.user?.id || 1;
    return this.batchService.createBatch(dto, userId);
  }

  /**
   * POST /production/batches/:id/start
   * Start production batch
   */
  @RequirePermissions(`${Resource.BATCH}:${Action.START}`)
  @Post('batches/:id/start')
  async startBatch(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const userId = req.user?.id || 1;
    return this.batchService.startBatch(id, userId);
  }

  /**
   * POST /production/batches/:id/record-stage
   * Record production stage
   */
  @RequirePermissions(`${Resource.BATCH}:${Action.UPDATE}`)
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
  @RequirePermissions(`${Resource.BATCH}:${Action.UPDATE}`)
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
  @RequirePermissions(`${Resource.BATCH}:${Action.VIEW}`)
  @Get('batches')
  async getBatches(@Pagination() filterDto: FilterBatchDto) {
    return this.batchService.getBatches(filterDto);
  }

  /**
   * GET /production/batches/:id
   * Get batch by ID
   */
  @RequirePermissions(`${Resource.BATCH}:${Action.VIEW}`)
  @Get('batches/:id')
  async getBatchById(@Param('id', ParseIntPipe) id: number) {
    return this.batchService.getBatchById(id);
  }

  /**
   * POST /production/batches/:id/cancel
   * Cancel batch
   */
  @RequirePermissions(`${Resource.BATCH}:${Action.CANCEL}`)
  @Post('batches/:id/cancel')
  async cancelBatch(
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    const userId = req.user?.id || 1;
    return this.batchService.cancelBatch(id, reason, userId);
  }

  /**
   * PATCH /production/batches/:id/complete
   * Complete production batch (REDESIGNED - Dec 2024)
   *
   * Purpose:
   * - Simplified single-endpoint workflow (replaces startProduction + recordStage)
   * - Support multi-size bottling from single concentrate batch
   * - Integrate material tracking with inventory transactions
   * - Enable draft mode for delayed data entry
   *
   * Request Body:
   * - actualConcentrate: Actual concentrate produced (liters)
   * - bottlingOutputs: Array of { productCodeId, quantity, wasteQuantity, notes }
   * - materialUsages: Array of { materialProductCodeId, actualQuantity, unit, unitCost, notes }
   * - isDraft: true = save as DRAFT, false = finalize as COMPLETED
   * - productionNotes: General production notes
   * - performedBy: Staff name
   *
   * Example:
   * ```json
   * {
   *   "actualConcentrate": 40,
   *   "bottlingOutputs": [
   *     { "productCodeId": 101, "quantity": 60, "wasteQuantity": 5 },
   *     { "productCodeId": 102, "quantity": 40, "wasteQuantity": 2 }
   *   ],
   *   "materialUsages": [...],
   *   "isDraft": false
   * }
   * ```
   */
  @RequirePermissions(`${Resource.BATCH}:${Action.UPDATE}`)
  @Patch('batches/:id/complete')
  async completeBatch(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CompleteBatchDto,
    @Req() req: any,
  ) {
    const userId = req.user?.id || 1;
    return this.batchService.completeBatch(id, dto, userId);
  }
}
