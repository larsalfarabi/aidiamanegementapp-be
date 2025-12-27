import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, SelectQueryBuilder } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';
import { ProductionReportFilterDto } from '../dto/production-report.dto';
import { ProductionMaterialUsage } from '../../production/entities/production-material-usage.entity';
import { ProductCategories } from '../../products/entity/product_categories.entity';
import { Products } from '../../products/entity/products.entity';
import { ProductionFormulas } from '../../production/entities/production-formulas.entity';
import { FormulaMaterials } from '../../production/entities/formula-materials.entity';
import { ProductionBatches } from '../../production/entities/production-batches.entity';

export interface MaterialUsageSummary {
  code: string;
  name: string;
  unit: string;
  mainCategory: string;
  subCategory: string;
  productName: string; 
  totalUsage: number;
}

@Injectable()
export class ProductionReportsService {
  constructor(
    @InjectRepository(ProductionMaterialUsage)
    private readonly materialUsageRepo: Repository<ProductionMaterialUsage>,
    @InjectRepository(ProductCategories)
    private readonly categoryRepo: Repository<ProductCategories>,
    @InjectRepository(Products)
    private readonly productRepo: Repository<Products>,
    @InjectRepository(ProductionFormulas)
    private readonly formulaRepo: Repository<ProductionFormulas>,
    @InjectRepository(FormulaMaterials)
    private readonly formulaMaterialRepo: Repository<FormulaMaterials>,
    @InjectRepository(ProductionBatches)
    private readonly batchRepo: Repository<ProductionBatches>,
  ) {}

  async getMaterialUsageSummary(
    filter: ProductionReportFilterDto,
  ): Promise<MaterialUsageSummary[]> {
    const query = this.materialUsageRepo
      .createQueryBuilder('usage')
      .leftJoin('usage.batch', 'batch')
      .leftJoin('usage.materialProductCode', 'mpc')
      .leftJoin('mpc.product', 'p')
      .leftJoin('mpc.category', 'mainCat') // Main Category (Bahan Baku, dll)
      .leftJoin('batch.formula', 'formula')
      .leftJoin('formula.product', 'finishedProduct')
      .leftJoin('finishedProduct.category', 'subCat') // Sub Category (Buffet, Premium, etc)
      .select([
        'mpc.productCode AS code',
        'p.name AS name',
        'usage.unit AS unit',
        'mainCat.name AS mainCategory',
        'subCat.name AS subCategory',
        'finishedProduct.name AS productName',
        'SUM(COALESCE(usage.actualQuantity, usage.plannedQuantity)) AS totalUsage',
        'SUM(usage.totalCost) AS totalCost',
      ])
      .where('batch.productionDate BETWEEN :startDate AND :endDate', {
        startDate: filter.startDate,
        endDate: filter.endDate,
      })
      .groupBy('mpc.productCode')
      .addGroupBy('p.name')
      .addGroupBy('usage.unit')
      .addGroupBy('mainCat.name')
      .addGroupBy('subCat.name')
      .addGroupBy('finishedProduct.name')
      .orderBy('finishedProduct.name', 'ASC')
      .addOrderBy('mpc.productCode', 'ASC');

    if (filter.search) {
      query.andWhere(
        '(p.name LIKE :search OR mpc.productCode LIKE :search)',
        { search: `%${filter.search}%` },
      );
    }

    if (filter.subCategoryId) {
      query.andWhere('subCat.id = :subCategoryId', {
        subCategoryId: filter.subCategoryId,
      });
    }

    const rawData = await query.getRawMany();

    return rawData.map((item: any) => ({
      code: item.code,
      name: item.name,
      unit: item.unit,
      mainCategory: item.mainCategory,
      subCategory: item.subCategory,
      productName: item.productName,
      totalUsage: Number(item.totalUsage),
      totalCost: Number(item.totalCost),
    }));
  }

  async generateMaterialUsageExcel(
    filter: ProductionReportFilterDto,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    
    // 1. Fetch Sub Categories (CategoryType.SUB = 'SUB')
    // Note: Adjust 'SUB' if your enum is strict. Based on common sense for now.
    const subCategories = await this.categoryRepo.find({
      where: { categoryType: 'SUB' as any }, 
      order: { name: 'ASC' },
    });

    if (subCategories.length === 0) {
       const sheet = workbook.addWorksheet('Report');
       sheet.getCell('A1').value = 'No Data Categories Found';
       return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
    }

    // Dates for columns
    const startDate = new Date(filter.startDate);
    const endDate = new Date(filter.endDate);
    const dates: string[] = [];
    const dateLabels: string[] = [];
    for (
      let d = new Date(startDate);
      d <= endDate;
      d.setDate(d.getDate() + 1)
    ) {
      dates.push(d.toISOString().split('T')[0]); // YYYY-MM-DD
      dateLabels.push(String(d.getDate())); // 1, 2, 3...
    }

    // 2. Loop Sheets
    for (const subCat of subCategories) {
      const sheetName = subCat.name.replace(/[\\/?*[\]]/g, '').substring(0, 30); // Sanitize sheet name
      const sheet = workbook.addWorksheet(sheetName);
      
      // -- HEADER SETUP --
      sheet.getColumn(1).width = 5;  // No
      sheet.getColumn(2).width = 15; // Code
      sheet.getColumn(3).width = 40; // Material Name
      sheet.getColumn(4).width = 8;  // Unit

      // Date Columns
      let colIdx = 5;
      dates.forEach(() => {
        sheet.getColumn(colIdx).width = 4;
        colIdx++;
      });
      sheet.getColumn(colIdx).width = 10; // Total

      // Title Row
      sheet.mergeCells(1, 1, 1, 4 + dates.length + 1);
      const titleCell = sheet.getCell(1, 1);
      titleCell.value = `Laporan Pemakaian Bahan - ${subCat.name}`;
      titleCell.font = { bold: true, size: 14 };
      titleCell.alignment = { horizontal: 'center' };

      // Header Row
      const headerRow = sheet.getRow(3);
      headerRow.values = ['No', 'Kode', 'Deskripsi', 'Unit', ...dateLabels, 'Jumlah'];
      headerRow.font = { bold: true };
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
      headerRow.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFEEEEEE' }, // Light Gray
        };
      });

      // -- CONTENT GENERATION --
      
      // 3. Fetch Products in this SubCategory
      const products = await this.productRepo.find({
        where: { category: { id: subCat.id } },
        order: { name: 'ASC' },
      });

      let currentRowIdx = 4;
      let productNo = 1;

      for (const product of products) {
        // 4. Fetch Master Formula Materials (Pattern)
        // Find latest active formula
        const formulas = await this.formulaRepo.find({
          where: { productId: product.id, isActive: true },
          order: { version: 'DESC' },
          take: 1,
          relations: ['materials', 'materials.materialProductCode', 'materials.materialProductCode.product'],
        });
        
        const activeFormula = formulas[0];
        
        // Build "Master List" of materials from formula
        const materialMap = new Map<string, { code: string, name: string, unit: string }>();
        const formulaMaterialCodes: string[] = [];

        if (activeFormula && activeFormula.materials) {
            activeFormula.materials.sort((a, b) => a.sequence - b.sequence);
            activeFormula.materials.forEach(fm => {
                const pCode = fm.materialProductCode.productCode;
                if (!materialMap.has(pCode)) {
                    materialMap.set(pCode, {
                        code: pCode,
                        name: fm.materialProductCode.product.name,
                        unit: fm.unit
                    });
                    formulaMaterialCodes.push(pCode);
                }
            });
        }

        // 5. Fetch Actual Usage Data for this Product + Date Range
      // 5. Fetch Actual Usage Data for this Product + Date Range
      // FIX: Use DATE_FORMAT to force raw string return "YYYY-MM-DD" bypassing timezone/driver parsing issues
      const usageData = await this.materialUsageRepo
          .createQueryBuilder('usage')
          .leftJoin('usage.batch', 'batch')
          .leftJoin('batch.formula', 'formula')
          .leftJoin('usage.materialProductCode', 'mpc')
          .select([
              "DATE_FORMAT(batch.productionDate, '%Y-%m-%d') as pDate",
              'mpc.productCode as mCode',
              'SUM(COALESCE(usage.actualQuantity, usage.plannedQuantity)) as totalQty'
          ])
          .where('formula.productId = :pid', { pid: product.id })
          .andWhere('batch.productionDate BETWEEN :start AND :end', { start: filter.startDate, end: filter.endDate })
          .groupBy('pDate')
          .addGroupBy('mCode')
          .getRawMany();
      
      // 5b. Fetch Actual Concentrate (Batch Output) for this Product + Date Range
      // FIX: Use DATE_FORMAT here as well
      const batchData = await this.batchRepo
           .createQueryBuilder('batch')
           .select([
               "DATE_FORMAT(batch.productionDate, '%Y-%m-%d') as pDate",
               'SUM(batch.actualConcentrate) as totalConcentrate'
           ])
           .where('batch.productId = :pid', { pid: product.id })
           .andWhere('batch.productionDate BETWEEN :start AND :end', { start: filter.startDate, end: filter.endDate })
           .groupBy('pDate')
           .getRawMany();

        const concentrateMap = new Map<string, number>();
        batchData.forEach((row: any) => {
             // pDate is now guaranteed to be a string "YYYY-MM-DD"
             const dateKey = String(row.pDate);
             concentrateMap.set(dateKey, Number(row.totalConcentrate));
        });
        
        // Transform usageData into Map<DateString, Map<MaterialCode, number>>
        const usageMap = new Map<string, Map<string, number>>(); // Date -> Material -> Qty
        
        usageData.forEach((row: any) => {
             const dateKey = String(row.pDate);
             
             if (!usageMap.has(dateKey)) {
                 usageMap.set(dateKey, new Map());
             }
             usageMap.get(dateKey)!.set(row.mCode, Number(row.totalQty));
        });

        // Skip products with no formula AND no usage AND no concentrate? 
        if (formulaMaterialCodes.length === 0 && usageData.length === 0 && batchData.length === 0) {
            continue; 
        }

        // -- RENDER PRODUCT HEADER --
        const productRow = sheet.getRow(currentRowIdx);
        productRow.getCell(1).value = productNo;
        productRow.getCell(2).value = product.id; // Or internal code if available
        productRow.getCell(3).value = product.name;
        
        // Styling Yellow for Main Info (No, Code, Name)
        [1, 2, 3, 4].forEach(col => {
             const cell = productRow.getCell(col);
             cell.fill = {
                 type: 'pattern',
                 pattern: 'solid',
                 fgColor: { argb: 'FFFFCCCC' }, // Light Yellow
             };
             cell.font = { bold: true };
             cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        });

        // Loop Date Columns for Product Row -> Fill with actualConcentrate (Pink)
        let prodDateColIdx = 5;
        let prodRowTotal = 0;

        dates.forEach(dateStr => {
             const concentrate = concentrateMap.get(dateStr) || 0;
             const cell = productRow.getCell(prodDateColIdx);
             
             if (concentrate > 0) {
                 cell.value = concentrate;
                 prodRowTotal += concentrate;
             } else {
                 cell.value = '-';
             }

             // Pink Cell for Concentrate
             cell.fill = {
                 type: 'pattern',
                 pattern: 'solid',
                 fgColor: { argb: 'FFFFC0CB' }, // Pink
             };
             cell.font = { bold: true };
             cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
             cell.alignment = { horizontal: 'center' };

             prodDateColIdx++;
        });

        // Product Row Total
        const prodTotalCell = productRow.getCell(prodDateColIdx);
        prodTotalCell.value = prodRowTotal;
        prodTotalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC0CB' } }; // Pink
        prodTotalCell.font = { bold: true };
        prodTotalCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        
        currentRowIdx++;
        productNo++;

        // -- RENDER MATERIALS --
        let materialNo = 1;
        
        for (const mCode of formulaMaterialCodes) {
            const matInfo = materialMap.get(mCode);
            const matRow = sheet.getRow(currentRowIdx);
            
            matRow.getCell(1).value = materialNo;
            matRow.getCell(2).value = mCode;
            matRow.getCell(3).value = matInfo?.name;
            matRow.getCell(4).value = matInfo?.unit;
            
            let dateColIdx = 5;
            let rowTotal = 0;
            
            dates.forEach(dateStr => {
                 const dayUsage = usageMap.get(dateStr)?.get(mCode) || 0;
                 if (dayUsage > 0) {
                     matRow.getCell(dateColIdx).value = dayUsage;
                     rowTotal += dayUsage;
                 } else {
                     matRow.getCell(dateColIdx).value = '-';
                 }
                 dateColIdx++;
            });
            
            matRow.getCell(dateColIdx).value = rowTotal; // Total column
            matRow.getCell(dateColIdx).font = { bold: true };
            
            // Borders
            matRow.eachCell((cell, colNumber) => {
               if (colNumber <= 4 + dates.length + 1) {
                cell.border = {
                    top: { style: 'dotted' },
                    left: { style: 'thin' },
                    right: { style: 'thin' },
                    bottom: { style: 'dotted' }
                };
                cell.alignment = { vertical: 'middle', horizontal: colNumber > 4 ? 'center' : 'left' };
                if (colNumber === 1 || colNumber === 4) cell.alignment.horizontal = 'center';
               }
            });
            
            currentRowIdx++;
            materialNo++;
        }
        
        // Gap Row
        currentRowIdx++;
      } // End Products Loop
      
    } // End SubCategories Loop

    return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
  }
}
