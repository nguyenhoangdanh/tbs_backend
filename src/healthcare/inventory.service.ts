import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
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
import { Prisma } from '@prisma/client';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  // ==================== MEDICINE CATEGORY MANAGEMENT ====================
  
  async getMedicineCategories() {
    return this.prisma.medicineCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: {
          select: { medicines: true }
        }
      }
    });
  }

  async createMedicineCategory(data: CreateMedicineCategoryDto) {
    return this.prisma.medicineCategory.create({
      data
    });
  }

  async updateMedicineCategory(id: string, data: UpdateMedicineCategoryDto) {
    return this.prisma.medicineCategory.update({
      where: { id },
      data
    });
  }

  async deleteMedicineCategory(id: string) {
    return this.prisma.medicineCategory.update({
      where: { id },
      data: { isActive: false }
    });
  }

  // ==================== INVENTORY TRANSACTION MANAGEMENT ====================

  /**
   * Tạo giao dịch xuất/nhập kho
   * Tự động cập nhật MedicineInventory theo tháng/năm
   */
  async createInventoryTransaction(data: CreateInventoryTransactionDto) {
    const unitPrice = data.unitPrice ?? 0; // Default to 0 if not provided
    const totalAmount = Number(data.quantity) * Number(unitPrice);
    const transactionDate = data.transactionDate ? new Date(data.transactionDate) : new Date();
    const month = transactionDate.getMonth() + 1;
    const year = transactionDate.getFullYear();

    return this.prisma.$transaction(async (prisma) => {
      // 1. Tạo transaction record
      const transaction = await prisma.inventoryTransaction.create({
        data: {
          medicineId: data.medicineId,
          type: data.type,
          quantity: data.quantity,
          unitPrice: unitPrice,
          totalAmount,
          transactionDate,
          expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
          batchNumber: data.batchNumber,
          supplier: data.supplier,
          referenceType: data.referenceType,
          referenceId: data.referenceId,
          notes: data.notes,
          createdBy: data.createdBy,
        },
        include: {
          medicine: true
        }
      });

      // 2. Cập nhật MedicineInventory cho tháng hiện tại
      await this.updateInventoryBalance(
        data.medicineId,
        month,
        year,
        data.type,
        Number(data.quantity),
        Number(unitPrice),
        data.expiryDate ? new Date(data.expiryDate) : undefined
      );

      return transaction;
    });
  }

  /**
   * Cập nhật tồn kho theo tháng/năm
   * Logic: 
   * - Tồn cuối kỳ = Tồn đầu kỳ + Nhập - Xuất
   * - Lũy kế năm tự động cộng dồn
   */
  private async updateInventoryBalance(
    medicineId: string,
    month: number,
    year: number,
    transactionType: InventoryTransactionTypeDto,
    quantity: number,
    unitPrice: number,
    expiryDate?: Date
  ) {
    // Tìm hoặc tạo inventory record cho tháng này
    let inventory = await this.prisma.medicineInventory.findUnique({
      where: {
        medicineId_month_year: {
          medicineId,
          month,
          year
        }
      }
    });

    if (!inventory) {
      // Lấy tồn cuối kỳ tháng trước làm tồn đầu kỳ
      const previousMonth = month === 1 ? 12 : month - 1;
      const previousYear = month === 1 ? year - 1 : year;
      
      const previousInventory = await this.prisma.medicineInventory.findUnique({
        where: {
          medicineId_month_year: {
            medicineId,
            month: previousMonth,
            year: previousYear
          }
        }
      });

      inventory = await this.prisma.medicineInventory.create({
        data: {
          medicineId,
          month,
          year,
          expiryDate,
          openingQuantity: previousInventory?.closingQuantity || 0,
          openingUnitPrice: previousInventory?.closingUnitPrice || 0,
          openingTotalAmount: previousInventory?.closingTotalAmount || 0,
        }
      });
    }

    // Cập nhật số liệu theo loại giao dịch
    const amount = quantity * unitPrice;
    
    let updateData: Prisma.MedicineInventoryUpdateInput = {};

    if (transactionType === InventoryTransactionTypeDto.IMPORT) {
      // Nhập kho
      const newMonthlyImportQty = Number(inventory.monthlyImportQuantity) + quantity;
      const newMonthlyImportAmount = Number(inventory.monthlyImportAmount) + amount;
      const newMonthlyImportUnitPrice = newMonthlyImportAmount / newMonthlyImportQty;

      const newYearlyImportQty = Number(inventory.yearlyImportQuantity) + quantity;
      const newYearlyImportAmount = Number(inventory.yearlyImportAmount) + amount;
      const newYearlyImportUnitPrice = newYearlyImportAmount / newYearlyImportQty;

      updateData = {
        monthlyImportQuantity: newMonthlyImportQty,
        monthlyImportUnitPrice: newMonthlyImportUnitPrice,
        monthlyImportAmount: newMonthlyImportAmount,
        yearlyImportQuantity: newYearlyImportQty,
        yearlyImportUnitPrice: newYearlyImportUnitPrice,
        yearlyImportAmount: newYearlyImportAmount,
      };

      if (expiryDate) {
        updateData.expiryDate = expiryDate;
      }
    } else if (transactionType === InventoryTransactionTypeDto.EXPORT) {
      // Xuất kho
      const newMonthlyExportQty = Number(inventory.monthlyExportQuantity) + quantity;
      const newMonthlyExportAmount = Number(inventory.monthlyExportAmount) + amount;
      const newMonthlyExportUnitPrice = newMonthlyExportAmount / newMonthlyExportQty;

      const newYearlyExportQty = Number(inventory.yearlyExportQuantity) + quantity;
      const newYearlyExportAmount = Number(inventory.yearlyExportAmount) + amount;
      const newYearlyExportUnitPrice = newYearlyExportAmount / newYearlyExportQty;

      updateData = {
        monthlyExportQuantity: newMonthlyExportQty,
        monthlyExportUnitPrice: newMonthlyExportUnitPrice,
        monthlyExportAmount: newMonthlyExportAmount,
        yearlyExportQuantity: newYearlyExportQty,
        yearlyExportUnitPrice: newYearlyExportUnitPrice,
        yearlyExportAmount: newYearlyExportAmount,
      };
    } else if (transactionType === InventoryTransactionTypeDto.ADJUSTMENT) {
      // Điều chỉnh - có thể + hoặc -
      // Xử lý giống như import/export tùy số âm dương
      if (quantity > 0) {
        const newMonthlyImportQty = Number(inventory.monthlyImportQuantity) + quantity;
        const newMonthlyImportAmount = Number(inventory.monthlyImportAmount) + amount;
        const newMonthlyImportUnitPrice = newMonthlyImportAmount / newMonthlyImportQty;

        updateData = {
          monthlyImportQuantity: newMonthlyImportQty,
          monthlyImportUnitPrice: newMonthlyImportUnitPrice,
          monthlyImportAmount: newMonthlyImportAmount,
        };
      } else {
        const adjustQty = Math.abs(quantity);
        const adjustAmount = Math.abs(amount);
        const newMonthlyExportQty = Number(inventory.monthlyExportQuantity) + adjustQty;
        const newMonthlyExportAmount = Number(inventory.monthlyExportAmount) + adjustAmount;
        const newMonthlyExportUnitPrice = newMonthlyExportAmount / newMonthlyExportQty;

        updateData = {
          monthlyExportQuantity: newMonthlyExportQty,
          monthlyExportUnitPrice: newMonthlyExportUnitPrice,
          monthlyExportAmount: newMonthlyExportAmount,
        };
      }
    }

    // Tính toán tồn cuối kỳ
    const closingQuantity = 
      Number(inventory.openingQuantity) + 
      Number(updateData.monthlyImportQuantity || inventory.monthlyImportQuantity) - 
      Number(updateData.monthlyExportQuantity || inventory.monthlyExportQuantity);

    // Tính đơn giá bình quân
    const totalValue = 
      (Number(inventory.openingQuantity) * Number(inventory.openingUnitPrice)) +
      Number(updateData.monthlyImportAmount || inventory.monthlyImportAmount) -
      Number(updateData.monthlyExportAmount || inventory.monthlyExportAmount);
    
    const closingUnitPrice = closingQuantity > 0 ? totalValue / closingQuantity : 0;
    const closingTotalAmount = closingQuantity * closingUnitPrice;

    updateData.closingQuantity = closingQuantity;
    updateData.closingUnitPrice = closingUnitPrice;
    updateData.closingTotalAmount = closingTotalAmount;

    return this.prisma.medicineInventory.update({
      where: {
        medicineId_month_year: {
          medicineId,
          month,
          year
        }
      },
      data: updateData
    });
  }

  /**
   * Lấy lịch sử giao dịch theo thuốc
   */
  async getInventoryTransactions(
    medicineId?: string,
    type?: InventoryTransactionTypeDto,
    startDate?: string,
    endDate?: string
  ) {
    const where: Prisma.InventoryTransactionWhereInput = {};

    if (medicineId) {
      where.medicineId = medicineId;
    }

    if (type) {
      where.type = type;
    }

    if (startDate || endDate) {
      where.transactionDate = {};
      if (startDate) {
        where.transactionDate.gte = new Date(startDate);
      }
      if (endDate) {
        where.transactionDate.lte = new Date(endDate);
      }
    }

    return this.prisma.inventoryTransaction.findMany({
      where,
      include: {
        medicine: {
          include: {
            category: true
          }
        }
      },
      orderBy: {
        transactionDate: 'desc'
      }
    });
  }

  // ==================== BULK IMPORT FROM EXCEL ====================

  /**
   * Import dữ liệu từ Excel (frontend đã parse)
   * Tự động tạo/cập nhật medicines, categories, và inventory balances
   */
  async bulkImportInventory(data: BulkImportInventoryDto) {
    console.log('🔧 [InventoryService] Starting bulk import...');
    console.log(`📅 Target: ${data.month}/${data.year}`);
    console.log(`📦 Medicines to import: ${data.medicines.length}`);
    
    const { month, year, medicines } = data;
    const results = {
      imported: 0,
      updated: 0,
      errors: [] as any[]
    };

    for (const medicineData of medicines) {
      try {
        console.log(`\n🔄 Processing medicine: ${medicineData.name}`);
        console.log('  Data:', {
          openingQty: medicineData.openingQuantity,
          openingPrice: medicineData.openingUnitPrice,
          openingAmount: medicineData.openingTotalAmount,
          hasAmount: medicineData.openingTotalAmount !== undefined
        });
        
        await this.prisma.$transaction(async (prisma) => {
          // 1. Tạo/tìm category nếu có
          let categoryId: string | undefined;
          if (medicineData.categoryCode) {
            let category = await prisma.medicineCategory.findUnique({
              where: { code: medicineData.categoryCode }
            });

            if (!category) {
              // Tạo category mới nếu chưa có
              category = await prisma.medicineCategory.create({
                data: {
                  code: medicineData.categoryCode,
                  name: `Category ${medicineData.categoryCode}`,
                  sortOrder: parseInt(medicineData.categoryCode.replace(/[^0-9]/g, '')) || 0
                }
              });
            }
            categoryId = category.id;
          }

          // 2. Tạo hoặc cập nhật medicine
          let medicine = await prisma.medicine.findFirst({
            where: { 
              name: medicineData.name,
              isActive: true
            }
          });

          if (!medicine) {
            medicine = await prisma.medicine.create({
              data: {
                name: medicineData.name,
                categoryId,
                route: medicineData.route,
                strength: medicineData.strength,
                manufacturer: medicineData.manufacturer,
                units: medicineData.units,
              }
            });
            results.imported++;
          } else {
            // Cập nhật thông tin medicine nếu cần
            medicine = await prisma.medicine.update({
              where: { id: medicine.id },
              data: {
                categoryId: categoryId || medicine.categoryId,
                route: medicineData.route || medicine.route,
                strength: medicineData.strength || medicine.strength,
                manufacturer: medicineData.manufacturer || medicine.manufacturer,
                units: medicineData.units || medicine.units,
              }
            });
            results.updated++;
          }

          // 3. Tạo/cập nhật inventory balance cho tháng này
          // ✅ NHẬN TRỰC TIẾP GIÁ TRỊ TỪ EXCEL - KHÔNG TÍNH LẠI để giữ nguyên độ chính xác
          // Sử dụng Number() để chuyển đổi an toàn mà vẫn giữ độ chính xác thập phân
          const openingQty = Number(medicineData.openingQuantity) || 0;
          const openingPrice = Number(medicineData.openingUnitPrice) || 0;
          // Ưu tiên dùng amount từ Excel, nếu không có mới tính
          const openingAmount = medicineData.openingTotalAmount !== undefined 
            ? Number(medicineData.openingTotalAmount)
            : openingQty * openingPrice;

          const monthlyImportQty = Number(medicineData.monthlyImportQuantity) || 0;
          const monthlyImportPrice = Number(medicineData.monthlyImportUnitPrice) || 0;
          const monthlyImportAmount = medicineData.monthlyImportAmount !== undefined
            ? Number(medicineData.monthlyImportAmount)
            : monthlyImportQty * monthlyImportPrice;

          const monthlyExportQty = Number(medicineData.monthlyExportQuantity) || 0;
          const monthlyExportPrice = Number(medicineData.monthlyExportUnitPrice) || 0;
          const monthlyExportAmount = medicineData.monthlyExportAmount !== undefined
            ? Number(medicineData.monthlyExportAmount)
            : monthlyExportQty * monthlyExportPrice;

          const closingQty = medicineData.closingQuantity ? Number(medicineData.closingQuantity) : (openingQty + monthlyImportQty - monthlyExportQty);
          const closingPrice = medicineData.closingUnitPrice ? Number(medicineData.closingUnitPrice) : openingPrice;
          const closingAmount = medicineData.closingTotalAmount !== undefined
            ? Number(medicineData.closingTotalAmount)
            : closingQty * closingPrice;

          const yearlyImportQty = Number(medicineData.yearlyImportQuantity) || 0;
          const yearlyImportPrice = Number(medicineData.yearlyImportUnitPrice) || 0;
          const yearlyImportAmount = medicineData.yearlyImportAmount !== undefined
            ? Number(medicineData.yearlyImportAmount)
            : yearlyImportQty * yearlyImportPrice;

          const yearlyExportQty = Number(medicineData.yearlyExportQuantity) || 0;
          const yearlyExportPrice = Number(medicineData.yearlyExportUnitPrice) || 0;
          const yearlyExportAmount = medicineData.yearlyExportAmount !== undefined
            ? Number(medicineData.yearlyExportAmount)
            : yearlyExportQty * yearlyExportPrice;

          const suggestedQty = Number(medicineData.suggestedPurchaseQuantity) || 0;
          const suggestedPrice = Number(medicineData.suggestedPurchaseUnitPrice) || 0;
          const suggestedAmount = medicineData.suggestedPurchaseAmount !== undefined
            ? Number(medicineData.suggestedPurchaseAmount)
            : suggestedQty * suggestedPrice;

          await prisma.medicineInventory.upsert({
            where: {
              medicineId_month_year: {
                medicineId: medicine.id,
                month,
                year
              }
            },
            update: {
              expiryDate: medicineData.expiryDate ? new Date(medicineData.expiryDate) : null,
              openingQuantity: openingQty,
              openingUnitPrice: openingPrice,
              openingTotalAmount: openingAmount,
              monthlyImportQuantity: monthlyImportQty,
              monthlyImportUnitPrice: monthlyImportPrice,
              monthlyImportAmount: monthlyImportAmount,
              monthlyExportQuantity: monthlyExportQty,
              monthlyExportUnitPrice: monthlyExportPrice,
              monthlyExportAmount: monthlyExportAmount,
              closingQuantity: closingQty,
              closingUnitPrice: closingPrice,
              closingTotalAmount: closingAmount,
              yearlyImportQuantity: yearlyImportQty,
              yearlyImportUnitPrice: yearlyImportPrice,
              yearlyImportAmount: yearlyImportAmount,
              yearlyExportQuantity: yearlyExportQty,
              yearlyExportUnitPrice: yearlyExportPrice,
              yearlyExportAmount: yearlyExportAmount,
              suggestedPurchaseQuantity: suggestedQty,
              suggestedPurchaseUnitPrice: suggestedPrice,
              suggestedPurchaseAmount: suggestedAmount,
            },
            create: {
              medicineId: medicine.id,
              month,
              year,
              expiryDate: medicineData.expiryDate ? new Date(medicineData.expiryDate) : null,
              openingQuantity: openingQty,
              openingUnitPrice: openingPrice,
              openingTotalAmount: openingAmount,
              monthlyImportQuantity: monthlyImportQty,
              monthlyImportUnitPrice: monthlyImportPrice,
              monthlyImportAmount: monthlyImportAmount,
              monthlyExportQuantity: monthlyExportQty,
              monthlyExportUnitPrice: monthlyExportPrice,
              monthlyExportAmount: monthlyExportAmount,
              closingQuantity: closingQty,
              closingUnitPrice: closingPrice,
              closingTotalAmount: closingAmount,
              yearlyImportQuantity: yearlyImportQty,
              yearlyImportUnitPrice: yearlyImportPrice,
              yearlyImportAmount: yearlyImportAmount,
              yearlyExportQuantity: yearlyExportQty,
              yearlyExportUnitPrice: yearlyExportPrice,
              yearlyExportAmount: yearlyExportAmount,
              suggestedPurchaseQuantity: suggestedQty,
              suggestedPurchaseUnitPrice: suggestedPrice,
              suggestedPurchaseAmount: suggestedAmount,
            }
          });
        });
      } catch (error) {
        results.errors.push({
          medicine: medicineData.name,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Simplified bulk import (13-column template)
   * User chỉ nhập: Thông tin thuốc + Nhập phát sinh + Đề nghị mua
   * Hệ thống tự động tính: Tồn đầu kỳ, Xuất, Tồn cuối kỳ
   */
  async simplifiedBulkImport(data: SimplifiedBulkImportDto) {
    console.log('🔧 [InventoryService] Starting simplified bulk import...');
    console.log(`📅 Target: ${data.month}/${data.year}`);
    console.log(`📦 Medicines to import: ${data.medicines.length}`);
    
    const { month, year, medicines } = data;
    const results = {
      imported: 0,
      updated: 0,
      errors: [] as any[]
    };

    // Calculate previous month for opening balance
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;

    // Helper to parse expiry date strings (accepts ISO or DD/MM/YYYY)
    function parseDateString(input?: string | null) {
      if (!input) return null
      const s = String(input).trim()
      if (!s) return null

      // Try native Date first (ISO or other recognized formats)
      const d1 = new Date(s)
      if (!Number.isNaN(d1.getTime())) return d1

      // Try DD/MM/YYYY or D/M/YYYY
      const parts = s.split(/[\/\.-]/).map(p => p.trim())
      if (parts.length === 3) {
        const day = Number(parts[0])
        const month = Number(parts[1])
        const year = Number(parts[2])
        if (!Number.isNaN(day) && !Number.isNaN(month) && !Number.isNaN(year)) {
          const d2 = new Date(year, month - 1, day)
          if (!Number.isNaN(d2.getTime())) return d2
        }
      }

      return null
    }

    for (const medicineData of medicines) {
      try {
        // Support both medicineId (for updates) and name (for new imports)
        let medicine;
        
        if (medicineData.medicineId) {
          // Update existing medicine using medicineId
          medicine = await this.prisma.medicine.findUnique({
            where: { id: medicineData.medicineId }
          });
          
          if (!medicine) {
            console.warn(`⚠️ Medicine ID not found: ${medicineData.medicineId}, will try to create if name provided`);
            // Don't continue - try to create below if name is provided
          } else {
            console.log(`\n🔄 Processing existing medicine: ${medicine.name} (ID: ${medicine.id})`);
          }
        }
        
        // If no medicine found by ID, try to find or create by name
        if (!medicine) {
          if (!medicineData.name) {
            console.error(`❌ Missing both valid medicineId and name`);
            results.errors.push({
              medicine: medicineData.medicineId || 'unknown',
              error: 'Missing both valid medicineId and name'
            });
            continue;
          }
          
          // Try to find existing medicine by name
          console.log(`\n🔍 Searching for medicine by name: ${medicineData.name}`);
          medicine = await this.prisma.medicine.findFirst({
            where: { 
              name: medicineData.name,
              isActive: true
            }
          });
          
          if (medicine) {
            console.log(`✅ Found existing medicine: ${medicine.name} (ID: ${medicine.id})`);
          } else {
            console.log(`🆕 Medicine not found, will create new: ${medicineData.name}`);
          }
        }
        
        await this.prisma.$transaction(async (prisma) => {
          // 1. Tạo/tìm category nếu có
          let categoryId: string | undefined;
          if (medicineData.categoryCode) {
            let category = await prisma.medicineCategory.findUnique({
              where: { code: medicineData.categoryCode }
            });

            if (!category) {
              category = await prisma.medicineCategory.create({
                data: {
                  code: medicineData.categoryCode,
                  name: `Category ${medicineData.categoryCode}`,
                  sortOrder: parseInt(medicineData.categoryCode.replace(/[^0-9]/g, '')) || 0
                }
              });
            }
            categoryId = category.id;
          }

          // 2. Tạo hoặc cập nhật medicine
          if (!medicine) {
            // Create new medicine with all provided details
            if (!medicineData.name) {
              throw new Error('Medicine name is required for creating new medicine');
            }
            
            console.log(`🆕 Creating new medicine: ${medicineData.name}`);
            medicine = await prisma.medicine.create({
              data: {
                name: medicineData.name,
                categoryId,
                route: medicineData.route || null,
                strength: medicineData.strength || null,
                manufacturer: medicineData.manufacturer || null,
                units: medicineData.units || 'viên',
                type: 'MEDICINE', // Default to MEDICINE
                isActive: true,
              }
            });
            console.log(`✅ Created medicine: ${medicine.name} (ID: ${medicine.id})`);
            results.imported++;
          } else if (medicineData.medicineId) {
            // Only update if it was explicitly referenced by ID (not auto-matched by name)
            console.log(`🔄 Updating existing medicine: ${medicine.name}`);
            medicine = await prisma.medicine.update({
              where: { id: medicine.id },
              data: {
                categoryId: categoryId || medicine.categoryId,
                route: medicineData.route || medicine.route,
                strength: medicineData.strength || medicine.strength,
                manufacturer: medicineData.manufacturer || medicine.manufacturer,
                units: medicineData.units || medicine.units,
              }
            });
            results.updated++;
          } else {
            // Found by name match - just use it without updating
            console.log(`📌 Using existing medicine: ${medicine.name} (matched by name)`);
            results.updated++;
          }

          // 3. Tính toán inventory balance
          
          // 3.1. Kiểm tra xem đã có inventory record cho tháng này chưa
          const existingInventory = await prisma.medicineInventory.findUnique({
            where: {
              medicineId_month_year: {
                medicineId: medicine.id,
                month,
                year
              }
            }
          });

          // 3.2. Nhập phát sinh (từ Excel template - LUÔN CẬP NHẬT)
          const importQty = Number(medicineData.monthlyImportQuantity) || 0;
          const importPrice = Number(medicineData.monthlyImportUnitPrice) || 0;
          const importAmount = medicineData.monthlyImportAmount !== undefined 
            ? Number(medicineData.monthlyImportAmount)
            : importQty * importPrice;

          // 3.3. Đề nghị mua (từ Excel template - LUÔN CẬP NHẬT)
          const suggestedQty = Number(medicineData.suggestedPurchaseQuantity) || 0;
          const suggestedPrice = Number(medicineData.suggestedPurchaseUnitPrice) || 0;
          const suggestedAmount = medicineData.suggestedPurchaseAmount !== undefined
            ? Number(medicineData.suggestedPurchaseAmount)
            : suggestedQty * suggestedPrice;

          // Parse expiry date once for all uses
          const parsedExpiry = parseDateString(medicineData.expiryDate);

          // 3.4. Nếu chưa có record, tính toán đầy đủ
          if (!existingInventory) {
            // Lấy tồn cuối kỳ tháng trước làm tồn đầu kỳ tháng này
            const prevInventory = await prisma.medicineInventory.findUnique({
              where: {
                medicineId_month_year: {
                  medicineId: medicine.id,
                  month: prevMonth,
                  year: prevYear
                }
              }
            });

            const openingQty = Number(prevInventory?.closingQuantity || 0);
            const openingPrice = Number(prevInventory?.closingUnitPrice || 0);
            const openingAmount = openingQty * openingPrice;

            // Xuất trong tháng (tính từ MedicalPrescription)
            const exportData = await prisma.medicalPrescription.aggregate({
              where: {
                medicineId: medicine.id,
                medicalRecord: {
                  visitDate: {
                    gte: new Date(year, month - 1, 1),
                    lt: new Date(year, month, 1)
                  }
                }
              },
              _sum: {
                quantity: true
              }
            });

            const exportQty = Number(exportData._sum.quantity || 0);
            const exportPrice = openingPrice || importPrice;
            const exportAmount = exportQty * exportPrice;

            // Tồn cuối kỳ = Tồn đầu + Nhập - Xuất
            const closingQty = openingQty + importQty - exportQty;
            const closingPrice = importPrice || openingPrice;
            const closingAmount = closingQty * closingPrice;

            // Tạo mới inventory record
            await prisma.medicineInventory.create({
              data: {
                medicineId: medicine.id,
                month,
                year,
                expiryDate: parsedExpiry ?? null,
                openingQuantity: openingQty,
                openingUnitPrice: openingPrice,
                openingTotalAmount: openingAmount,
                monthlyImportQuantity: importQty,
                monthlyImportUnitPrice: importPrice,
                monthlyImportAmount: importAmount,
                monthlyExportQuantity: exportQty,
                monthlyExportUnitPrice: exportPrice,
                monthlyExportAmount: exportAmount,
                closingQuantity: closingQty,
                closingUnitPrice: closingPrice,
                closingTotalAmount: closingAmount,
                suggestedPurchaseQuantity: suggestedQty,
                suggestedPurchaseUnitPrice: suggestedPrice,
                suggestedPurchaseAmount: suggestedAmount,
              }
            });
          } else {
            // 3.5. Nếu đã có record, CHỈ CẬP NHẬT import và suggested từ template
            // Tính lại closing dựa trên opening và export hiện tại
            const currentOpening = Number(existingInventory.openingQuantity || 0);
            const currentExport = Number(existingInventory.monthlyExportQuantity || 0);
            const currentExportPrice = Number(existingInventory.monthlyExportUnitPrice || 0);
            
            // Tồn cuối = Tồn đầu + Nhập mới - Xuất hiện tại
            const newClosingQty = currentOpening + importQty - currentExport;
            const newClosingPrice = importPrice || Number(existingInventory.openingUnitPrice || 0);
            const newClosingAmount = newClosingQty * newClosingPrice;

            // Cập nhật CHỈ các field từ template + recalculate closing
            await prisma.medicineInventory.update({
              where: {
                medicineId_month_year: {
                  medicineId: medicine.id,
                  month,
                  year
                }
              },
              data: {
                // Only update expiryDate if parsed successfully
                ...(parsedExpiry ? { expiryDate: parsedExpiry } : {}),
                // CHỈ CẬP NHẬT: Nhập phát sinh (từ user input)
                monthlyImportQuantity: importQty,
                monthlyImportUnitPrice: importPrice,
                monthlyImportAmount: importAmount,
                // CHỈ CẬP NHẬT: Đề nghị mua (từ user input)
                suggestedPurchaseQuantity: suggestedQty,
                suggestedPurchaseUnitPrice: suggestedPrice,
                suggestedPurchaseAmount: suggestedAmount,
                // TÁI TÍNH: Tồn cuối kỳ dựa trên opening hiện tại + import mới - export hiện tại
                closingQuantity: newClosingQty,
                closingUnitPrice: newClosingPrice,
                closingTotalAmount: newClosingAmount,
                // KHÔNG CẬP NHẬT: openingQuantity, monthlyExportQuantity (giữ nguyên)
              }
            });
          }

          // 5. Tạo transaction IMPORT nếu có nhập phát sinh VÀ chưa tồn tại
          // CHỈ tạo transaction khi tạo mới record (không phải update)
          if (importQty > 0 && !existingInventory) {
            await prisma.inventoryTransaction.create({
              data: {
                medicine: {
                  connect: { id: medicine.id }
                },
                type: 'IMPORT',
                quantity: importQty,
                unitPrice: importPrice,
                totalAmount: importAmount,
                notes: `Nhập phát sinh tháng ${month}/${year} từ Excel`,
                expiryDate: parsedExpiry ?? null,
              }
            });
          }
        });
      } catch (error) {
        console.error(`❌ Error processing ${medicineData.name}:`, error);
        results.errors.push({
          medicine: medicineData.name,
          error: error.message
        });
      }
    }

    console.log('✅ Simplified import completed:', results);
    return results;
  }

  // ==================== INVENTORY REPORTS ====================

  /**
   * Báo cáo tồn kho theo tháng/năm
   */
  async getInventoryReport(params: GetInventoryReportDto) {
    const { month, year, categoryId, search } = params;
    const currentDate = new Date();
    const targetMonth = month || currentDate.getMonth() + 1;
    const targetYear = year || currentDate.getFullYear();

    const where: Prisma.MedicineInventoryWhereInput = {
      month: targetMonth,
      year: targetYear,
    };

    if (categoryId || search) {
      where.medicine = {};
      if (categoryId) {
        where.medicine.categoryId = categoryId;
      }
      if (search) {
        where.medicine.name = {
          contains: search,
          mode: 'insensitive'
        };
      }
    }

    const inventories = await this.prisma.medicineInventory.findMany({
      where,
      include: {
        medicine: {
          include: {
            category: true
          }
        }
      },
      orderBy: [
        { medicine: { category: { sortOrder: 'asc' } } },
        { medicine: { name: 'asc' } }
      ]
    });

    // Convert Decimal fields to Number for JSON serialization
    const convertedInventories = inventories.map(inv => ({
      ...inv,
      openingQuantity: Number(inv.openingQuantity),
      openingUnitPrice: Number(inv.openingUnitPrice),
      openingTotalAmount: Number(inv.openingTotalAmount),
      monthlyImportQuantity: Number(inv.monthlyImportQuantity),
      monthlyImportUnitPrice: Number(inv.monthlyImportUnitPrice),
      monthlyImportAmount: Number(inv.monthlyImportAmount),
      monthlyExportQuantity: Number(inv.monthlyExportQuantity),
      monthlyExportUnitPrice: Number(inv.monthlyExportUnitPrice),
      monthlyExportAmount: Number(inv.monthlyExportAmount),
      closingQuantity: Number(inv.closingQuantity),
      closingUnitPrice: Number(inv.closingUnitPrice),
      closingTotalAmount: Number(inv.closingTotalAmount),
      yearlyImportQuantity: Number(inv.yearlyImportQuantity),
      yearlyImportUnitPrice: Number(inv.yearlyImportUnitPrice),
      yearlyImportAmount: Number(inv.yearlyImportAmount),
      yearlyExportQuantity: Number(inv.yearlyExportQuantity),
      yearlyExportUnitPrice: Number(inv.yearlyExportUnitPrice),
      yearlyExportAmount: Number(inv.yearlyExportAmount),
      suggestedPurchaseQuantity: Number(inv.suggestedPurchaseQuantity),
      suggestedPurchaseUnitPrice: Number(inv.suggestedPurchaseUnitPrice),
      suggestedPurchaseAmount: Number(inv.suggestedPurchaseAmount),
    }));

    // Tính tổng hợp
    const summary = convertedInventories.reduce((acc, inv) => {
      return {
        totalOpeningAmount: acc.totalOpeningAmount + inv.openingTotalAmount,
        totalImportAmount: acc.totalImportAmount + inv.monthlyImportAmount,
        totalExportAmount: acc.totalExportAmount + inv.monthlyExportAmount,
        totalClosingAmount: acc.totalClosingAmount + inv.closingTotalAmount,
        totalSuggestedAmount: acc.totalSuggestedAmount + inv.suggestedPurchaseAmount,
      };
    }, {
      totalOpeningAmount: 0,
      totalImportAmount: 0,
      totalExportAmount: 0,
      totalClosingAmount: 0,
      totalSuggestedAmount: 0,
    });

    return {
      month: targetMonth,
      year: targetYear,
      items: convertedInventories, // Changed from 'inventories' to 'items' to match frontend type
      summary: {
        totalMedicines: convertedInventories.length,
        ...summary
      }
    };
  }

  /**
   * Báo cáo theo năm (tất cả các tháng)
   */
  async getYearlyInventoryReport(year: number, categoryId?: string) {
    const where: Prisma.MedicineInventoryWhereInput = {
      year,
    };

    if (categoryId) {
      where.medicine = {
        categoryId
      };
    }

    const inventories = await this.prisma.medicineInventory.findMany({
      where,
      include: {
        medicine: {
          include: {
            category: true
          }
        }
      },
      orderBy: [
        { month: 'asc' },
        { medicine: { category: { sortOrder: 'asc' } } },
        { medicine: { name: 'asc' } }
      ]
    });

    // Group by month
    const monthlyData = inventories.reduce((acc, inv) => {
      const monthKey = `${inv.month}`;
      if (!acc[monthKey]) {
        acc[monthKey] = {
          month: inv.month,
          inventories: [],
          summary: {
            totalOpeningAmount: 0,
            totalImportAmount: 0,
            totalExportAmount: 0,
            totalClosingAmount: 0,
          }
        };
      }

      acc[monthKey].inventories.push(inv);
      acc[monthKey].summary.totalOpeningAmount += Number(inv.openingTotalAmount);
      acc[monthKey].summary.totalImportAmount += Number(inv.monthlyImportAmount);
      acc[monthKey].summary.totalExportAmount += Number(inv.monthlyExportAmount);
      acc[monthKey].summary.totalClosingAmount += Number(inv.closingTotalAmount);

      return acc;
    }, {} as any);

    return {
      year,
      months: Object.values(monthlyData)
    };
  }

  /**
   * Cảnh báo thuốc sắp hết hạn hoặc tồn kho thấp
   * - Tồn kho thấp: < 100
   * - Sắp hết hạn: còn 2 tháng (60 ngày)
   */
  async getStockAlerts(params: StockAlertDto) {
    const { minThreshold = 100, daysUntilExpiry = 60 } = params;
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();
    const expiryThreshold = new Date();
    expiryThreshold.setDate(expiryThreshold.getDate() + daysUntilExpiry);

    // Tìm thuốc tồn kho thấp (< 100)
    const lowStockItems = await this.prisma.medicineInventory.findMany({
      where: {
        month: currentMonth,
        year: currentYear,
        closingQuantity: {
          lt: minThreshold,
          gt: 0
        }
      },
      include: {
        medicine: {
          include: {
            category: true
          }
        }
      }
    });

    // Tìm thuốc sắp hết hạn
    const expiringItems = await this.prisma.medicineInventory.findMany({
      where: {
        month: currentMonth,
        year: currentYear,
        expiryDate: {
          lte: expiryThreshold,
          gte: currentDate
        },
        closingQuantity: {
          gt: 0
        }
      },
      include: {
        medicine: {
          include: {
            category: true
          }
        }
      }
    });

    return {
      lowStockItems,
      expiringItems,
      summary: {
        lowStockCount: lowStockItems.length,
        expiringCount: expiringItems.length
      }
    };
  }

  /**
   * Lấy tồn kho hiện tại của tất cả các thuốc - GROUPED BY CATEGORY
   * Format giống Excel: Category header → medicines → subtotal
   */
  async getAllCurrentStock() {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    // Lấy tất cả categories
    const categories = await this.prisma.medicineCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        medicines: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
          include: {
            inventoryBalances: {
              where: {
                month: currentMonth,
                year: currentYear
              }
            }
          }
        }
      }
    });

    // Format data theo category groups
    const result = categories.map(category => {
      const items = category.medicines.map(medicine => {
        const inventory = medicine.inventoryBalances[0];

        if (!inventory) {
          // Nếu chưa có inventory, trả về dữ liệu empty
          return {
            id: `temp-${medicine.id}`,
            medicineId: medicine.id,
            medicine: {
              ...medicine,
              category
            },
            month: currentMonth,
            year: currentYear,
            expiryDate: null,
            openingQuantity: 0,
            openingUnitPrice: 0,
            openingTotalAmount: 0,
            monthlyImportQuantity: 0,
            monthlyImportUnitPrice: 0,
            monthlyImportAmount: 0,
            monthlyExportQuantity: 0,
            monthlyExportUnitPrice: 0,
            monthlyExportAmount: 0,
            closingQuantity: 0,
            closingUnitPrice: 0,
            closingTotalAmount: 0,
            yearlyImportQuantity: 0,
            yearlyImportUnitPrice: 0,
            yearlyImportAmount: 0,
            yearlyExportQuantity: 0,
            yearlyExportUnitPrice: 0,
            yearlyExportAmount: 0,
            suggestedPurchaseQuantity: 0,
            suggestedPurchaseUnitPrice: 0,
            suggestedPurchaseAmount: 0,
            createdAt: new Date(),
            updatedAt: new Date()
          };
        }

        return {
          ...inventory,
          medicine: {
            ...medicine,
            category
          }
        };
      });

      // Tính subtotal cho category
      const subtotal = items.reduce((acc, item) => ({
        openingQuantity: acc.openingQuantity + Number(item.openingQuantity || 0),
        openingTotalAmount: acc.openingTotalAmount + Number(item.openingTotalAmount || 0),
        monthlyImportQuantity: acc.monthlyImportQuantity + Number(item.monthlyImportQuantity || 0),
        monthlyImportAmount: acc.monthlyImportAmount + Number(item.monthlyImportAmount || 0),
        monthlyExportQuantity: acc.monthlyExportQuantity + Number(item.monthlyExportQuantity || 0),
        monthlyExportAmount: acc.monthlyExportAmount + Number(item.monthlyExportAmount || 0),
        closingQuantity: acc.closingQuantity + Number(item.closingQuantity || 0),
        closingTotalAmount: acc.closingTotalAmount + Number(item.closingTotalAmount || 0),
        yearlyImportQuantity: acc.yearlyImportQuantity + Number(item.yearlyImportQuantity || 0),
        yearlyImportAmount: acc.yearlyImportAmount + Number(item.yearlyImportAmount || 0),
        yearlyExportQuantity: acc.yearlyExportQuantity + Number(item.yearlyExportQuantity || 0),
        yearlyExportAmount: acc.yearlyExportAmount + Number(item.yearlyExportAmount || 0),
        suggestedPurchaseQuantity: acc.suggestedPurchaseQuantity + Number(item.suggestedPurchaseQuantity || 0),
        suggestedPurchaseAmount: acc.suggestedPurchaseAmount + Number(item.suggestedPurchaseAmount || 0),
      }), {
        openingQuantity: 0,
        openingTotalAmount: 0,
        monthlyImportQuantity: 0,
        monthlyImportAmount: 0,
        monthlyExportQuantity: 0,
        monthlyExportAmount: 0,
        closingQuantity: 0,
        closingTotalAmount: 0,
        yearlyImportQuantity: 0,
        yearlyImportAmount: 0,
        yearlyExportQuantity: 0,
        yearlyExportAmount: 0,
        suggestedPurchaseQuantity: 0,
        suggestedPurchaseAmount: 0,
      });

      return {
        category: {
          id: category.id,
          code: category.code,
          name: category.name,
          sortOrder: category.sortOrder
        },
        items,
        subtotal
      };
    });

    // Tính grand total
    const grandTotal = result.reduce((acc, group) => ({
      openingQuantity: acc.openingQuantity + group.subtotal.openingQuantity,
      openingTotalAmount: acc.openingTotalAmount + group.subtotal.openingTotalAmount,
      monthlyImportQuantity: acc.monthlyImportQuantity + group.subtotal.monthlyImportQuantity,
      monthlyImportAmount: acc.monthlyImportAmount + group.subtotal.monthlyImportAmount,
      monthlyExportQuantity: acc.monthlyExportQuantity + group.subtotal.monthlyExportQuantity,
      monthlyExportAmount: acc.monthlyExportAmount + group.subtotal.monthlyExportAmount,
      closingQuantity: acc.closingQuantity + group.subtotal.closingQuantity,
      closingTotalAmount: acc.closingTotalAmount + group.subtotal.closingTotalAmount,
      yearlyImportQuantity: acc.yearlyImportQuantity + group.subtotal.yearlyImportQuantity,
      yearlyImportAmount: acc.yearlyImportAmount + group.subtotal.yearlyImportAmount,
      yearlyExportQuantity: acc.yearlyExportQuantity + group.subtotal.yearlyExportQuantity,
      yearlyExportAmount: acc.yearlyExportAmount + group.subtotal.yearlyExportAmount,
      suggestedPurchaseQuantity: acc.suggestedPurchaseQuantity + group.subtotal.suggestedPurchaseQuantity,
      suggestedPurchaseAmount: acc.suggestedPurchaseAmount + group.subtotal.suggestedPurchaseAmount,
    }), {
      openingQuantity: 0,
      openingTotalAmount: 0,
      monthlyImportQuantity: 0,
      monthlyImportAmount: 0,
      monthlyExportQuantity: 0,
      monthlyExportAmount: 0,
      closingQuantity: 0,
      closingTotalAmount: 0,
      yearlyImportQuantity: 0,
      yearlyImportAmount: 0,
      yearlyExportQuantity: 0,
      yearlyExportAmount: 0,
      suggestedPurchaseQuantity: 0,
      suggestedPurchaseAmount: 0,
    });

    return {
      month: currentMonth,
      year: currentYear,
      groups: result,
      grandTotal
    };
  }

  /**
   * Lấy dữ liệu inventory chi tiết theo năm với breakdown từng tháng
   */
  async getDetailedYearlyInventory(params: { month: number; year: number; categoryId?: string }) {
    const { month, year, categoryId } = params;

    // Lấy tất cả inventories của năm đó
    const inventories = await this.prisma.medicineInventory.findMany({
      where: {
        year,
        ...(categoryId && {
          medicine: {
            categoryId
          }
        })
      },
      include: {
        medicine: {
          include: {
            category: true
          }
        }
      },
      orderBy: [
        { medicine: { category: { sortOrder: 'asc' } } },
        { medicine: { name: 'asc' } },
        { month: 'asc' }
      ]
    });

    // Lấy tồn cuối năm trước (tháng 12 của năm trước)
    const previousYearClosing = await this.prisma.medicineInventory.findMany({
      where: {
        month: 12,
        year: year - 1,
        ...(categoryId && {
          medicine: {
            categoryId
          }
        })
      },
      include: {
        medicine: {
          include: {
            category: true
          }
        }
      }
    });

    // Group by medicine
    const medicineGroups = new Map();
    
    inventories.forEach(inv => {
      if (!medicineGroups.has(inv.medicineId)) {
        medicineGroups.set(inv.medicineId, {
          medicine: inv.medicine,
          months: Array(12).fill(null).map(() => ({
            importQuantity: 0,
            importUnitPrice: 0,
            importAmount: 0,
            exportQuantity: 0,
            exportUnitPrice: 0,
            exportAmount: 0
          })),
          previousYearClosing: {
            quantity: 0,
            unitPrice: 0,
            totalAmount: 0
          },
          currentMonthData: null
        });
      }

      const data = medicineGroups.get(inv.medicineId);
      const monthIndex = inv.month - 1;
      
      // Store monthly data
      data.months[monthIndex] = {
        importQuantity: Number(inv.monthlyImportQuantity || 0),
        importUnitPrice: Number(inv.monthlyImportUnitPrice || 0),
        importAmount: Number(inv.monthlyImportAmount || 0),
        exportQuantity: Number(inv.monthlyExportQuantity || 0),
        exportUnitPrice: Number(inv.monthlyExportUnitPrice || 0),
        exportAmount: Number(inv.monthlyExportAmount || 0)
      };

      // Store current month full data
      if (inv.month === month) {
        data.currentMonthData = inv;
      }
    });

    // Add previous year closing
    previousYearClosing.forEach(inv => {
      if (medicineGroups.has(inv.medicineId)) {
        const data = medicineGroups.get(inv.medicineId);
        data.previousYearClosing = {
          quantity: Number(inv.closingQuantity || 0),
          unitPrice: Number(inv.closingUnitPrice || 0),
          totalAmount: Number(inv.closingTotalAmount || 0)
        };
      }
    });

    // Group by category
    const categoryGroups = new Map();
    
    medicineGroups.forEach((data, medicineId) => {
      const categoryId = data.medicine.categoryId;
      if (!categoryGroups.has(categoryId)) {
        categoryGroups.set(categoryId, {
          category: data.medicine.category,
          items: [],
          subtotal: this.createEmptyTotals()
        });
      }

      const group = categoryGroups.get(categoryId);
      
      // Calculate totals
      const totalImport = data.months.reduce((sum, m) => ({
        quantity: sum.quantity + m.importQuantity,
        amount: sum.amount + m.importAmount
      }), { quantity: 0, amount: 0 });

      const totalExport = data.months.reduce((sum, m) => ({
        quantity: sum.quantity + m.exportQuantity,
        amount: sum.amount + m.exportAmount
      }), { quantity: 0, amount: 0 });

      const item = {
        medicine: data.medicine,
        currentMonthData: data.currentMonthData,
        previousYearClosing: data.previousYearClosing,
        monthlyImport: data.months.map(m => ({
          quantity: m.importQuantity,
          unitPrice: m.importUnitPrice,
          amount: m.importAmount
        })),
        monthlyExport: data.months.map(m => ({
          quantity: m.exportQuantity,
          unitPrice: m.exportUnitPrice,
          amount: m.exportAmount
        })),
        totalImport,
        totalExport
      };

      group.items.push(item);

      // Update subtotal
      this.addToTotals(group.subtotal, item);
    });

    // Calculate grand total
    const grandTotal = this.createEmptyTotals();
    const groups = Array.from(categoryGroups.values());
    
    groups.forEach(group => {
      this.addToTotals(grandTotal, { subtotal: group.subtotal });
    });

    return {
      month,
      year,
      groups,
      grandTotal
    };
  }

  private createEmptyTotals() {
    return {
      previousYearClosing: { quantity: 0, unitPrice: 0, totalAmount: 0 },
      monthlyImport: Array(12).fill(null).map(() => ({ quantity: 0, unitPrice: 0, amount: 0 })),
      monthlyExport: Array(12).fill(null).map(() => ({ quantity: 0, unitPrice: 0, amount: 0 })),
      totalImport: { quantity: 0, amount: 0 },
      totalExport: { quantity: 0, amount: 0 },
      currentMonth: {
        openingQuantity: 0,
        openingUnitPrice: 0,
        openingTotalAmount: 0,
        monthlyImportQuantity: 0,
        monthlyImportUnitPrice: 0,
        monthlyImportAmount: 0,
        monthlyExportQuantity: 0,
        monthlyExportUnitPrice: 0,
        monthlyExportAmount: 0,
        closingQuantity: 0,
        closingUnitPrice: 0,
        closingTotalAmount: 0,
        yearlyImportQuantity: 0,
        yearlyImportUnitPrice: 0,
        yearlyImportAmount: 0,
        yearlyExportQuantity: 0,
        yearlyExportUnitPrice: 0,
        yearlyExportAmount: 0,
        suggestedPurchaseQuantity: 0,
        suggestedPurchaseUnitPrice: 0,
        suggestedPurchaseAmount: 0
      }
    };
  }

  private addToTotals(totals: any, item: any) {
    // Add from individual item
    if (item.previousYearClosing) {
      totals.previousYearClosing.quantity += item.previousYearClosing.quantity;
      totals.previousYearClosing.totalAmount += item.previousYearClosing.totalAmount;
    }
    
    if (item.totalImport) {
      totals.totalImport.quantity += item.totalImport.quantity;
      totals.totalImport.amount += item.totalImport.amount;
    }
    
    if (item.totalExport) {
      totals.totalExport.quantity += item.totalExport.quantity;
      totals.totalExport.amount += item.totalExport.amount;
    }

    if (item.monthlyImport) {
      item.monthlyImport.forEach((m: any, i: number) => {
        totals.monthlyImport[i].quantity += m.quantity;
        totals.monthlyImport[i].amount += m.amount;
      });
    }

    if (item.monthlyExport) {
      item.monthlyExport.forEach((m: any, i: number) => {
        totals.monthlyExport[i].quantity += m.quantity;
        totals.monthlyExport[i].amount += m.amount;
      });
    }

    // Add current month data
    if (item.currentMonthData) {
      const cm = item.currentMonthData;
      totals.currentMonth.openingQuantity += Number(cm.openingQuantity || 0);
      totals.currentMonth.openingTotalAmount += Number(cm.openingTotalAmount || 0);
      totals.currentMonth.monthlyImportQuantity += Number(cm.monthlyImportQuantity || 0);
      totals.currentMonth.monthlyImportAmount += Number(cm.monthlyImportAmount || 0);
      totals.currentMonth.monthlyExportQuantity += Number(cm.monthlyExportQuantity || 0);
      totals.currentMonth.monthlyExportAmount += Number(cm.monthlyExportAmount || 0);
      totals.currentMonth.closingQuantity += Number(cm.closingQuantity || 0);
      totals.currentMonth.closingTotalAmount += Number(cm.closingTotalAmount || 0);
      totals.currentMonth.yearlyImportQuantity += Number(cm.yearlyImportQuantity || 0);
      totals.currentMonth.yearlyImportAmount += Number(cm.yearlyImportAmount || 0);
      totals.currentMonth.yearlyExportQuantity += Number(cm.yearlyExportQuantity || 0);
      totals.currentMonth.yearlyExportAmount += Number(cm.yearlyExportAmount || 0);
      totals.currentMonth.suggestedPurchaseQuantity += Number(cm.suggestedPurchaseQuantity || 0);
      totals.currentMonth.suggestedPurchaseAmount += Number(cm.suggestedPurchaseAmount || 0);
    }

    // Add from subtotal (for grandTotal calculation)
    if (item.subtotal) {
      const sub = item.subtotal;
      
      totals.previousYearClosing.quantity += sub.previousYearClosing.quantity;
      totals.previousYearClosing.totalAmount += sub.previousYearClosing.totalAmount;
      
      totals.totalImport.quantity += sub.totalImport.quantity;
      totals.totalImport.amount += sub.totalImport.amount;
      
      totals.totalExport.quantity += sub.totalExport.quantity;
      totals.totalExport.amount += sub.totalExport.amount;
      
      sub.monthlyImport.forEach((m: any, i: number) => {
        totals.monthlyImport[i].quantity += m.quantity;
        totals.monthlyImport[i].amount += m.amount;
      });
      
      sub.monthlyExport.forEach((m: any, i: number) => {
        totals.monthlyExport[i].quantity += m.quantity;
        totals.monthlyExport[i].amount += m.amount;
      });
      
      // Add current month from subtotal
      if (sub.currentMonth) {
        totals.currentMonth.openingQuantity += sub.currentMonth.openingQuantity;
        totals.currentMonth.openingTotalAmount += sub.currentMonth.openingTotalAmount;
        totals.currentMonth.monthlyImportQuantity += sub.currentMonth.monthlyImportQuantity;
        totals.currentMonth.monthlyImportAmount += sub.currentMonth.monthlyImportAmount;
        totals.currentMonth.monthlyExportQuantity += sub.currentMonth.monthlyExportQuantity;
        totals.currentMonth.monthlyExportAmount += sub.currentMonth.monthlyExportAmount;
        totals.currentMonth.closingQuantity += sub.currentMonth.closingQuantity;
        totals.currentMonth.closingTotalAmount += sub.currentMonth.closingTotalAmount;
        totals.currentMonth.yearlyImportQuantity += sub.currentMonth.yearlyImportQuantity;
        totals.currentMonth.yearlyImportAmount += sub.currentMonth.yearlyImportAmount;
        totals.currentMonth.yearlyExportQuantity += sub.currentMonth.yearlyExportQuantity;
        totals.currentMonth.yearlyExportAmount += sub.currentMonth.yearlyExportAmount;
        totals.currentMonth.suggestedPurchaseQuantity += sub.currentMonth.suggestedPurchaseQuantity;
        totals.currentMonth.suggestedPurchaseAmount += sub.currentMonth.suggestedPurchaseAmount;
      }
    }
  }

  /**
   * Lấy tồn kho hiện tại của 1 thuốc
   */
  async getCurrentStock(medicineId: string) {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    const inventory = await this.prisma.medicineInventory.findUnique({
      where: {
        medicineId_month_year: {
          medicineId,
          month: currentMonth,
          year: currentYear
        }
      },
      include: {
        medicine: {
          include: {
            category: true
          }
        }
      }
    });

    if (!inventory) {
      // Nếu chưa có inventory cho tháng này, trả về 0
      const medicine = await this.prisma.medicine.findUnique({
        where: { id: medicineId },
        include: { category: true }
      });

      if (!medicine) {
        throw new NotFoundException(`Medicine with ID ${medicineId} not found`);
      }

      return {
        medicine,
        currentStock: 0,
        unitPrice: 0,
        totalValue: 0,
        expiryDate: null
      };
    }

    return {
      medicine: inventory.medicine,
      currentStock: Number(inventory.closingQuantity),
      unitPrice: Number(inventory.closingUnitPrice),
      totalValue: Number(inventory.closingTotalAmount),
      expiryDate: inventory.expiryDate
    };
  }

  /**
   * Cập nhật thông tin inventory balance thủ công
   */
  async updateInventoryBalanceManual(data: UpdateInventoryBalanceDto) {
    const { medicineId, month, year, ...updateFields } = data;

    // Tính toán các giá trị
    const openingAmount = updateFields.openingQuantity && updateFields.openingUnitPrice
      ? updateFields.openingQuantity * updateFields.openingUnitPrice
      : undefined;

    const suggestedAmount = updateFields.suggestedPurchaseQuantity && updateFields.suggestedPurchaseUnitPrice
      ? updateFields.suggestedPurchaseQuantity * updateFields.suggestedPurchaseUnitPrice
      : undefined;

    return this.prisma.medicineInventory.upsert({
      where: {
        medicineId_month_year: {
          medicineId,
          month,
          year
        }
      },
      update: {
        ...updateFields,
        openingTotalAmount: openingAmount,
        suggestedPurchaseAmount: suggestedAmount,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : undefined,
      },
      create: {
        medicineId,
        month,
        year,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
        openingQuantity: updateFields.openingQuantity || 0,
        openingUnitPrice: updateFields.openingUnitPrice || 0,
        openingTotalAmount: openingAmount || 0,
        suggestedPurchaseQuantity: updateFields.suggestedPurchaseQuantity || 0,
        suggestedPurchaseUnitPrice: updateFields.suggestedPurchaseUnitPrice || 0,
        suggestedPurchaseAmount: suggestedAmount || 0,
      },
      include: {
        medicine: {
          include: {
            category: true
          }
        }
      }
    });
  }

  /**
   * Extract month and year from Excel title
   * Format: "QT THUỐC THÁNG 09 NĂM 2025 _ ĐỀ NGHỊ MUA THUỐC THÁNG 10 NĂM 2025"
   * Returns: { currentMonth: 9, currentYear: 2025, suggestedMonth: 10, suggestedYear: 2025 }
   */
  private extractMonthYearFromTitle(title: string): {
    currentMonth: number;
    currentYear: number;
    suggestedMonth: number;
    suggestedYear: number;
  } | null {
    if (!title) return null;

    // Normalize title: remove extra spaces, normalize Vietnamese characters
    const normalizedTitle = title.replace(/\s+/g, ' ').trim().toUpperCase();
    console.log(`🔍 Normalized title: ${normalizedTitle}`);

    // Pattern: QT THUỐC THÁNG XX NĂM YYYY (flexible spacing)
    const currentMatch = normalizedTitle.match(/QT\s+THU[OỐ]C\s+TH[AÁ]NG\s+(\d{1,2})\s+N[AĂ]M\s+(\d{4})/);
    const suggestedMatch = normalizedTitle.match(/[DĐ][EỀ]\s+NGH[IỊ]\s+MUA\s+THU[OỐ]C\s+TH[AÁ]NG\s+(\d{1,2})\s+N[AĂ]M\s+(\d{4})/);

    if (!currentMatch) {
      console.warn('⚠️ Could not extract current month/year from title:', normalizedTitle);
      console.warn('⚠️ Expected format: "QT THUỐC THÁNG XX NĂM YYYY"');
      return null;
    }

    const currentMonth = parseInt(currentMatch[1]);
    const currentYear = parseInt(currentMatch[2]);
    let suggestedMonth = currentMonth + 1;
    let suggestedYear = currentYear;

    // If suggested month/year found in title, use it
    if (suggestedMatch) {
      suggestedMonth = parseInt(suggestedMatch[1]);
      suggestedYear = parseInt(suggestedMatch[2]);
    } else {
      // Calculate next month if not found
      if (suggestedMonth > 12) {
        suggestedMonth = 1;
        suggestedYear++;
      }
    }

    console.log(`📅 Detected from title: Current ${currentMonth}/${currentYear}, Suggested ${suggestedMonth}/${suggestedYear}`);

    return {
      currentMonth,
      currentYear,
      suggestedMonth,
      suggestedYear
    };
  }

  /**
   * Import inventory data from Excel file buffer
   * Auto-detects month/year from title row
   */
  async importFromExcelFile(fileBuffer: Buffer): Promise<{
    imported: number;
    updated: number;
    skipped: number;
    errors: any[];
    month: number;
    year: number;
  }> {
    console.log(`📖 Reading Excel file from buffer`);

    const XLSX = await import('xlsx');
    
    // Read file from buffer
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    console.log(`📋 Sheet name: ${sheetName}`);

    // Read title row (row 1) - search in cells A1, B1, C1, etc. for merged cells
    let title = '';
    const possibleTitleCells = ['A1', 'B1', 'C1', 'D1', 'E1', 'F1'];
    for (const cellRef of possibleTitleCells) {
      const cell = worksheet[cellRef];
      if (cell?.v || cell?.w) {
        const cellValue = (cell.v || cell.w || '').toString();
        if (cellValue.includes('QT') && cellValue.includes('THUỐC')) {
          title = cellValue;
          break;
        }
      }
    }
    
    console.log(`📋 Title found: ${title}`);

    // Extract month/year from title
    const dateInfo = this.extractMonthYearFromTitle(title);
    if (!dateInfo) {
      throw new Error('Không thể xác định tháng/năm từ tiêu đề Excel. Format yêu cầu: "QT THUỐC THÁNG XX NĂM YYYY _ ĐỀ NGHỊ MUA THUỐC THÁNG YY NĂM YYYY"');
    }

    const { currentMonth: month, currentYear: year } = dateInfo;

    // Convert to array format, starting from row 9 (0-indexed: 8)
    const data = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      range: 8
    }) as any[][];

    console.log(`📊 Found ${data.length} rows`);
    console.log(`📅 Importing for month: ${month}/${year}`);

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let errors: any[] = [];
    let currentCategory: string | undefined;

    for (const row of data) {
      try {
        // Skip empty rows
        if (!row || row.length === 0) {
          skipped++;
          continue;
        }

        // Check if this is a category header row
        const firstCell = row[0]?.toString() || '';
        const secondCell = row[1]?.toString() || '';
        
        const categoryMatch = firstCell.match(/^(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI|XVII)\s*-/);
        if (categoryMatch) {
          currentCategory = categoryMatch[1];
          console.log(`\n📁 Category: ${currentCategory} - ${firstCell}`);
          continue;
        }

        // Skip total rows, signature section, and date rows
        const skipPatterns = [
          'TỔNG CỘNG', 'Tổng cộng',
          'Ngày', 'NGÀY', 'ngày',
          'TGĐ', 'TỔNG HỢP', 'Tổng hợp',
          'KẾ TOÁN', 'Kế toán',
          'Giám đốc', 'GIÁM ĐỐC',
          'LÊ THANH', 'PHAN THỊ',
          'CHỮ KÝ', 'chữ ký'
        ];
        
        const shouldSkip = skipPatterns.some(pattern => 
          firstCell.includes(pattern) || secondCell.includes(pattern)
        );
        
        if (shouldSkip) {
          console.log(`⊘ Skipping signature/date row: ${firstCell} | ${secondCell}`);
          skipped++;
          continue;
        }

        // Validate required columns
        const stt = row[0]?.toString().trim();
        const medicineName = row[1]?.toString().trim();
        const units = row[5]?.toString().trim();

        if (!stt || !medicineName || !units) {
          skipped++;
          continue;
        }

        // Skip invalid names
        const invalidPatterns = ['TGD', 'THANH', 'LỄ', 'CHỮ KÝ', 'GIÁM ĐỐC'];
        if (invalidPatterns.some(pattern => medicineName.toUpperCase().includes(pattern))) {
          skipped++;
          continue;
        }

        // Progress indicator
        if ((imported + updated) % 10 === 0 && (imported + updated) > 0) {
          process.stdout.write(`\r⏳ Processing... ${imported + updated} medicines`);
        }

        // Parse data from row
        const route = row[2]?.toString().trim() || null;
        const strength = row[3]?.toString().trim() || null;
        const manufacturer = row[4]?.toString().trim() || null;

        // Parse numeric columns
        const openingQty = parseFloat(row[6]) || 0;
        const openingPrice = parseFloat(row[7]) || 0;
        const openingAmount = parseFloat(row[8]) || 0;

        const monthlyImportQty = parseFloat(row[9]) || 0;
        const monthlyImportPrice = parseFloat(row[10]) || 0;
        const monthlyImportAmount = parseFloat(row[11]) || 0;

        const monthlyExportQty = parseFloat(row[12]) || 0;
        const monthlyExportPrice = parseFloat(row[13]) || 0;
        const monthlyExportAmount = parseFloat(row[14]) || 0;

        const closingQty = parseFloat(row[15]) || 0;
        const closingPrice = parseFloat(row[16]) || 0;
        const closingAmount = parseFloat(row[17]) || 0;

        const expiryStr = row[18]?.toString().trim();

        const yearlyImportQty = parseFloat(row[19]) || 0;
        const yearlyImportPrice = parseFloat(row[20]) || 0;
        const yearlyImportAmount = parseFloat(row[21]) || 0;

        const yearlyExportQty = parseFloat(row[22]) || 0;
        const yearlyExportPrice = parseFloat(row[23]) || 0;
        const yearlyExportAmount = parseFloat(row[24]) || 0;

        const suggestedQty = parseFloat(row[25]) || 0;
        const suggestedPrice = parseFloat(row[26]) || 0;
        const suggestedAmount = parseFloat(row[27]) || 0;

        // Determine category and item type
        let categoryId: string | undefined;
        let itemType = 'MEDICINE' as any;

        if (currentCategory) {
          let category = await this.prisma.medicineCategory.findUnique({
            where: { code: currentCategory }
          });

          if (category) {
            itemType = category.type;
            categoryId = category.id;
          }
        }

        // Find or create medicine
        let medicine = await this.prisma.medicine.findFirst({
          where: {
            name: medicineName,
            isActive: true
          }
        });

        if (!medicine) {
          medicine = await this.prisma.medicine.create({
            data: {
              name: medicineName,
              type: itemType,
              categoryId,
              route,
              strength,
              manufacturer,
              units,
            }
          });
          imported++;
        } else {
          medicine = await this.prisma.medicine.update({
            where: { id: medicine.id },
            data: {
              type: itemType,
              categoryId: categoryId !== undefined ? categoryId : medicine.categoryId,
              route: route || medicine.route,
              strength: strength || medicine.strength,
              manufacturer: manufacturer || medicine.manufacturer,
              units: units || medicine.units,
            }
          });
          updated++;
        }

        // Parse expiry date
        let expiryDate: Date | null = null;
        if (expiryStr) {
          try {
            if (expiryStr.includes('/')) {
              const parts = expiryStr.split('/');
              if (parts.length === 3) {
                const part1 = parseInt(parts[0]);
                const part2 = parseInt(parts[1]);
                const year = parseInt(parts[2]);

                let day: number, month: number;

                if (part1 > 12) {
                  day = part1;
                  month = part2;
                } else if (part2 > 12) {
                  month = part1;
                  day = part2;
                } else {
                  day = part1;
                  month = part2;
                }

                if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
                  const isoDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const testDate = new Date(isoDateStr);

                  if (testDate.getFullYear() === year &&
                      testDate.getMonth() + 1 === month &&
                      testDate.getDate() === day) {
                    expiryDate = testDate;
                  }
                }
              }
            } else if (expiryStr.includes('-')) {
              expiryDate = new Date(expiryStr);
              if (isNaN(expiryDate.getTime())) {
                expiryDate = null;
              }
            } else {
              const serialDate = parseFloat(expiryStr);
              if (!isNaN(serialDate) && serialDate > 0) {
                let days = Math.floor(serialDate);
                if (days > 59) {
                  days = days - 1;
                }
                const year1900 = new Date(Date.UTC(1900, 0, 1));
                expiryDate = new Date(year1900.getTime() + (days - 1) * 24 * 60 * 60 * 1000);

                if (isNaN(expiryDate.getTime())) {
                  expiryDate = null;
                }
              }
            }
          } catch (e: any) {
            console.warn(`⚠️ Error parsing expiry date: ${expiryStr}`, e.message);
            expiryDate = null;
          }
        }

        // Upsert MedicineInventory
        await this.prisma.medicineInventory.upsert({
          where: {
            medicineId_month_year: {
              medicineId: medicine.id,
              month,
              year
            }
          },
          update: {
            expiryDate,
            openingQuantity: openingQty,
            openingUnitPrice: openingPrice,
            openingTotalAmount: openingAmount,
            monthlyImportQuantity: monthlyImportQty,
            monthlyImportUnitPrice: monthlyImportPrice,
            monthlyImportAmount: monthlyImportAmount,
            monthlyExportQuantity: monthlyExportQty,
            monthlyExportUnitPrice: monthlyExportPrice,
            monthlyExportAmount: monthlyExportAmount,
            closingQuantity: closingQty,
            closingUnitPrice: closingPrice,
            closingTotalAmount: closingAmount,
            yearlyImportQuantity: yearlyImportQty,
            yearlyImportUnitPrice: yearlyImportPrice,
            yearlyImportAmount: yearlyImportAmount,
            yearlyExportQuantity: yearlyExportQty,
            yearlyExportUnitPrice: yearlyExportPrice,
            yearlyExportAmount: yearlyExportAmount,
            suggestedPurchaseQuantity: suggestedQty,
            suggestedPurchaseUnitPrice: suggestedPrice,
            suggestedPurchaseAmount: suggestedAmount,
          },
          create: {
            medicineId: medicine.id,
            month,
            year,
            expiryDate,
            openingQuantity: openingQty,
            openingUnitPrice: openingPrice,
            openingTotalAmount: openingAmount,
            monthlyImportQuantity: monthlyImportQty,
            monthlyImportUnitPrice: monthlyImportPrice,
            monthlyImportAmount: monthlyImportAmount,
            monthlyExportQuantity: monthlyExportQty,
            monthlyExportUnitPrice: monthlyExportPrice,
            monthlyExportAmount: monthlyExportAmount,
            closingQuantity: closingQty,
            closingUnitPrice: closingPrice,
            closingTotalAmount: closingAmount,
            yearlyImportQuantity: yearlyImportQty,
            yearlyImportUnitPrice: yearlyImportPrice,
            yearlyImportAmount: yearlyImportAmount,
            yearlyExportQuantity: yearlyExportQty,
            yearlyExportUnitPrice: yearlyExportPrice,
            yearlyExportAmount: yearlyExportAmount,
            suggestedPurchaseQuantity: suggestedQty,
            suggestedPurchaseUnitPrice: suggestedPrice,
            suggestedPurchaseAmount: suggestedAmount,
          }
        });
      } catch (error) {
        errors.push({
          row: row[0],
          medicine: row[1],
          error: error.message
        });
      }
    }

    console.log(`\n✅ Import completed:`);
    console.log(`   - Imported: ${imported} new medicines`);
    console.log(`   - Updated: ${updated} existing medicines`);
    console.log(`   - Skipped: ${skipped} rows`);
    if (errors.length > 0) {
      console.log(`   - Errors: ${errors.length}`);
    }

    return {
      imported,
      updated,
      skipped,
      errors,
      month,
      year
    };
  }
}
