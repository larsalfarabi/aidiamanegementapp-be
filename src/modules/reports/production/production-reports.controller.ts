import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtGuard } from '../../auth/guards/auth.guard';
import { ProductionReportsService } from './production-reports.service';
import { ProductionReportFilterDto } from '../dto/production-report.dto';

@ApiTags('Reports - Production')
@Controller('reports/production')
@UseGuards(JwtGuard)
@ApiBearerAuth()
export class ProductionReportsController {
  constructor(private readonly productionReportsService: ProductionReportsService) {}

  @Get('material-usage/summary')
  @ApiOperation({ summary: 'Get material usage summary for UI' })
  async getMaterialUsageSummary(@Query() filter: ProductionReportFilterDto) {
    return this.productionReportsService.getMaterialUsageSummary(filter);
  }

  @Get('material-usage/export')
  @ApiOperation({ summary: 'Export material usage report to Excel' })
  async exportMaterialUsageExcel(
    @Query() filter: ProductionReportFilterDto,
    @Res() res: Response,
  ) {
    const buffer = await this.productionReportsService.generateMaterialUsageExcel(filter);

    const filename = `Laporan_Pemakaian_Bahan_${filter.startDate}_${filter.endDate}.xlsx`;

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename=${filename}`,
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }
}
