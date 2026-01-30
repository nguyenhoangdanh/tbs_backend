import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { InventoryService } from './inventory.service';
import {
  CreateMedicineCategoryDto,
  UpdateMedicineCategoryDto,
  CreateInventoryTransactionDto,
  BulkImportInventoryDto,
  SimplifiedBulkImportDto,
  GetInventoryReportDto,
  UpdateInventoryBalanceDto,
  StockAlertDto,
  InventoryTransactionTypeDto,
} from './dto/inventory.dto';

@ApiTags('inventory')
@Controller('healthcare/inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // ==================== MEDICINE CATEGORY ENDPOINTS ====================

  @Get('categories')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get all medicine categories' })
  @ApiResponse({ status: 200, description: 'Categories retrieved successfully' })
  async getCategories() {
    return this.inventoryService.getMedicineCategories();
  }

  @Post('categories')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Create new medicine category' })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async createCategory(@Body() data: CreateMedicineCategoryDto) {
    return this.inventoryService.createMedicineCategory(data);
  }

  @Patch('categories/:id')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Update medicine category' })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async updateCategory(
    @Param('id') id: string,
    @Body() data: UpdateMedicineCategoryDto
  ) {
    return this.inventoryService.updateMedicineCategory(id, data);
  }

  @Delete('categories/:id')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Delete medicine category (soft delete)' })
  async deleteCategory(@Param('id') id: string) {
    return this.inventoryService.deleteMedicineCategory(id);
  }

  // ==================== INVENTORY TRANSACTION ENDPOINTS ====================

  @Post('transactions')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Create inventory transaction (import/export/adjustment)' })
  @ApiResponse({ status: 201, description: 'Transaction created and inventory updated' })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async createTransaction(@Body() data: CreateInventoryTransactionDto) {
    return this.inventoryService.createInventoryTransaction(data);
  }

  @Get('transactions')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get inventory transaction history' })
  @ApiResponse({ status: 200, description: 'Transactions retrieved successfully' })
  async getTransactions(
    @Query('medicineId') medicineId?: string,
    @Query('type') type?: InventoryTransactionTypeDto,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.inventoryService.getInventoryTransactions(
      medicineId,
      type,
      startDate,
      endDate
    );
  }

  // ==================== BULK IMPORT ENDPOINTS ====================

  @Post('bulk-import')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ 
    summary: 'Bulk import inventory data from Excel',
    description: 'Import medicine inventory data parsed from Excel file. Frontend should parse Excel using ExcelJS first.'
  })
  @ApiResponse({ status: 201, description: 'Bulk import completed' })
  // ❌ TẮT ValidationPipe để tránh làm tròn số thập phân
  // ValidationPipe với @IsNumber() + enableImplicitConversion làm mất độ chính xác
  async bulkImport(@Body() data: any) {
    console.log('📥 Bulk import request received');
    console.log('📊 Data summary:', {
      month: data.month,
      year: data.year,
      medicinesCount: data.medicines?.length || 0,
      sampleMedicine: data.medicines?.[3] ? {
        name: data.medicines[3].name,
        openingTotalAmount: data.medicines[3].openingTotalAmount,
        closingTotalAmount: data.medicines[3].closingTotalAmount,
        monthlyImportAmount: data.medicines[3].monthlyImportAmount,
        monthlyExportAmount: data.medicines[3].monthlyExportAmount,
        openingAmountType: typeof data.medicines[3].openingTotalAmount,
        closingAmountType: typeof data.medicines[3].closingTotalAmount,
        hasOpeningAmount: data.medicines[3].openingTotalAmount !== undefined,
        hasClosingAmount: data.medicines[3].closingTotalAmount !== undefined,
      } : null
    });
    
    // Manual validation
    if (!data.month || !data.year || !Array.isArray(data.medicines)) {
      throw new Error('Invalid request: month, year, and medicines array are required');
    }
    
    try {
      const result = await this.inventoryService.bulkImportInventory(data);
      console.log('✅ Bulk import completed successfully');
      return result;
    } catch (error) {
      console.error('❌ Bulk import failed:', error);
      console.error('Stack trace:', error.stack);
      throw error;
    }
  }

  @Post('simplified-import')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ 
    summary: 'Simplified bulk import (13-column template)',
    description: `
      Import medicine inventory using simplified 13-column template.
      User only inputs: Medicine info + Import transactions + Suggested purchases.
      System auto-calculates: Opening balance, Export, Closing balance based on prescription data.
    `
  })
  @ApiResponse({ status: 201, description: 'Simplified import completed' })
  async simplifiedImport(@Body() data: any) {
    // Manual validation
    if (!data.month || !data.year || !Array.isArray(data.medicines)) {
      throw new Error('Invalid request: month, year, and medicines array are required');
    }
    
    try {
      const result = await this.inventoryService.simplifiedBulkImport(data);
      return result;
    } catch (error) {
      console.error('❌ Simplified import failed:', error);
      console.error('Stack trace:', error.stack);
      throw error;
    }
  }

  // ==================== INVENTORY REPORT ENDPOINTS ====================

  @Get('reports/monthly')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get monthly inventory report' })
  @ApiResponse({ status: 200, description: 'Monthly report retrieved successfully' })
  async getMonthlyReport(@Query() params: GetInventoryReportDto) {
    return this.inventoryService.getInventoryReport(params);
  }

  @Get('reports/yearly/:year')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get yearly inventory report (all months)' })
  @ApiResponse({ status: 200, description: 'Yearly report retrieved successfully' })
  async getYearlyReport(
    @Param('year') year: string,
    @Query('categoryId') categoryId?: string
  ) {
    return this.inventoryService.getYearlyInventoryReport(
      parseInt(year),
      categoryId
    );
  }

  @Get('reports/detailed-yearly')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ 
    summary: 'Get detailed yearly inventory with month-by-month breakdown',
    description: 'Returns inventory data with previous year closing, monthly import/export breakdown (1-12), and totals'
  })
  @ApiResponse({ status: 200, description: 'Detailed yearly inventory retrieved successfully' })
  async getDetailedYearlyInventory(@Query() params: { month: string; year: string; categoryId?: string }) {
    return this.inventoryService.getDetailedYearlyInventory({
      month: parseInt(params.month),
      year: parseInt(params.year),
      categoryId: params.categoryId
    });
  }

  // ==================== STOCK MANAGEMENT ENDPOINTS ====================

  @Get('stock/alerts')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get stock alerts (low stock & expiring items)' })
  @ApiResponse({ status: 200, description: 'Stock alerts retrieved successfully' })
  async getStockAlerts(@Query() params: StockAlertDto) {
    return this.inventoryService.getStockAlerts(params);
  }

  @Get('stock/current')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get current stock of all medicines' })
  @ApiResponse({ status: 200, description: 'All current stock retrieved successfully' })
  async getAllCurrentStock() {
    return this.inventoryService.getAllCurrentStock();
  }

  @Get('stock/:medicineId/current')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get current stock of a medicine' })
  @ApiResponse({ status: 200, description: 'Current stock retrieved successfully' })
  async getCurrentStock(@Param('medicineId') medicineId: string) {
    return this.inventoryService.getCurrentStock(medicineId);
  }

  @Patch('balance')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ 
    summary: 'Update inventory balance manually',
    description: 'Manually update opening balance, suggested purchase, etc.'
  })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async updateBalance(@Body() data: UpdateInventoryBalanceDto) {
    return this.inventoryService.updateInventoryBalanceManual(data);
  }

  @Post('import-from-excel')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({
    summary: 'Import inventory data from Excel file',
    description: 'Upload Excel file with inventory data. Auto-detects month/year from title format: "QT THUỐC THÁNG XX NĂM YYYY _ ĐỀ NGHỊ MUA THUỐC THÁNG YY NĂM YYYY"'
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  @ApiResponse({ status: 200, description: 'Import completed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file or format' })
  async importFromExcel(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (!file.originalname.match(/\.(xlsx|xls)$/)) {
      throw new BadRequestException('Only Excel files (.xlsx, .xls) are allowed');
    }

    try {
      const result = await this.inventoryService.importFromExcelFile(file.buffer);
      return {
        success: true,
        message: 'Import completed successfully',
        data: result
      };
    } catch (error) {
      throw new BadRequestException(`Import failed: ${error.message}`);
    }
  }
}
