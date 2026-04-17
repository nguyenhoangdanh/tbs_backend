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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { GetUser } from '../common/decorators/get-user.decorator';
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
@RequirePermissions('healthcare:view')
@ApiBearerAuth('JWT-auth')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  private resolveCompanyId(user: any, queryCompanyId?: string): string | undefined {
    const isSuperAdmin = user?.roles?.some((r: any) => r?.roleDefinition?.code === 'SUPERADMIN');
    return isSuperAdmin ? (queryCompanyId ?? undefined) : (user?.companyId ?? undefined);
  }

  // ==================== MEDICINE CATEGORY ENDPOINTS ====================

  @Get('categories')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get all medicine categories' })
  @ApiResponse({
    status: 200,
    description: 'Categories retrieved successfully',
  })
  async getCategories() {
    return this.inventoryService.getMedicineCategories();
  }

  @Post('categories')
  @RequirePermissions('healthcare:create')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Create new medicine category' })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async createCategory(@Body() data: CreateMedicineCategoryDto) {
    return this.inventoryService.createMedicineCategory(data);
  }

  @Patch('categories/:id')
  @RequirePermissions('healthcare:update')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Update medicine category' })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async updateCategory(
    @Param('id') id: string,
    @Body() data: UpdateMedicineCategoryDto,
  ) {
    return this.inventoryService.updateMedicineCategory(id, data);
  }

  @Delete('categories/:id')
  @RequirePermissions('healthcare:update')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Delete medicine category (soft delete)' })
  async deleteCategory(@Param('id') id: string) {
    return this.inventoryService.deleteMedicineCategory(id);
  }

  // ==================== INVENTORY TRANSACTION ENDPOINTS ====================

  @Post('transactions')
  @RequirePermissions('healthcare:create')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({
    summary: 'Create inventory transaction (import/export/adjustment)',
  })
  @ApiResponse({
    status: 201,
    description: 'Transaction created and inventory updated',
  })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async createTransaction(@Body() data: CreateInventoryTransactionDto, @GetUser() user: any) {
    let companyId = this.resolveCompanyId(user);
    if (companyId === undefined) {
      companyId = data.companyId;
      if (!companyId) throw new BadRequestException('SUPERADMIN must specify companyId for this operation');
    }
    return this.inventoryService.createInventoryTransaction({
      ...data,
      createdById: user?.id ?? data.createdById,
      companyId,
    });
  }

  @Get('transactions')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get inventory transaction history' })
  @ApiResponse({
    status: 200,
    description: 'Transactions retrieved successfully',
  })
  async getTransactions(
    @Query('medicineId') medicineId?: string,
    @Query('type') type?: InventoryTransactionTypeDto,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @GetUser() user?: any,
    @Query('companyId') queryCompanyId?: string,
  ) {
    const companyId = this.resolveCompanyId(user, queryCompanyId);
    return this.inventoryService.getInventoryTransactions(medicineId, type, startDate, endDate, companyId);
  }

  // ==================== BULK IMPORT ENDPOINTS ====================

  @Post('bulk-import')
  @RequirePermissions('healthcare:create')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({
    summary: 'Bulk import inventory data from Excel',
    description:
      'Import medicine inventory data parsed from Excel file. Frontend should parse Excel using ExcelJS first.',
  })
  @ApiResponse({ status: 201, description: 'Bulk import completed' })
  // ❌ TẮT ValidationPipe để tránh làm tròn số thập phân
  // ValidationPipe với @IsNumber() + enableImplicitConversion làm mất độ chính xác
  async bulkImport(@Body() data: any, @GetUser() user: any) {
    console.log('📥 Bulk import request received');
    console.log('📊 Data summary:', {
      month: data.month,
      year: data.year,
      medicinesCount: data.medicines?.length || 0,
      sampleMedicine: data.medicines?.[3]
        ? {
            name: data.medicines[3].name,
            openingTotalAmount: data.medicines[3].openingTotalAmount,
            closingTotalAmount: data.medicines[3].closingTotalAmount,
            monthlyImportAmount: data.medicines[3].monthlyImportAmount,
            monthlyExportAmount: data.medicines[3].monthlyExportAmount,
            openingAmountType: typeof data.medicines[3].openingTotalAmount,
            closingAmountType: typeof data.medicines[3].closingTotalAmount,
            hasOpeningAmount:
              data.medicines[3].openingTotalAmount !== undefined,
            hasClosingAmount:
              data.medicines[3].closingTotalAmount !== undefined,
          }
        : null,
    });

    // Manual validation
    if (!data.month || !data.year || !Array.isArray(data.medicines)) {
      throw new Error(
        'Invalid request: month, year, and medicines array are required',
      );
    }

    let companyId = this.resolveCompanyId(user);
    if (companyId === undefined) {
      companyId = data.companyId;
      if (!companyId) throw new BadRequestException('SUPERADMIN must specify companyId for this operation');
    }

    try {
      const result = await this.inventoryService.bulkImportInventory({ ...data, companyId });
      console.log('✅ Bulk import completed successfully');
      return result;
    } catch (error) {
      console.error('❌ Bulk import failed:', error);
      console.error('Stack trace:', error.stack);
      throw error;
    }
  }

  @Post('simplified-import')
  @RequirePermissions('healthcare:create')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({
    summary: 'Simplified bulk import (13-column template)',
    description: `
      Import medicine inventory using simplified 13-column template.
      User only inputs: Medicine info + Import transactions + Suggested purchases.
      System auto-calculates: Opening balance, Export, Closing balance based on prescription data.
    `,
  })
  @ApiResponse({ status: 201, description: 'Simplified import completed' })
  async simplifiedImport(@Body() data: any, @GetUser() user: any) {
    // Manual validation
    if (!data.month || !data.year || !Array.isArray(data.medicines)) {
      throw new Error(
        'Invalid request: month, year, and medicines array are required',
      );
    }

    let companyId = this.resolveCompanyId(user);
    if (companyId === undefined) {
      companyId = data.companyId;
      if (!companyId) throw new BadRequestException('SUPERADMIN must specify companyId for this operation');
    }

    try {
      const result = await this.inventoryService.simplifiedBulkImport({ ...data, companyId });
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
  @ApiResponse({
    status: 200,
    description: 'Monthly report retrieved successfully',
  })
  async getMonthlyReport(@Query() params: GetInventoryReportDto, @GetUser() user?: any, @Query('companyId') queryCompanyId?: string) {
    const companyId = this.resolveCompanyId(user, queryCompanyId);
    return this.inventoryService.getInventoryReport({ ...params, companyId });
  }

  @Get('reports/yearly/:year')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get yearly inventory report (all months)' })
  @ApiResponse({
    status: 200,
    description: 'Yearly report retrieved successfully',
  })
  async getYearlyReport(
    @Param('year') year: string,
    @Query('categoryId') categoryId?: string,
    @GetUser() user?: any,
    @Query('companyId') queryCompanyId?: string,
  ) {
    const companyId = this.resolveCompanyId(user, queryCompanyId);
    return this.inventoryService.getYearlyInventoryReport(parseInt(year), categoryId, companyId);
  }

  @Get('reports/detailed-yearly')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({
    summary: 'Get detailed yearly inventory with month-by-month breakdown',
    description:
      'Returns inventory data with previous year closing, monthly import/export breakdown (1-12), and totals',
  })
  @ApiResponse({
    status: 200,
    description: 'Detailed yearly inventory retrieved successfully',
  })
  async getDetailedYearlyInventory(
    @Query() params: { month: string; year: string; categoryId?: string; companyId?: string },
    @GetUser() user?: any,
  ) {
    const companyId = this.resolveCompanyId(user, params.companyId);
    return this.inventoryService.getDetailedYearlyInventory({
      month: parseInt(params.month),
      year: parseInt(params.year),
      categoryId: params.categoryId,
      companyId,
    });
  }

  // ==================== STOCK MANAGEMENT ENDPOINTS ====================

  @Get('stock/alerts')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get stock alerts (low stock & expiring items)' })
  @ApiResponse({
    status: 200,
    description: 'Stock alerts retrieved successfully',
  })
  async getStockAlerts(@Query() params: StockAlertDto, @GetUser() user?: any, @Query('companyId') queryCompanyId?: string) {
    const companyId = this.resolveCompanyId(user, queryCompanyId);
    return this.inventoryService.getStockAlerts({ ...params, companyId });
  }

  @Get('stock/current')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get current stock of all medicines' })
  @ApiResponse({
    status: 200,
    description: 'All current stock retrieved successfully',
  })
  async getAllCurrentStock(@GetUser() user?: any, @Query('companyId') queryCompanyId?: string) {
    const companyId = this.resolveCompanyId(user, queryCompanyId);
    return this.inventoryService.getAllCurrentStock(companyId);
  }

  @Get('stock/:medicineId/current')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get current stock of a medicine' })
  @ApiResponse({
    status: 200,
    description: 'Current stock retrieved successfully',
  })
  async getCurrentStock(@Param('medicineId') medicineId: string, @GetUser() user?: any, @Query('companyId') queryCompanyId?: string) {
    const companyId = this.resolveCompanyId(user, queryCompanyId);
    return this.inventoryService.getCurrentStock(medicineId, companyId);
  }

  @Patch('balance')
  @RequirePermissions('healthcare:update')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({
    summary: 'Update inventory balance manually',
    description: 'Manually update opening balance, suggested purchase, etc.',
  })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async updateBalance(@Body() data: UpdateInventoryBalanceDto) {
    return this.inventoryService.updateInventoryBalanceManual(data);
  }

  @Post('recalculate-balances')
  @RequirePermissions('healthcare:create')
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiOperation({
    summary: 'Recalculate all inventory balances from scratch',
    description:
      'One-time repair: recomputes closing[M]=opening[M]+import-export, opening[M+1]=closing[M], and yearly accumulators for ALL medicines from their first record. Use after data migration or logic upgrades.',
  })
  @ApiResponse({ status: 200, description: 'Recalculation completed' })
  async recalculateAllBalances(@GetUser() user?: any, @Query('companyId') queryCompanyId?: string) {
    const companyId = this.resolveCompanyId(user, queryCompanyId);
    const result = await this.inventoryService.recalculateAndInitialize(companyId);
    return {
      success: true,
      message: `Recalculated ${result.records} records across ${result.medicines} medicines${result.initialized > 0 ? `, initialized ${result.initialized} records for next month` : ''}`,
      data: result,
    };
  }

  @Post('initialize-month')
  @RequirePermissions('healthcare:create')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({
    summary: 'Initialize a new month from previous closing balance',
    description:
      'Creates inventory records for all active medicines for the given month with opening = previous month closing, all monthly quantities = 0. Skips medicines that already have a record for this month.',
  })
  @ApiResponse({ status: 200, description: 'Month initialized' })
  async initializeMonth(@Body() body: { month: number; year: number }, @GetUser() user: any) {
    const { month, year } = body;
    if (!month || !year || month < 1 || month > 12) {
      throw new BadRequestException('Invalid month or year');
    }
    let companyId = this.resolveCompanyId(user);
    if (companyId === undefined) {
      companyId = body['companyId'];
      if (!companyId) throw new BadRequestException('SUPERADMIN must specify companyId for this operation');
    }
    const result = await this.inventoryService.initializeMonth(month, year, companyId);
    return {
      success: true,
      message: `Initialized ${result.created} records for ${month}/${year} (${result.skipped} skipped)`,
      data: result,
    };
  }

  @Post('import-from-excel')
  @RequirePermissions('healthcare:create')
  @Roles('MEDICAL_STAFF', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({
    summary: 'Import inventory data from Excel file',
    description:
      'Upload Excel file with inventory data. Auto-detects month/year from title format: "QT THUỐC THÁNG XX NĂM YYYY _ ĐỀ NGHỊ MUA THUỐC THÁNG YY NĂM YYYY"',
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
  async importFromExcel(
    @UploadedFile() file: Express.Multer.File,
    @GetUser() user: any,
    @Query('companyId') queryCompanyId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (!file.originalname.match(/\.(xlsx|xls)$/)) {
      throw new BadRequestException(
        'Only Excel files (.xlsx, .xls) are allowed',
      );
    }

    let companyId = this.resolveCompanyId(user, queryCompanyId);

    try {
      const result = await this.inventoryService.importFromExcelFile(
        file.buffer,
        companyId,
      );
      return {
        success: true,
        message: 'Import completed successfully',
        data: result,
      };
    } catch (error) {
      throw new BadRequestException(`Import failed: ${error.message}`);
    }
  }

  // ==================== CANCEL / DELETE TRANSACTION ====================

  @Patch('transactions/:id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERADMIN')
  @ApiOperation({ summary: 'Cancel an inventory transaction and reverse inventory balance' })
  @ApiResponse({ status: 200, description: 'Transaction cancelled and inventory reversed' })
  @ApiResponse({ status: 400, description: 'Transaction already cancelled' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async cancelTransaction(
    @Param('id') id: string,
    @Body() body: { cancelReason?: string },
    @GetUser() user: any,
  ) {
    const result = await this.inventoryService.cancelInventoryTransaction(
      id,
      user.id,
      body.cancelReason,
    );
    return { success: true, data: result };
  }

  @Delete('transactions/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERADMIN')
  @ApiOperation({ summary: 'Delete an inventory transaction record (no balance change)' })
  @ApiResponse({ status: 200, description: 'Transaction deleted' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async deleteTransaction(@Param('id') id: string) {
    await this.inventoryService.deleteInventoryTransaction(id);
    return { success: true, message: 'Transaction deleted' };
  }
}
