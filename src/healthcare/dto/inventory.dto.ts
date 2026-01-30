import { IsString, IsNumber, IsOptional, IsArray, ValidateNested, IsEnum, IsDateString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ========== MEDICINE CATEGORY DTOs ==========
export class CreateMedicineCategoryDto {
  @ApiProperty({ description: 'Category code', example: 'I' })
  @IsString()
  code: string;

  @ApiProperty({ description: 'Category name', example: 'NHÓM THUỐC HẠ SỐT, GIẢM ĐAU, CHỐNG VIÊM KHÔNG STEROID' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Sort order', default: 0 })
  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class UpdateMedicineCategoryDto {
  @ApiPropertyOptional({ description: 'Category code' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ description: 'Category name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Sort order' })
  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

// ========== INVENTORY TRANSACTION DTOs ==========
export enum InventoryTransactionTypeDto {
  IMPORT = 'IMPORT',
  EXPORT = 'EXPORT',
  ADJUSTMENT = 'ADJUSTMENT',
}

export class CreateInventoryTransactionDto {
  @ApiProperty({ description: 'Medicine ID' })
  @IsString()
  medicineId: string;

  @ApiProperty({ enum: InventoryTransactionTypeDto, description: 'Transaction type' })
  @IsEnum(InventoryTransactionTypeDto)
  type: InventoryTransactionTypeDto;

  @ApiProperty({ description: 'Quantity', example: 100 })
  @IsNumber()
  quantity: number;

  @ApiPropertyOptional({ description: 'Unit price (defaults to 0 if not provided)', example: 5000 })
  @IsOptional()
  @IsNumber()
  unitPrice?: number;

  @ApiPropertyOptional({ description: 'Transaction date - defaults to now' })
  @IsOptional()
  @IsDateString()
  transactionDate?: string;

  @ApiPropertyOptional({ description: 'Expiry date (for imports)' })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional({ description: 'Batch number (for imports)' })
  @IsOptional()
  @IsString()
  batchNumber?: string;

  @ApiPropertyOptional({ description: 'Supplier name (for imports)' })
  @IsOptional()
  @IsString()
  supplier?: string;

  @ApiPropertyOptional({ description: 'Reference type', example: 'PURCHASE_ORDER' })
  @IsOptional()
  @IsString()
  referenceType?: string;

  @ApiPropertyOptional({ description: 'Reference ID' })
  @IsOptional()
  @IsString()
  referenceId?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Created by user ID' })
  @IsOptional()
  @IsString()
  createdBy?: string;
}

// ========== BULK IMPORT DTOs (from Excel) ==========
export class ImportMedicineFromExcelDto {
  @ApiProperty({ description: 'STT - Row number', example: 1 })
  @IsNumber()
  stt: number;

  @ApiProperty({ description: 'Medicine name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Category code', example: 'I' })
  @IsOptional()
  @IsString()
  categoryCode?: string;

  @ApiPropertyOptional({ description: 'Route - UỐNG, NHỎ MẮT, BÔI, DÁN' })
  @IsOptional()
  @IsString()
  route?: string;

  @ApiPropertyOptional({ description: 'Strength/Hàm lượng', example: '500mg' })
  @IsOptional()
  @IsString()
  strength?: string;

  @ApiPropertyOptional({ description: 'Manufacturer/Nơi SX' })
  @IsOptional()
  @IsString()
  manufacturer?: string;

  @ApiPropertyOptional({ description: 'Units', example: 'viên' })
  @IsOptional()
  @IsString()
  units?: string;

  // Tồn đầu kỳ
  @ApiPropertyOptional({ description: 'Opening quantity' })
  @IsOptional()
  @IsNumber()
  openingQuantity?: number;

  @ApiPropertyOptional({ description: 'Opening unit price' })
  @IsOptional()
  @IsNumber()
  openingUnitPrice?: number;

  @ApiPropertyOptional({ description: 'Opening total amount (from Excel)' })
  @IsOptional()
  @IsNumber()
  openingTotalAmount?: number;

  // Phát sinh trong tháng - Nhập
  @ApiPropertyOptional({ description: 'Monthly import quantity' })
  @IsOptional()
  @IsNumber()
  monthlyImportQuantity?: number;

  @ApiPropertyOptional({ description: 'Monthly import unit price' })
  @IsOptional()
  @IsNumber()
  monthlyImportUnitPrice?: number;

  @ApiPropertyOptional({ description: 'Monthly import amount (from Excel)' })
  @IsOptional()
  @IsNumber()
  monthlyImportAmount?: number;

  // Phát sinh trong tháng - Xuất
  @ApiPropertyOptional({ description: 'Monthly export quantity' })
  @IsOptional()
  @IsNumber()
  monthlyExportQuantity?: number;

  @ApiPropertyOptional({ description: 'Monthly export unit price' })
  @IsOptional()
  @IsNumber()
  monthlyExportUnitPrice?: number;

  @ApiPropertyOptional({ description: 'Monthly export amount (from Excel)' })
  @IsOptional()
  @IsNumber()
  monthlyExportAmount?: number;

  // Tồn cuối kỳ
  @ApiPropertyOptional({ description: 'Closing quantity' })
  @IsOptional()
  @IsNumber()
  closingQuantity?: number;

  @ApiPropertyOptional({ description: 'Closing unit price' })
  @IsOptional()
  @IsNumber()
  closingUnitPrice?: number;

  @ApiPropertyOptional({ description: 'Closing total amount (from Excel)' })
  @IsOptional()
  @IsNumber()
  closingTotalAmount?: number;

  @ApiPropertyOptional({ description: 'Expiry date' })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  // Lũy kế năm - Nhập
  @ApiPropertyOptional({ description: 'Yearly import quantity' })
  @IsOptional()
  @IsNumber()
  yearlyImportQuantity?: number;

  @ApiPropertyOptional({ description: 'Yearly import unit price' })
  @IsOptional()
  @IsNumber()
  yearlyImportUnitPrice?: number;

  @ApiPropertyOptional({ description: 'Yearly import amount (from Excel)' })
  @IsOptional()
  @IsNumber()
  yearlyImportAmount?: number;

  // Lũy kế năm - Xuất
  @ApiPropertyOptional({ description: 'Yearly export quantity' })
  @IsOptional()
  @IsNumber()
  yearlyExportQuantity?: number;

  @ApiPropertyOptional({ description: 'Yearly export unit price' })
  @IsOptional()
  @IsNumber()
  yearlyExportUnitPrice?: number;

  @ApiPropertyOptional({ description: 'Yearly export amount (from Excel)' })
  @IsOptional()
  @IsNumber()
  yearlyExportAmount?: number;

  // Đề nghị mua tháng
  @ApiPropertyOptional({ description: 'Suggested purchase quantity' })
  @IsOptional()
  @IsNumber()
  suggestedPurchaseQuantity?: number;

  @ApiPropertyOptional({ description: 'Suggested purchase unit price' })
  @IsOptional()
  @IsNumber()
  suggestedPurchaseUnitPrice?: number;

  @ApiPropertyOptional({ description: 'Suggested purchase amount (from Excel)' })
  @IsOptional()
  @IsNumber()
  suggestedPurchaseAmount?: number;
}

export class BulkImportInventoryDto {
  @ApiProperty({ description: 'Month (1-12)', example: 1, minimum: 1, maximum: 12 })
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @ApiProperty({ description: 'Year', example: 2024 })
  @IsInt()
  year: number;

  @ApiProperty({ description: 'Array of medicines to import', type: [ImportMedicineFromExcelDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportMedicineFromExcelDto)
  medicines: ImportMedicineFromExcelDto[];
}

// ========== SIMPLIFIED BULK IMPORT DTOs (13-column Template) ==========
/**
 * DTO cho template đơn giản hóa 13 cột
 * User chỉ nhập: Thông tin thuốc + Nhập phát sinh + Đề nghị mua
 * Hệ thống tự tính: Tồn đầu kỳ, Xuất, Tồn cuối kỳ
 */
export class SimplifiedImportMedicineDto {
  @ApiPropertyOptional({ description: 'Medicine ID (for updating existing records)' })
  @IsOptional()
  @IsString()
  medicineId?: string;

  @ApiPropertyOptional({ description: 'STT - Row number', example: 1 })
  @IsOptional()
  @IsNumber()
  stt?: number;

  @ApiPropertyOptional({ description: 'Medicine name (required for creating new records)' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Category code', example: 'I' })
  @IsOptional()
  @IsString()
  categoryCode?: string;

  @ApiPropertyOptional({ description: 'Route - UỐNG, NHỎ MẮT, BÔI, DÁN' })
  @IsOptional()
  @IsString()
  route?: string;

  @ApiPropertyOptional({ description: 'Strength/Hàm lượng', example: '500mg' })
  @IsOptional()
  @IsString()
  strength?: string;

  @ApiPropertyOptional({ description: 'Manufacturer/Nơi SX' })
  @IsOptional()
  @IsString()
  manufacturer?: string;

  @ApiPropertyOptional({ description: 'Units', example: 'viên' })
  @IsOptional()
  @IsString()
  units?: string;

  // ===== NHẬP PHÁT SINH TRONG THÁNG =====
  @ApiPropertyOptional({ description: 'Import quantity (Số lượng nhập)', example: 100 })
  @IsOptional()
  @IsNumber()
  monthlyImportQuantity?: number;

  @ApiPropertyOptional({ description: 'Import unit price (Đơn giá nhập)', example: 5000 })
  @IsOptional()
  @IsNumber()
  monthlyImportUnitPrice?: number;

  @ApiPropertyOptional({ description: 'Import amount (Thành tiền nhập = SL × ĐG)', example: 500000 })
  @IsOptional()
  @IsNumber()
  monthlyImportAmount?: number;

  @ApiPropertyOptional({ description: 'Expiry date (Hạn sử dụng)', example: '2025-12-31' })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  // ===== ĐỀ NGHỊ MUA THÁNG TIẾP THEO =====
  @ApiPropertyOptional({ description: 'Suggested quantity (Số lượng đề nghị)', example: 50 })
  @IsOptional()
  @IsNumber()
  suggestedPurchaseQuantity?: number;

  @ApiPropertyOptional({ description: 'Suggested unit price (Đơn giá đề nghị)', example: 5500 })
  @IsOptional()
  @IsNumber()
  suggestedPurchaseUnitPrice?: number;

  @ApiPropertyOptional({ description: 'Suggested amount (Thành tiền đề nghị = SL × ĐG)', example: 275000 })
  @IsOptional()
  @IsNumber()
  suggestedPurchaseAmount?: number;
}

export class SimplifiedBulkImportDto {
  @ApiProperty({ description: 'Month (1-12)', example: 1, minimum: 1, maximum: 12 })
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @ApiProperty({ description: 'Year', example: 2026 })
  @IsInt()
  year: number;

  @ApiProperty({ description: 'Array of medicines to import', type: [SimplifiedImportMedicineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SimplifiedImportMedicineDto)
  medicines: SimplifiedImportMedicineDto[];
}

// ========== INVENTORY REPORT DTOs ==========
export class GetInventoryReportDto {
  @ApiPropertyOptional({ description: 'Month (1-12)', example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @ApiPropertyOptional({ description: 'Year', example: 2024 })
  @IsOptional()
  @IsInt()
  year?: number;

  @ApiPropertyOptional({ description: 'Medicine category ID' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Search by medicine name' })
  @IsOptional()
  @IsString()
  search?: string;
}

// ========== UPDATE INVENTORY BALANCE DTOs ==========
export class UpdateInventoryBalanceDto {
  @ApiProperty({ description: 'Medicine ID' })
  @IsString()
  medicineId: string;

  @ApiProperty({ description: 'Month (1-12)' })
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @ApiProperty({ description: 'Year' })
  @IsInt()
  year: number;

  @ApiPropertyOptional({ description: 'Expiry date' })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  // Tồn đầu kỳ
  @ApiPropertyOptional({ description: 'Opening quantity' })
  @IsOptional()
  @IsNumber()
  openingQuantity?: number;

  @ApiPropertyOptional({ description: 'Opening unit price' })
  @IsOptional()
  @IsNumber()
  openingUnitPrice?: number;

  // Đề nghị mua
  @ApiPropertyOptional({ description: 'Suggested purchase quantity' })
  @IsOptional()
  @IsNumber()
  suggestedPurchaseQuantity?: number;

  @ApiPropertyOptional({ description: 'Suggested purchase unit price' })
  @IsOptional()
  @IsNumber()
  suggestedPurchaseUnitPrice?: number;
}

// ========== STOCK ALERT DTOs ==========
export class StockAlertDto {
  @ApiPropertyOptional({ description: 'Minimum stock threshold', example: 10 })
  @IsOptional()
  @IsNumber()
  minThreshold?: number;

  @ApiPropertyOptional({ description: 'Days until expiry alert', example: 30 })
  @IsOptional()
  @IsInt()
  daysUntilExpiry?: number;
}
