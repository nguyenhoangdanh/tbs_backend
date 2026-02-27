import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
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

/** Convert a value (number | string | Prisma.Decimal | null | undefined) to Prisma.Decimal safely */
function D(v: unknown): Prisma.Decimal {
  if (v === null || v === undefined) return new Prisma.Decimal(0);
  return new Prisma.Decimal(String(v));
}

/** Serialize one MedicineInventory row for API response:
 *  - Quantities returned as Number (integers / simple decimals)
 *  - Unit-prices and amounts returned as STRING to preserve up to 20 d.p.
 */
function serializeInventoryRow(inv: any) {
  return {
    ...inv,
    openingQuantity: Number(inv.openingQuantity),
    openingUnitPrice: D(inv.openingUnitPrice).toFixed(),
    openingTotalAmount: D(inv.openingTotalAmount).toFixed(),
    monthlyImportQuantity: Number(inv.monthlyImportQuantity),
    monthlyImportUnitPrice: D(inv.monthlyImportUnitPrice).toFixed(),
    monthlyImportAmount: D(inv.monthlyImportAmount).toFixed(),
    monthlyExportQuantity: Number(inv.monthlyExportQuantity),
    monthlyExportUnitPrice: D(inv.monthlyExportUnitPrice).toFixed(),
    monthlyExportAmount: D(inv.monthlyExportAmount).toFixed(),
    closingQuantity: Number(inv.closingQuantity),
    closingUnitPrice: D(inv.closingUnitPrice).toFixed(),
    closingTotalAmount: D(inv.closingTotalAmount).toFixed(),
    yearlyImportQuantity: Number(inv.yearlyImportQuantity),
    yearlyImportUnitPrice: D(inv.yearlyImportUnitPrice).toFixed(),
    yearlyImportAmount: D(inv.yearlyImportAmount).toFixed(),
    yearlyExportQuantity: Number(inv.yearlyExportQuantity),
    yearlyExportUnitPrice: D(inv.yearlyExportUnitPrice).toFixed(),
    yearlyExportAmount: D(inv.yearlyExportAmount).toFixed(),
    suggestedPurchaseQuantity: Number(inv.suggestedPurchaseQuantity),
    suggestedPurchaseUnitPrice: D(inv.suggestedPurchaseUnitPrice).toFixed(),
    suggestedPurchaseAmount: D(inv.suggestedPurchaseAmount).toFixed(),
  };
}

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
          select: { medicines: true },
        },
      },
    });
  }

  async createMedicineCategory(data: CreateMedicineCategoryDto) {
    return this.prisma.medicineCategory.create({
      data,
    });
  }

  async updateMedicineCategory(id: string, data: UpdateMedicineCategoryDto) {
    return this.prisma.medicineCategory.update({
      where: { id },
      data,
    });
  }

  async deleteMedicineCategory(id: string) {
    return this.prisma.medicineCategory.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // ==================== INVENTORY TRANSACTION MANAGEMENT ====================

  /**
   * Tạo giao dịch xuất/nhập kho
   * Tự động cập nhật MedicineInventory theo tháng/năm
   */
  async createInventoryTransaction(data: CreateInventoryTransactionDto) {
    // Dùng Decimal để giữ toàn bộ độ chính xác unitPrice (string, đến 20 d.p.)
    const dPrice = D(data.unitPrice ?? 0);
    const dQty = D(data.quantity);
    const dAmount = dQty.times(dPrice);

    const transactionDate = data.transactionDate
      ? new Date(data.transactionDate)
      : new Date();
    const month = transactionDate.getMonth() + 1;
    const year = transactionDate.getFullYear();

    return this.prisma.$transaction(async (prisma) => {
      // 1. Tạo transaction record – lưu amount dạng string Decimal
      const transaction = await prisma.inventoryTransaction.create({
        data: {
          medicineId: data.medicineId,
          type: data.type,
          quantity: dQty.toFixed(),
          unitPrice: dPrice.toFixed(),
          totalAmount: dAmount.toFixed(),
          transactionDate,
          expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
          batchNumber: data.batchNumber,
          supplier: data.supplier,
          referenceType: data.referenceType,
          referenceId: data.referenceId,
          notes: data.notes,
          createdBy: data.createdBy,
        },
        include: { medicine: true },
      });

      // 2. Cập nhật MedicineInventory – truyền string để giữ độ chính xác
      await this.updateInventoryBalance(
        data.medicineId,
        month,
        year,
        data.type,
        dQty.toFixed(),
        dPrice.toFixed(),
        data.expiryDate ? new Date(data.expiryDate) : undefined,
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
    quantity: number | string,
    unitPrice: number | string,
    expiryDate?: Date,
  ) {
    // ── Tìm hoặc tạo inventory record cho tháng này ──────────────────────────
    let inventory = await this.prisma.medicineInventory.findUnique({
      where: { medicineId_month_year: { medicineId, month, year } },
    });

    if (!inventory) {
      const previousMonth = month === 1 ? 12 : month - 1;
      const previousYear = month === 1 ? year - 1 : year;

      const prev = await this.prisma.medicineInventory.findUnique({
        where: {
          medicineId_month_year: {
            medicineId,
            month: previousMonth,
            year: previousYear,
          },
        },
      });

      inventory = await this.prisma.medicineInventory.create({
        data: {
          medicineId,
          month,
          year,
          expiryDate,
          // Kế thừa tồn cuối kỳ tháng trước
          openingQuantity: prev?.closingQuantity ?? 0,
          openingUnitPrice: prev?.closingUnitPrice ?? 0,
          openingTotalAmount: prev?.closingTotalAmount ?? 0,
          // Kế thừa lũy kế năm từ tháng trước (chỉ khi cùng năm, tức month > 1)
          // Nếu month = 1 (tháng Giêng) thì lũy kế năm reset về 0
          yearlyImportQuantity:
            month > 1 ? (prev?.yearlyImportQuantity ?? 0) : 0,
          yearlyImportUnitPrice:
            month > 1 ? (prev?.yearlyImportUnitPrice ?? 0) : 0,
          yearlyImportAmount: month > 1 ? (prev?.yearlyImportAmount ?? 0) : 0,
          yearlyExportQuantity:
            month > 1 ? (prev?.yearlyExportQuantity ?? 0) : 0,
          yearlyExportUnitPrice:
            month > 1 ? (prev?.yearlyExportUnitPrice ?? 0) : 0,
          yearlyExportAmount: month > 1 ? (prev?.yearlyExportAmount ?? 0) : 0,
        },
      });
    }

    // ── Tất cả arithmetic dùng Prisma.Decimal để giữ đủ 20 chữ số thập phân ──
    const dQty = D(quantity);
    const dPrice = D(unitPrice);
    const dAmount = dQty.times(dPrice);

    let updateData: Prisma.MedicineInventoryUpdateInput = {};

    if (transactionType === InventoryTransactionTypeDto.IMPORT) {
      const newMonthImportQty = D(inventory.monthlyImportQuantity).plus(dQty);
      const newMonthImportAmount = D(inventory.monthlyImportAmount).plus(
        dAmount,
      );
      const newMonthImportPrice = newMonthImportQty.gt(0)
        ? newMonthImportAmount.div(newMonthImportQty)
        : dPrice;

      const newYearImportQty = D(inventory.yearlyImportQuantity).plus(dQty);
      const newYearImportAmount = D(inventory.yearlyImportAmount).plus(dAmount);
      const newYearImportPrice = newYearImportQty.gt(0)
        ? newYearImportAmount.div(newYearImportQty)
        : dPrice;

      updateData = {
        monthlyImportQuantity: newMonthImportQty.toFixed(),
        monthlyImportUnitPrice: newMonthImportPrice.toFixed(),
        monthlyImportAmount: newMonthImportAmount.toFixed(),
        yearlyImportQuantity: newYearImportQty.toFixed(),
        yearlyImportUnitPrice: newYearImportPrice.toFixed(),
        yearlyImportAmount: newYearImportAmount.toFixed(),
        ...(expiryDate ? { expiryDate } : {}),
      };
    } else if (transactionType === InventoryTransactionTypeDto.EXPORT) {
      const newMonthExportQty = D(inventory.monthlyExportQuantity).plus(dQty);
      const newMonthExportAmount = D(inventory.monthlyExportAmount).plus(
        dAmount,
      );
      const newMonthExportPrice = newMonthExportQty.gt(0)
        ? newMonthExportAmount.div(newMonthExportQty)
        : dPrice;

      const newYearExportQty = D(inventory.yearlyExportQuantity).plus(dQty);
      const newYearExportAmount = D(inventory.yearlyExportAmount).plus(dAmount);
      const newYearExportPrice = newYearExportQty.gt(0)
        ? newYearExportAmount.div(newYearExportQty)
        : dPrice;

      updateData = {
        monthlyExportQuantity: newMonthExportQty.toFixed(),
        monthlyExportUnitPrice: newMonthExportPrice.toFixed(),
        monthlyExportAmount: newMonthExportAmount.toFixed(),
        yearlyExportQuantity: newYearExportQty.toFixed(),
        yearlyExportUnitPrice: newYearExportPrice.toFixed(),
        yearlyExportAmount: newYearExportAmount.toFixed(),
      };
    } else if (transactionType === InventoryTransactionTypeDto.ADJUSTMENT) {
      // ADJUSTMENT: quantity > 0 → nhập thêm; quantity < 0 → xuất bớt
      // ĐÃ SỬA: cập nhật cả lũy kế năm (trước đây bỏ sót)
      if (dQty.gt(0)) {
        const newMonthImportQty = D(inventory.monthlyImportQuantity).plus(dQty);
        const newMonthImportAmount = D(inventory.monthlyImportAmount).plus(
          dAmount,
        );
        const newMonthImportPrice = newMonthImportQty.gt(0)
          ? newMonthImportAmount.div(newMonthImportQty)
          : dPrice;

        const newYearImportQty = D(inventory.yearlyImportQuantity).plus(dQty);
        const newYearImportAmount = D(inventory.yearlyImportAmount).plus(
          dAmount,
        );
        const newYearImportPrice = newYearImportQty.gt(0)
          ? newYearImportAmount.div(newYearImportQty)
          : dPrice;

        updateData = {
          monthlyImportQuantity: newMonthImportQty.toFixed(),
          monthlyImportUnitPrice: newMonthImportPrice.toFixed(),
          monthlyImportAmount: newMonthImportAmount.toFixed(),
          yearlyImportQuantity: newYearImportQty.toFixed(),
          yearlyImportUnitPrice: newYearImportPrice.toFixed(),
          yearlyImportAmount: newYearImportAmount.toFixed(),
        };
      } else {
        const adjQty = dQty.abs();
        const adjAmount = dAmount.abs();

        const newMonthExportQty = D(inventory.monthlyExportQuantity).plus(
          adjQty,
        );
        const newMonthExportAmount = D(inventory.monthlyExportAmount).plus(
          adjAmount,
        );
        const newMonthExportPrice = newMonthExportQty.gt(0)
          ? newMonthExportAmount.div(newMonthExportQty)
          : dPrice.abs();

        const newYearExportQty = D(inventory.yearlyExportQuantity).plus(adjQty);
        const newYearExportAmount = D(inventory.yearlyExportAmount).plus(
          adjAmount,
        );
        const newYearExportPrice = newYearExportQty.gt(0)
          ? newYearExportAmount.div(newYearExportQty)
          : dPrice.abs();

        updateData = {
          monthlyExportQuantity: newMonthExportQty.toFixed(),
          monthlyExportUnitPrice: newMonthExportPrice.toFixed(),
          monthlyExportAmount: newMonthExportAmount.toFixed(),
          yearlyExportQuantity: newYearExportQty.toFixed(),
          yearlyExportUnitPrice: newYearExportPrice.toFixed(),
          yearlyExportAmount: newYearExportAmount.toFixed(),
        };
      }
    }

    // ── Tính tồn cuối kỳ (bình quân gia quyền, dùng Decimal) ─────────────────
    const finalImportQty = D(
      updateData.monthlyImportQuantity ?? inventory.monthlyImportQuantity,
    );
    const finalImportAmount = D(
      updateData.monthlyImportAmount ?? inventory.monthlyImportAmount,
    );
    const finalExportQty = D(
      updateData.monthlyExportQuantity ?? inventory.monthlyExportQuantity,
    );
    const finalExportAmount = D(
      updateData.monthlyExportAmount ?? inventory.monthlyExportAmount,
    );

    const closingQty = D(inventory.openingQuantity)
      .plus(finalImportQty)
      .minus(finalExportQty);

    // Giá trị tổng = (Tồn đầu × ĐG đầu) + Nhập - Xuất
    const totalValue = D(inventory.openingQuantity)
      .times(D(inventory.openingUnitPrice))
      .plus(finalImportAmount)
      .minus(finalExportAmount);

    const closingPrice = closingQty.gt(0)
      ? totalValue.div(closingQty)
      : new Prisma.Decimal(0);
    const closingAmount = closingQty.times(closingPrice);

    updateData.closingQuantity = closingQty.toFixed();
    updateData.closingUnitPrice = closingPrice.toFixed();
    updateData.closingTotalAmount = closingAmount.toFixed();

    return this.prisma.medicineInventory.update({
      where: { medicineId_month_year: { medicineId, month, year } },
      data: updateData,
    });
  }

  /**
   * Lấy lịch sử giao dịch theo thuốc
   */
  async getInventoryTransactions(
    medicineId?: string,
    type?: InventoryTransactionTypeDto,
    startDate?: string,
    endDate?: string,
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
            category: true,
          },
        },
      },
      orderBy: {
        transactionDate: 'desc',
      },
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
      errors: [] as any[],
    };

    for (const medicineData of medicines) {
      try {
        console.log(`\n🔄 Processing medicine: ${medicineData.name}`);
        console.log('  Data:', {
          openingQty: medicineData.openingQuantity,
          openingPrice: medicineData.openingUnitPrice,
          openingAmount: medicineData.openingTotalAmount,
          hasAmount: medicineData.openingTotalAmount !== undefined,
        });

        await this.prisma.$transaction(async (prisma) => {
          // 1. Tạo/tìm category nếu có
          let categoryId: string | undefined;
          if (medicineData.categoryCode) {
            let category = await prisma.medicineCategory.findUnique({
              where: { code: medicineData.categoryCode },
            });

            if (!category) {
              // Tạo category mới nếu chưa có
              category = await prisma.medicineCategory.create({
                data: {
                  code: medicineData.categoryCode,
                  name: `Category ${medicineData.categoryCode}`,
                  sortOrder:
                    parseInt(
                      medicineData.categoryCode.replace(/[^0-9]/g, ''),
                    ) || 0,
                },
              });
            }
            categoryId = category.id;
          }

          // 2. Tạo hoặc cập nhật medicine
          let medicine = await prisma.medicine.findFirst({
            where: {
              name: medicineData.name,
              isActive: true,
            },
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
              },
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
                manufacturer:
                  medicineData.manufacturer || medicine.manufacturer,
                units: medicineData.units || medicine.units,
              },
            });
            results.updated++;
          }

          // 3. Tạo/cập nhật inventory balance cho tháng này
          // ✅ D() helper đảm bảo giữ đủ 20 số thập phân, .toFixed() trả về string chính xác
          const openingQty = Number(medicineData.openingQuantity) || 0;
          const openingPrice = D(medicineData.openingUnitPrice).toFixed();
          const openingAmount =
            medicineData.openingTotalAmount !== undefined
              ? D(medicineData.openingTotalAmount).toFixed()
              : D(openingQty).times(D(openingPrice)).toFixed();

          const monthlyImportQty =
            Number(medicineData.monthlyImportQuantity) || 0;
          const monthlyImportPrice = D(
            medicineData.monthlyImportUnitPrice,
          ).toFixed();
          const monthlyImportAmount =
            medicineData.monthlyImportAmount !== undefined
              ? D(medicineData.monthlyImportAmount).toFixed()
              : D(monthlyImportQty).times(D(monthlyImportPrice)).toFixed();

          const monthlyExportQty =
            Number(medicineData.monthlyExportQuantity) || 0;
          const monthlyExportPrice = D(
            medicineData.monthlyExportUnitPrice,
          ).toFixed();
          const monthlyExportAmount =
            medicineData.monthlyExportAmount !== undefined
              ? D(medicineData.monthlyExportAmount).toFixed()
              : D(monthlyExportQty).times(D(monthlyExportPrice)).toFixed();

          const closingQty = medicineData.closingQuantity
            ? Number(medicineData.closingQuantity)
            : openingQty + monthlyImportQty - monthlyExportQty;
          const closingPrice = D(
            medicineData.closingUnitPrice ?? medicineData.openingUnitPrice,
          ).toFixed();
          const closingAmount =
            medicineData.closingTotalAmount !== undefined
              ? D(medicineData.closingTotalAmount).toFixed()
              : D(closingQty).times(D(closingPrice)).toFixed();

          const yearlyImportQty =
            Number(medicineData.yearlyImportQuantity) || 0;
          const yearlyImportPrice = D(
            medicineData.yearlyImportUnitPrice,
          ).toFixed();
          const yearlyImportAmount =
            medicineData.yearlyImportAmount !== undefined
              ? D(medicineData.yearlyImportAmount).toFixed()
              : D(yearlyImportQty).times(D(yearlyImportPrice)).toFixed();

          const yearlyExportQty =
            Number(medicineData.yearlyExportQuantity) || 0;
          const yearlyExportPrice = D(
            medicineData.yearlyExportUnitPrice,
          ).toFixed();
          const yearlyExportAmount =
            medicineData.yearlyExportAmount !== undefined
              ? D(medicineData.yearlyExportAmount).toFixed()
              : D(yearlyExportQty).times(D(yearlyExportPrice)).toFixed();

          const suggestedQty =
            Number(medicineData.suggestedPurchaseQuantity) || 0;
          const suggestedPrice = D(
            medicineData.suggestedPurchaseUnitPrice,
          ).toFixed();
          const suggestedAmount =
            medicineData.suggestedPurchaseAmount !== undefined
              ? D(medicineData.suggestedPurchaseAmount).toFixed()
              : D(suggestedQty).times(D(suggestedPrice)).toFixed();

          await prisma.medicineInventory.upsert({
            where: {
              medicineId_month_year: {
                medicineId: medicine.id,
                month,
                year,
              },
            },
            update: {
              expiryDate: medicineData.expiryDate
                ? new Date(medicineData.expiryDate)
                : null,
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
              expiryDate: medicineData.expiryDate
                ? new Date(medicineData.expiryDate)
                : null,
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
          });
        });
      } catch (error) {
        results.errors.push({
          medicine: medicineData.name,
          error: error.message,
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
      errors: [] as any[],
    };

    // Calculate previous month for opening balance
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;

    // Helper to parse expiry date strings (accepts ISO or DD/MM/YYYY)
    function parseDateString(input?: string | null) {
      if (!input) return null;
      const s = String(input).trim();
      if (!s) return null;

      // Try native Date first (ISO or other recognized formats)
      const d1 = new Date(s);
      if (!Number.isNaN(d1.getTime())) return d1;

      // Try DD/MM/YYYY or D/M/YYYY
      const parts = s.split(/[\/\.-]/).map((p) => p.trim());
      if (parts.length === 3) {
        const day = Number(parts[0]);
        const month = Number(parts[1]);
        const year = Number(parts[2]);
        if (!Number.isNaN(day) && !Number.isNaN(month) && !Number.isNaN(year)) {
          const d2 = new Date(year, month - 1, day);
          if (!Number.isNaN(d2.getTime())) return d2;
        }
      }

      return null;
    }

    for (const medicineData of medicines) {
      try {
        // Support both medicineId (for updates) and name (for new imports)
        let medicine;

        if (medicineData.medicineId) {
          // Update existing medicine using medicineId
          medicine = await this.prisma.medicine.findUnique({
            where: { id: medicineData.medicineId },
          });

          if (!medicine) {
            console.warn(
              `⚠️ Medicine ID not found: ${medicineData.medicineId}, will try to create if name provided`,
            );
            // Don't continue - try to create below if name is provided
          } else {
            console.log(
              `\n🔄 Processing existing medicine: ${medicine.name} (ID: ${medicine.id})`,
            );
          }
        }

        // If no medicine found by ID, try to find or create by name
        if (!medicine) {
          if (!medicineData.name) {
            console.error(`❌ Missing both valid medicineId and name`);
            results.errors.push({
              medicine: medicineData.medicineId || 'unknown',
              error: 'Missing both valid medicineId and name',
            });
            continue;
          }

          // Try to find existing medicine by name
          console.log(
            `\n🔍 Searching for medicine by name: ${medicineData.name}`,
          );
          medicine = await this.prisma.medicine.findFirst({
            where: {
              name: medicineData.name,
              isActive: true,
            },
          });

          if (medicine) {
            console.log(
              `✅ Found existing medicine: ${medicine.name} (ID: ${medicine.id})`,
            );
          } else {
            console.log(
              `🆕 Medicine not found, will create new: ${medicineData.name}`,
            );
          }
        }

        await this.prisma.$transaction(async (prisma) => {
          // 1. Tạo/tìm category nếu có
          let categoryId: string | undefined;
          if (medicineData.categoryCode) {
            let category = await prisma.medicineCategory.findUnique({
              where: { code: medicineData.categoryCode },
            });

            if (!category) {
              category = await prisma.medicineCategory.create({
                data: {
                  code: medicineData.categoryCode,
                  name: `Category ${medicineData.categoryCode}`,
                  sortOrder:
                    parseInt(
                      medicineData.categoryCode.replace(/[^0-9]/g, ''),
                    ) || 0,
                },
              });
            }
            categoryId = category.id;
          }

          // 2. Tạo hoặc cập nhật medicine
          if (!medicine) {
            // Create new medicine with all provided details
            if (!medicineData.name) {
              throw new Error(
                'Medicine name is required for creating new medicine',
              );
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
              },
            });
            console.log(
              `✅ Created medicine: ${medicine.name} (ID: ${medicine.id})`,
            );
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
                manufacturer:
                  medicineData.manufacturer || medicine.manufacturer,
                units: medicineData.units || medicine.units,
              },
            });
            results.updated++;
          } else {
            // Found by name match - just use it without updating
            console.log(
              `📌 Using existing medicine: ${medicine.name} (matched by name)`,
            );
            results.updated++;
          }

          // 3. Tính toán inventory balance

          // 3.1. Kiểm tra xem đã có inventory record cho tháng này chưa
          const existingInventory = await prisma.medicineInventory.findUnique({
            where: {
              medicineId_month_year: {
                medicineId: medicine.id,
                month,
                year,
              },
            },
          });

          // 3.2. Nhập phát sinh (từ Excel template - LUÔN CẬP NHẬT)
          const importQty = Number(medicineData.monthlyImportQuantity) || 0;
          const importPrice = Number(medicineData.monthlyImportUnitPrice) || 0;
          const importAmount =
            medicineData.monthlyImportAmount !== undefined
              ? Number(medicineData.monthlyImportAmount)
              : importQty * importPrice;

          // 3.3. Đề nghị mua (từ Excel template - LUÔN CẬP NHẬT)
          const suggestedQty =
            Number(medicineData.suggestedPurchaseQuantity) || 0;
          const suggestedPrice =
            Number(medicineData.suggestedPurchaseUnitPrice) || 0;
          const suggestedAmount =
            medicineData.suggestedPurchaseAmount !== undefined
              ? Number(medicineData.suggestedPurchaseAmount)
              : suggestedQty * suggestedPrice;

          // Parse expiry date once for all uses
          const parsedExpiry = parseDateString(medicineData.expiryDate);

          // ── Lũy kế năm: tổng nhập/xuất từ các tháng trước trong năm ──────────
          const prevYearMonths = await prisma.medicineInventory.findMany({
            where: { medicineId: medicine.id, year, month: { lt: month } },
            select: {
              monthlyImportQuantity: true,
              monthlyImportAmount: true,
              monthlyExportQuantity: true,
              monthlyExportAmount: true,
            },
          });
          const dPrevYtdImportQty = prevYearMonths.reduce(
            (s, i) => s.plus(D(i.monthlyImportQuantity)),
            new Prisma.Decimal(0),
          );
          const dPrevYtdImportAmt = prevYearMonths.reduce(
            (s, i) => s.plus(D(i.monthlyImportAmount)),
            new Prisma.Decimal(0),
          );
          const dPrevYtdExportQty = prevYearMonths.reduce(
            (s, i) => s.plus(D(i.monthlyExportQuantity)),
            new Prisma.Decimal(0),
          );
          const dPrevYtdExportAmt = prevYearMonths.reduce(
            (s, i) => s.plus(D(i.monthlyExportAmount)),
            new Prisma.Decimal(0),
          );

          // 3.4. Nếu chưa có record, tính toán đầy đủ
          if (!existingInventory) {
            // Lấy tồn cuối kỳ tháng trước làm tồn đầu kỳ tháng này
            const prevInventory = await prisma.medicineInventory.findUnique({
              where: {
                medicineId_month_year: {
                  medicineId: medicine.id,
                  month: prevMonth,
                  year: prevYear,
                },
              },
            });

            // ── Dùng Decimal để giữ toàn bộ chữ số thập phân ──
            const dOpenQty = D(prevInventory?.closingQuantity);
            const dOpenPrice = D(prevInventory?.closingUnitPrice);
            const dOpenAmt = dOpenQty.times(dOpenPrice);

            const dImportQty = D(importQty);
            const dImportPrice = D(importPrice);
            const dImportAmt = D(importAmount);

            // Xuất trong tháng (tính từ MedicalPrescription)
            const exportData = await prisma.medicalPrescription.aggregate({
              where: {
                medicineId: medicine.id,
                medicalRecord: {
                  visitDate: {
                    gte: new Date(year, month - 1, 1),
                    lt: new Date(year, month, 1),
                  },
                },
              },
              _sum: { quantity: true },
            });

            const dExportQty = D(exportData._sum.quantity);
            const dExportPrice = dOpenPrice.gt(0) ? dOpenPrice : dImportPrice;
            const dExportAmt = dExportQty.times(dExportPrice);

            // Tồn cuối kỳ = Tồn đầu + Nhập - Xuất
            const dClosingQty = dOpenQty.plus(dImportQty).minus(dExportQty);
            // Giá bình quân gia quyền
            const totalVal = dOpenAmt.plus(dImportAmt).minus(dExportAmt);
            const dClosingPrice = dClosingQty.gt(0)
              ? totalVal.div(dClosingQty)
              : dImportPrice.gt(0)
                ? dImportPrice
                : dOpenPrice;
            const dClosingAmt = dClosingQty.times(dClosingPrice);

            // Lũy kế năm = tháng trước + tháng này
            const dYtdImportQty = dPrevYtdImportQty.plus(dImportQty);
            const dYtdImportAmt = dPrevYtdImportAmt.plus(dImportAmt);
            const dYtdImportPr = dYtdImportQty.gt(0)
              ? dYtdImportAmt.div(dYtdImportQty)
              : dImportPrice;
            const dYtdExportQty = dPrevYtdExportQty.plus(dExportQty);
            const dYtdExportAmt = dPrevYtdExportAmt.plus(dExportAmt);
            const dYtdExportPr = dYtdExportQty.gt(0)
              ? dYtdExportAmt.div(dYtdExportQty)
              : new Prisma.Decimal(0);

            // Tạo mới inventory record
            await prisma.medicineInventory.create({
              data: {
                medicineId: medicine.id,
                month,
                year,
                expiryDate: parsedExpiry ?? null,
                openingQuantity: dOpenQty.toFixed(),
                openingUnitPrice: dOpenPrice.toFixed(),
                openingTotalAmount: dOpenAmt.toFixed(),
                monthlyImportQuantity: dImportQty.toFixed(),
                monthlyImportUnitPrice: dImportPrice.toFixed(),
                monthlyImportAmount: dImportAmt.toFixed(),
                monthlyExportQuantity: dExportQty.toFixed(),
                monthlyExportUnitPrice: dExportPrice.toFixed(),
                monthlyExportAmount: dExportAmt.toFixed(),
                closingQuantity: dClosingQty.toFixed(),
                closingUnitPrice: dClosingPrice.toFixed(),
                closingTotalAmount: dClosingAmt.toFixed(),
                yearlyImportQuantity: dYtdImportQty.toFixed(),
                yearlyImportUnitPrice: dYtdImportPr.toFixed(),
                yearlyImportAmount: dYtdImportAmt.toFixed(),
                yearlyExportQuantity: dYtdExportQty.toFixed(),
                yearlyExportUnitPrice: dYtdExportPr.toFixed(),
                yearlyExportAmount: dYtdExportAmt.toFixed(),
                suggestedPurchaseQuantity: D(suggestedQty).toFixed(),
                suggestedPurchaseUnitPrice: D(suggestedPrice).toFixed(),
                suggestedPurchaseAmount: D(suggestedAmount).toFixed(),
              },
            });
          } else {
            // 3.5. Nếu đã có record: CẬP NHẬT import + suggested, tái tính closing bằng Decimal
            const dCurrOpen = D(existingInventory.openingQuantity);
            const dCurrOpenPr = D(existingInventory.openingUnitPrice);
            const dCurrOpenAm = D(existingInventory.openingTotalAmount);
            const dCurrExport = D(existingInventory.monthlyExportQuantity);
            const dCurrExpAmt = D(existingInventory.monthlyExportAmount);

            const dNewImportQty = D(importQty);
            const dNewImportPr = D(importPrice);
            const dNewImportAmt = D(importAmount);

            // Tồn cuối = Tồn đầu + Nhập mới - Xuất hiện tại (bằng Decimal)
            const dNewClosingQty = dCurrOpen
              .plus(dNewImportQty)
              .minus(dCurrExport);
            const totalValNew = dCurrOpenAm
              .plus(dNewImportAmt)
              .minus(dCurrExpAmt);
            const dNewClosingPr = dNewClosingQty.gt(0)
              ? totalValNew.div(dNewClosingQty)
              : dNewImportPr.gt(0)
                ? dNewImportPr
                : dCurrOpenPr;
            const dNewClosingAmt = dNewClosingQty.times(dNewClosingPr);

            // Lũy kế năm = tháng trước + tháng này (export giữ nguyên từ DB)
            const dNewYtdImportQty = dPrevYtdImportQty.plus(dNewImportQty);
            const dNewYtdImportAmt = dPrevYtdImportAmt.plus(dNewImportAmt);
            const dNewYtdImportPr = dNewYtdImportQty.gt(0)
              ? dNewYtdImportAmt.div(dNewYtdImportQty)
              : dNewImportPr;
            const dNewYtdExportQty = dPrevYtdExportQty.plus(dCurrExport);
            const dNewYtdExportAmt = dPrevYtdExportAmt.plus(dCurrExpAmt);
            const dNewYtdExportPr = dNewYtdExportQty.gt(0)
              ? dNewYtdExportAmt.div(dNewYtdExportQty)
              : new Prisma.Decimal(0);

            // Cập nhật CHỈ các field từ template + recalculate closing + yearly
            await prisma.medicineInventory.update({
              where: {
                medicineId_month_year: {
                  medicineId: medicine.id,
                  month,
                  year,
                },
              },
              data: {
                // Only update expiryDate if parsed successfully
                ...(parsedExpiry ? { expiryDate: parsedExpiry } : {}),
                // CHỈ CẬP NHẬT: Nhập phát sinh (từ user input) - lưu dạng string Decimal
                monthlyImportQuantity: dNewImportQty.toFixed(),
                monthlyImportUnitPrice: dNewImportPr.toFixed(),
                monthlyImportAmount: dNewImportAmt.toFixed(),
                // CHỈ CẬP NHẬT: Đề nghị mua (từ user input)
                suggestedPurchaseQuantity: D(suggestedQty).toFixed(),
                suggestedPurchaseUnitPrice: D(suggestedPrice).toFixed(),
                suggestedPurchaseAmount: D(suggestedAmount).toFixed(),
                // TÁI TÍNH: Tồn cuối kỳ bằng Decimal
                closingQuantity: dNewClosingQty.toFixed(),
                closingUnitPrice: dNewClosingPr.toFixed(),
                closingTotalAmount: dNewClosingAmt.toFixed(),
                // CẬP NHẬT: Lũy kế năm (tái tính từ monthly data để đảm bảo chính xác)
                yearlyImportQuantity: dNewYtdImportQty.toFixed(),
                yearlyImportUnitPrice: dNewYtdImportPr.toFixed(),
                yearlyImportAmount: dNewYtdImportAmt.toFixed(),
                yearlyExportQuantity: dNewYtdExportQty.toFixed(),
                yearlyExportUnitPrice: dNewYtdExportPr.toFixed(),
                yearlyExportAmount: dNewYtdExportAmt.toFixed(),
                // KHÔNG CẬP NHẬT: openingQuantity, monthlyExportQuantity (giữ nguyên)
              },
            });
          }

          // 5. Upsert transaction IMPORT (cả tạo mới lẫn cập nhật)
          // Dùng upsert để tránh duplicate khi re-import cùng tháng
          if (D(importQty).gt(0)) {
            // Tìm transaction IMPORT đầu tiên của tháng này cho thuốc này
            const existingTx = await prisma.inventoryTransaction.findFirst({
              where: {
                medicineId: medicine.id,
                type: 'IMPORT',
                transactionDate: {
                  gte: new Date(year, month - 1, 1),
                  lt: new Date(year, month, 1),
                },
                notes: { contains: 'từ Excel' },
              },
            });

            const txPayload = {
              medicineId: medicine.id,
              type: 'IMPORT' as const,
              quantity: D(importQty).toFixed(),
              unitPrice: D(importPrice).toFixed(),
              totalAmount: D(importAmount).toFixed(),
              notes: `Nhập phát sinh tháng ${month}/${year} từ Excel`,
              expiryDate: parsedExpiry ?? null,
              transactionDate: new Date(year, month - 1, 1),
            };

            if (existingTx) {
              await prisma.inventoryTransaction.update({
                where: { id: existingTx.id },
                data: txPayload,
              });
            } else {
              await prisma.inventoryTransaction.create({ data: txPayload });
            }
          }
        });
      } catch (error) {
        console.error(`❌ Error processing ${medicineData.name}:`, error);
        results.errors.push({
          medicine: medicineData.name,
          error: error.message,
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
          mode: 'insensitive',
        };
      }
    }

    const inventories = await this.prisma.medicineInventory.findMany({
      where,
      include: {
        medicine: {
          include: {
            category: true,
          },
        },
      },
      orderBy: [
        { medicine: { category: { sortOrder: 'asc' } } },
        { medicine: { name: 'asc' } },
      ],
    });

    // Sử dụng serializeInventoryRow: giữ đủ độ chính xác đơn giá (đến 20 số thập phân)
    const convertedInventories = inventories.map(serializeInventoryRow);

    // Tính tổng hợp bằng Decimal để không cộng tròn
    const summaryD = inventories.reduce(
      (acc, inv) => ({
        totalOpeningAmount: acc.totalOpeningAmount.plus(
          D(inv.openingTotalAmount),
        ),
        totalImportAmount: acc.totalImportAmount.plus(
          D(inv.monthlyImportAmount),
        ),
        totalExportAmount: acc.totalExportAmount.plus(
          D(inv.monthlyExportAmount),
        ),
        totalClosingAmount: acc.totalClosingAmount.plus(
          D(inv.closingTotalAmount),
        ),
        totalSuggestedAmount: acc.totalSuggestedAmount.plus(
          D(inv.suggestedPurchaseAmount),
        ),
      }),
      {
        totalOpeningAmount: new Prisma.Decimal(0),
        totalImportAmount: new Prisma.Decimal(0),
        totalExportAmount: new Prisma.Decimal(0),
        totalClosingAmount: new Prisma.Decimal(0),
        totalSuggestedAmount: new Prisma.Decimal(0),
      },
    );

    return {
      month: targetMonth,
      year: targetYear,
      items: convertedInventories,
      summary: {
        totalMedicines: convertedInventories.length,
        totalOpeningAmount: summaryD.totalOpeningAmount.toFixed(),
        totalImportAmount: summaryD.totalImportAmount.toFixed(),
        totalExportAmount: summaryD.totalExportAmount.toFixed(),
        totalClosingAmount: summaryD.totalClosingAmount.toFixed(),
        totalSuggestedAmount: summaryD.totalSuggestedAmount.toFixed(),
      },
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
        categoryId,
      };
    }

    const inventories = await this.prisma.medicineInventory.findMany({
      where,
      include: {
        medicine: {
          include: {
            category: true,
          },
        },
      },
      orderBy: [
        { month: 'asc' },
        { medicine: { category: { sortOrder: 'asc' } } },
        { medicine: { name: 'asc' } },
      ],
    });

    // Group by month - dùng Decimal cho subtotals
    const monthlyData = inventories.reduce((acc, inv) => {
      const monthKey = `${inv.month}`;
      if (!acc[monthKey]) {
        acc[monthKey] = {
          month: inv.month,
          inventories: [],
          summary: {
            totalOpeningAmount: new Prisma.Decimal(0),
            totalImportAmount: new Prisma.Decimal(0),
            totalExportAmount: new Prisma.Decimal(0),
            totalClosingAmount: new Prisma.Decimal(0),
          },
        };
      }

      acc[monthKey].inventories.push(serializeInventoryRow(inv));
      acc[monthKey].summary.totalOpeningAmount = acc[
        monthKey
      ].summary.totalOpeningAmount.plus(D(inv.openingTotalAmount));
      acc[monthKey].summary.totalImportAmount = acc[
        monthKey
      ].summary.totalImportAmount.plus(D(inv.monthlyImportAmount));
      acc[monthKey].summary.totalExportAmount = acc[
        monthKey
      ].summary.totalExportAmount.plus(D(inv.monthlyExportAmount));
      acc[monthKey].summary.totalClosingAmount = acc[
        monthKey
      ].summary.totalClosingAmount.plus(D(inv.closingTotalAmount));

      return acc;
    }, {} as any);

    // Chuyển Decimal sang string
    Object.values(monthlyData).forEach((m: any) => {
      m.summary.totalOpeningAmount = m.summary.totalOpeningAmount.toFixed();
      m.summary.totalImportAmount = m.summary.totalImportAmount.toFixed();
      m.summary.totalExportAmount = m.summary.totalExportAmount.toFixed();
      m.summary.totalClosingAmount = m.summary.totalClosingAmount.toFixed();
    });

    return {
      year,
      months: Object.values(monthlyData),
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
          gt: 0,
        },
      },
      include: {
        medicine: {
          include: {
            category: true,
          },
        },
      },
    });

    // Tìm thuốc sắp hết hạn
    const expiringItems = await this.prisma.medicineInventory.findMany({
      where: {
        month: currentMonth,
        year: currentYear,
        expiryDate: {
          lte: expiryThreshold,
          gte: currentDate,
        },
        closingQuantity: {
          gt: 0,
        },
      },
      include: {
        medicine: {
          include: {
            category: true,
          },
        },
      },
    });

    return {
      lowStockItems: lowStockItems.map(serializeInventoryRow),
      expiringItems: expiringItems.map(serializeInventoryRow),
      summary: {
        lowStockCount: lowStockItems.length,
        expiringCount: expiringItems.length,
      },
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
                year: currentYear,
              },
            },
          },
        },
      },
    });

    // Format data theo category groups
    const result = categories.map((category) => {
      const items = category.medicines.map((medicine) => {
        const inventory = medicine.inventoryBalances[0];

        if (!inventory) {
          // Nếu chưa có inventory, trả về dữ liệu empty (amounts là string '0' để nhất quán)
          return {
            id: `temp-${medicine.id}`,
            medicineId: medicine.id,
            medicine: { ...medicine, category },
            month: currentMonth,
            year: currentYear,
            expiryDate: null,
            openingQuantity: 0,
            openingUnitPrice: '0',
            openingTotalAmount: '0',
            monthlyImportQuantity: 0,
            monthlyImportUnitPrice: '0',
            monthlyImportAmount: '0',
            monthlyExportQuantity: 0,
            monthlyExportUnitPrice: '0',
            monthlyExportAmount: '0',
            closingQuantity: 0,
            closingUnitPrice: '0',
            closingTotalAmount: '0',
            yearlyImportQuantity: 0,
            yearlyImportUnitPrice: '0',
            yearlyImportAmount: '0',
            yearlyExportQuantity: 0,
            yearlyExportUnitPrice: '0',
            yearlyExportAmount: '0',
            suggestedPurchaseQuantity: 0,
            suggestedPurchaseUnitPrice: '0',
            suggestedPurchaseAmount: '0',
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }

        return {
          ...serializeInventoryRow(inventory),
          medicine: { ...medicine, category },
        };
      });

      // Tính subtotal cho category bằng Decimal
      const ST = (key: string) =>
        items.reduce(
          (acc, item) => acc.plus(D(item[key])),
          new Prisma.Decimal(0),
        );

      const subtotal = {
        openingQuantity: items.reduce(
          (s, i) => s + Number(i.openingQuantity || 0),
          0,
        ),
        openingTotalAmount: ST('openingTotalAmount').toFixed(),
        monthlyImportQuantity: items.reduce(
          (s, i) => s + Number(i.monthlyImportQuantity || 0),
          0,
        ),
        monthlyImportAmount: ST('monthlyImportAmount').toFixed(),
        monthlyExportQuantity: items.reduce(
          (s, i) => s + Number(i.monthlyExportQuantity || 0),
          0,
        ),
        monthlyExportAmount: ST('monthlyExportAmount').toFixed(),
        closingQuantity: items.reduce(
          (s, i) => s + Number(i.closingQuantity || 0),
          0,
        ),
        closingTotalAmount: ST('closingTotalAmount').toFixed(),
        yearlyImportQuantity: items.reduce(
          (s, i) => s + Number(i.yearlyImportQuantity || 0),
          0,
        ),
        yearlyImportAmount: ST('yearlyImportAmount').toFixed(),
        yearlyExportQuantity: items.reduce(
          (s, i) => s + Number(i.yearlyExportQuantity || 0),
          0,
        ),
        yearlyExportAmount: ST('yearlyExportAmount').toFixed(),
        suggestedPurchaseQuantity: items.reduce(
          (s, i) => s + Number(i.suggestedPurchaseQuantity || 0),
          0,
        ),
        suggestedPurchaseAmount: ST('suggestedPurchaseAmount').toFixed(),
      };

      return {
        category: {
          id: category.id,
          code: category.code,
          name: category.name,
          sortOrder: category.sortOrder,
        },
        items,
        subtotal,
      };
    });

    // Grand total bằng Decimal
    const GT = (key: string) =>
      result.reduce(
        (acc, g) => acc.plus(D(g.subtotal[key])),
        new Prisma.Decimal(0),
      );

    const grandTotal = {
      openingQuantity: result.reduce(
        (s, g) => s + g.subtotal.openingQuantity,
        0,
      ),
      openingTotalAmount: GT('openingTotalAmount').toFixed(),
      monthlyImportQuantity: result.reduce(
        (s, g) => s + g.subtotal.monthlyImportQuantity,
        0,
      ),
      monthlyImportAmount: GT('monthlyImportAmount').toFixed(),
      monthlyExportQuantity: result.reduce(
        (s, g) => s + g.subtotal.monthlyExportQuantity,
        0,
      ),
      monthlyExportAmount: GT('monthlyExportAmount').toFixed(),
      closingQuantity: result.reduce(
        (s, g) => s + g.subtotal.closingQuantity,
        0,
      ),
      closingTotalAmount: GT('closingTotalAmount').toFixed(),
      yearlyImportQuantity: result.reduce(
        (s, g) => s + g.subtotal.yearlyImportQuantity,
        0,
      ),
      yearlyImportAmount: GT('yearlyImportAmount').toFixed(),
      yearlyExportQuantity: result.reduce(
        (s, g) => s + g.subtotal.yearlyExportQuantity,
        0,
      ),
      yearlyExportAmount: GT('yearlyExportAmount').toFixed(),
      suggestedPurchaseQuantity: result.reduce(
        (s, g) => s + g.subtotal.suggestedPurchaseQuantity,
        0,
      ),
      suggestedPurchaseAmount: GT('suggestedPurchaseAmount').toFixed(),
    };

    return {
      month: currentMonth,
      year: currentYear,
      groups: result,
      grandTotal,
    };
  }

  /**
   * Lấy dữ liệu inventory chi tiết theo năm với breakdown từng tháng
   */
  async getDetailedYearlyInventory(params: {
    month: number;
    year: number;
    categoryId?: string;
  }) {
    const { month, year, categoryId } = params;

    // Lấy tất cả inventories của năm đó
    const inventories = await this.prisma.medicineInventory.findMany({
      where: {
        year,
        ...(categoryId && {
          medicine: {
            categoryId,
          },
        }),
      },
      include: {
        medicine: {
          include: {
            category: true,
          },
        },
      },
      orderBy: [
        { medicine: { category: { sortOrder: 'asc' } } },
        { medicine: { name: 'asc' } },
        { month: 'asc' },
      ],
    });

    // Lấy tồn cuối năm trước (tháng 12 của năm trước)
    const previousYearClosing = await this.prisma.medicineInventory.findMany({
      where: {
        month: 12,
        year: year - 1,
        ...(categoryId && {
          medicine: {
            categoryId,
          },
        }),
      },
      include: {
        medicine: {
          include: {
            category: true,
          },
        },
      },
    });

    // Group by medicine
    const medicineGroups = new Map();

    inventories.forEach((inv) => {
      if (!medicineGroups.has(inv.medicineId)) {
        medicineGroups.set(inv.medicineId, {
          medicine: inv.medicine,
          months: Array(12)
            .fill(null)
            .map(() => ({
              importQuantity: 0,
              importUnitPrice: 0,
              importAmount: 0,
              exportQuantity: 0,
              exportUnitPrice: 0,
              exportAmount: 0,
            })),
          previousYearClosing: {
            quantity: 0,
            unitPrice: 0,
            totalAmount: 0,
          },
          currentMonthData: null,
        });
      }

      const data = medicineGroups.get(inv.medicineId);
      const monthIndex = inv.month - 1;

      // Store monthly data - lưu dưới dạng chuỗi để giữ độ chính xác đơn giá
      data.months[monthIndex] = {
        importQuantity: Number(inv.monthlyImportQuantity || 0),
        importUnitPrice: D(inv.monthlyImportUnitPrice).toFixed(),
        importAmount: D(inv.monthlyImportAmount).toFixed(),
        exportQuantity: Number(inv.monthlyExportQuantity || 0),
        exportUnitPrice: D(inv.monthlyExportUnitPrice).toFixed(),
        exportAmount: D(inv.monthlyExportAmount).toFixed(),
      };

      // Store current month full data
      if (inv.month === month) {
        data.currentMonthData = inv;
      }
    });

    // Add previous year closing
    previousYearClosing.forEach((inv) => {
      if (medicineGroups.has(inv.medicineId)) {
        const data = medicineGroups.get(inv.medicineId);
        data.previousYearClosing = {
          quantity: Number(inv.closingQuantity || 0),
          unitPrice: D(inv.closingUnitPrice).toFixed(),
          totalAmount: D(inv.closingTotalAmount).toFixed(),
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
          subtotal: this.createEmptyTotals(),
        });
      }

      const group = categoryGroups.get(categoryId);

      // Calculate totals – dùng Decimal để tránh string-concatenation bug
      const _totImp = data.months.reduce(
        (sum, m) => ({
          quantity: sum.quantity + m.importQuantity,
          amount: D(sum.amount).plus(D(m.importAmount)).toFixed(),
        }),
        { quantity: 0, amount: '0' },
      );
      const totalImport = {
        ..._totImp,
        // Đơn giá bình quân = Thành tiền ÷ Số lượng
        unitPrice:
          _totImp.quantity > 0
            ? D(_totImp.amount).div(D(_totImp.quantity)).toFixed()
            : '0',
      };

      const _totExp = data.months.reduce(
        (sum, m) => ({
          quantity: sum.quantity + m.exportQuantity,
          amount: D(sum.amount).plus(D(m.exportAmount)).toFixed(),
        }),
        { quantity: 0, amount: '0' },
      );
      const totalExport = {
        ..._totExp,
        unitPrice:
          _totExp.quantity > 0
            ? D(_totExp.amount).div(D(_totExp.quantity)).toFixed()
            : '0',
      };

      // ── Lũy kế năm (Jan → params.month): tính từ monthly data đã load ──────
      // Bypass DB's yearlyImportQuantity (bị reset về 0 mỗi tháng – bug cũ)
      const _ytdImp = data.months.slice(0, month).reduce(
        (sum, m) => ({
          quantity: sum.quantity + m.importQuantity,
          amount: D(sum.amount).plus(D(m.importAmount)).toFixed(),
        }),
        { quantity: 0, amount: '0' },
      );
      const yearlyImport = {
        quantity: _ytdImp.quantity,
        unitPrice:
          _ytdImp.quantity > 0
            ? D(_ytdImp.amount).div(D(_ytdImp.quantity)).toFixed()
            : '0',
        amount: _ytdImp.amount,
      };

      const _ytdExp = data.months.slice(0, month).reduce(
        (sum, m) => ({
          quantity: sum.quantity + m.exportQuantity,
          amount: D(sum.amount).plus(D(m.exportAmount)).toFixed(),
        }),
        { quantity: 0, amount: '0' },
      );
      const yearlyExport = {
        quantity: _ytdExp.quantity,
        unitPrice:
          _ytdExp.quantity > 0
            ? D(_ytdExp.amount).div(D(_ytdExp.quantity)).toFixed()
            : '0',
        amount: _ytdExp.amount,
      };

      const item = {
        medicine: data.medicine,
        currentMonthData: data.currentMonthData,
        previousYearClosing: data.previousYearClosing,
        monthlyImport: data.months.map((m) => ({
          quantity: m.importQuantity,
          unitPrice: m.importUnitPrice,
          amount: m.importAmount,
        })),
        monthlyExport: data.months.map((m) => ({
          quantity: m.exportQuantity,
          unitPrice: m.exportUnitPrice,
          amount: m.exportAmount,
        })),
        yearlyImport,
        yearlyExport,
        totalImport,
        totalExport,
      };

      group.items.push(item);

      // Update subtotal
      this.addToTotals(group.subtotal, item);
    });

    // Calculate grand total
    const grandTotal = this.createEmptyTotals();
    const groups = Array.from(categoryGroups.values());

    groups.forEach((group) => {
      // Recalc unit prices for group subtotals BEFORE folding into grand total
      this.recalcUnitPrices(group.subtotal);
      this.addToTotals(grandTotal, { subtotal: group.subtotal });
    });
    // Recalc grand total unit prices after all groups are accumulated
    this.recalcUnitPrices(grandTotal);

    return {
      month,
      year,
      groups,
      grandTotal,
    };
  }

  /**
   * Tính lại đơn giá bình quân gia quyền cho toàn bộ trường price/unitPrice
   * trong một đối tượng totals (subtotal hoặc grandTotal).
   *
   * Phải gọi SAU KHI đã tích luỹ đủ quantity + amount, vì:
   *   unitPrice = totalAmount ÷ totalQuantity
   */
  private recalcUnitPrices(totals: any): void {
    // Helper: tính đơn giá, trả về '0' nếu qty = 0
    const qp = (qty: unknown, amt: unknown): string => {
      const q = D(qty);
      return q.gt(0) ? D(amt).div(q).toFixed() : '0';
    };

    // Tồn đầu năm trước
    totals.previousYearClosing.unitPrice = qp(
      totals.previousYearClosing.quantity,
      totals.previousYearClosing.totalAmount,
    );

    // Tổng nhập / Tổng xuất
    totals.totalImport.unitPrice = qp(
      totals.totalImport.quantity,
      totals.totalImport.amount,
    );
    totals.totalExport.unitPrice = qp(
      totals.totalExport.quantity,
      totals.totalExport.amount,
    );

    // Lũy kế năm nhập / xuất
    totals.yearlyImport.unitPrice = qp(
      totals.yearlyImport.quantity,
      totals.yearlyImport.amount,
    );
    totals.yearlyExport.unitPrice = qp(
      totals.yearlyExport.quantity,
      totals.yearlyExport.amount,
    );

    // Nhập/Xuất từng tháng
    (totals.monthlyImport as any[]).forEach((m: any) => {
      m.unitPrice = qp(m.quantity, m.amount);
    });
    (totals.monthlyExport as any[]).forEach((m: any) => {
      m.unitPrice = qp(m.quantity, m.amount);
    });

    // Dữ liệu tháng hiện tại (tồn đầu, nhập, xuất, tồn cuối, lũy kế, đề nghị)
    const cm = totals.currentMonth;
    cm.openingUnitPrice = qp(cm.openingQuantity, cm.openingTotalAmount);
    cm.monthlyImportUnitPrice = qp(
      cm.monthlyImportQuantity,
      cm.monthlyImportAmount,
    );
    cm.monthlyExportUnitPrice = qp(
      cm.monthlyExportQuantity,
      cm.monthlyExportAmount,
    );
    cm.closingUnitPrice = qp(cm.closingQuantity, cm.closingTotalAmount);
    cm.suggestedPurchaseUnitPrice = qp(
      cm.suggestedPurchaseQuantity,
      cm.suggestedPurchaseAmount,
    );
  }

  private createEmptyTotals() {
    return {
      previousYearClosing: { quantity: 0, unitPrice: '0', totalAmount: '0' },
      monthlyImport: Array(12)
        .fill(null)
        .map(() => ({ quantity: 0, unitPrice: '0', amount: '0' })),
      monthlyExport: Array(12)
        .fill(null)
        .map(() => ({ quantity: 0, unitPrice: '0', amount: '0' })),
      totalImport: { quantity: 0, unitPrice: '0', amount: '0' },
      totalExport: { quantity: 0, unitPrice: '0', amount: '0' },
      yearlyImport: { quantity: 0, unitPrice: '0', amount: '0' },
      yearlyExport: { quantity: 0, unitPrice: '0', amount: '0' },
      currentMonth: {
        openingQuantity: 0,
        openingUnitPrice: '0',
        openingTotalAmount: '0',
        monthlyImportQuantity: 0,
        monthlyImportUnitPrice: '0',
        monthlyImportAmount: '0',
        monthlyExportQuantity: 0,
        monthlyExportUnitPrice: '0',
        monthlyExportAmount: '0',
        closingQuantity: 0,
        closingUnitPrice: '0',
        closingTotalAmount: '0',
        yearlyImportQuantity: 0,
        yearlyImportUnitPrice: '0',
        yearlyImportAmount: '0',
        yearlyExportQuantity: 0,
        yearlyExportUnitPrice: '0',
        yearlyExportAmount: '0',
        suggestedPurchaseQuantity: 0,
        suggestedPurchaseUnitPrice: '0',
        suggestedPurchaseAmount: '0',
      },
    };
  }

  private addToTotals(totals: any, item: any) {
    // ── Helper: Decimal string addition ──────────────────────────────────
    const dAdd = (a: unknown, b: unknown) => D(a).plus(D(b)).toFixed();

    // ── From individual item ─────────────────────────────────────────────
    if (item.previousYearClosing) {
      totals.previousYearClosing.quantity += Number(
        item.previousYearClosing.quantity || 0,
      );
      totals.previousYearClosing.totalAmount = dAdd(
        totals.previousYearClosing.totalAmount,
        item.previousYearClosing.totalAmount,
      );
    }

    if (item.totalImport) {
      totals.totalImport.quantity += Number(item.totalImport.quantity || 0);
      totals.totalImport.amount = dAdd(
        totals.totalImport.amount,
        item.totalImport.amount,
      );
    }

    if (item.totalExport) {
      totals.totalExport.quantity += Number(item.totalExport.quantity || 0);
      totals.totalExport.amount = dAdd(
        totals.totalExport.amount,
        item.totalExport.amount,
      );
    }

    if (item.monthlyImport) {
      item.monthlyImport.forEach((m: any, i: number) => {
        totals.monthlyImport[i].quantity += Number(m.quantity || 0);
        totals.monthlyImport[i].amount = dAdd(
          totals.monthlyImport[i].amount,
          m.amount,
        );
      });
    }

    if (item.monthlyExport) {
      item.monthlyExport.forEach((m: any, i: number) => {
        totals.monthlyExport[i].quantity += Number(m.quantity || 0);
        totals.monthlyExport[i].amount = dAdd(
          totals.monthlyExport[i].amount,
          m.amount,
        );
      });
    }

    // ── Lũy kế năm (computed from monthly data) ──────────────────────────
    if (item.yearlyImport) {
      totals.yearlyImport.quantity += Number(item.yearlyImport.quantity || 0);
      totals.yearlyImport.amount = dAdd(
        totals.yearlyImport.amount,
        item.yearlyImport.amount,
      );
    }
    if (item.yearlyExport) {
      totals.yearlyExport.quantity += Number(item.yearlyExport.quantity || 0);
      totals.yearlyExport.amount = dAdd(
        totals.yearlyExport.amount,
        item.yearlyExport.amount,
      );
    }

    // ── From current month data (individual item path) ───────────────────
    if (item.currentMonthData) {
      const cm = item.currentMonthData;
      totals.currentMonth.openingQuantity += Number(cm.openingQuantity || 0);
      totals.currentMonth.openingTotalAmount = dAdd(
        totals.currentMonth.openingTotalAmount,
        cm.openingTotalAmount,
      );
      totals.currentMonth.monthlyImportQuantity += Number(
        cm.monthlyImportQuantity || 0,
      );
      totals.currentMonth.monthlyImportAmount = dAdd(
        totals.currentMonth.monthlyImportAmount,
        cm.monthlyImportAmount,
      );
      totals.currentMonth.monthlyExportQuantity += Number(
        cm.monthlyExportQuantity || 0,
      );
      totals.currentMonth.monthlyExportAmount = dAdd(
        totals.currentMonth.monthlyExportAmount,
        cm.monthlyExportAmount,
      );
      totals.currentMonth.closingQuantity += Number(cm.closingQuantity || 0);
      totals.currentMonth.closingTotalAmount = dAdd(
        totals.currentMonth.closingTotalAmount,
        cm.closingTotalAmount,
      );
      totals.currentMonth.suggestedPurchaseQuantity += Number(
        cm.suggestedPurchaseQuantity || 0,
      );
      totals.currentMonth.suggestedPurchaseAmount = dAdd(
        totals.currentMonth.suggestedPurchaseAmount,
        cm.suggestedPurchaseAmount,
      );
    }

    // ── From subtotal (grandTotal accumulation path) ─────────────────────
    if (item.subtotal) {
      const sub = item.subtotal;

      totals.previousYearClosing.quantity += Number(
        sub.previousYearClosing.quantity || 0,
      );
      totals.previousYearClosing.totalAmount = dAdd(
        totals.previousYearClosing.totalAmount,
        sub.previousYearClosing.totalAmount,
      );

      totals.totalImport.quantity += Number(sub.totalImport.quantity || 0);
      totals.totalImport.amount = dAdd(
        totals.totalImport.amount,
        sub.totalImport.amount,
      );

      totals.totalExport.quantity += Number(sub.totalExport.quantity || 0);
      totals.totalExport.amount = dAdd(
        totals.totalExport.amount,
        sub.totalExport.amount,
      );

      sub.monthlyImport.forEach((m: any, i: number) => {
        totals.monthlyImport[i].quantity += Number(m.quantity || 0);
        totals.monthlyImport[i].amount = dAdd(
          totals.monthlyImport[i].amount,
          m.amount,
        );
      });

      sub.monthlyExport.forEach((m: any, i: number) => {
        totals.monthlyExport[i].quantity += Number(m.quantity || 0);
        totals.monthlyExport[i].amount = dAdd(
          totals.monthlyExport[i].amount,
          m.amount,
        );
      });

      // Lũy kế năm (subtotal path)
      if (sub.yearlyImport) {
        totals.yearlyImport.quantity += Number(sub.yearlyImport.quantity || 0);
        totals.yearlyImport.amount = dAdd(
          totals.yearlyImport.amount,
          sub.yearlyImport.amount,
        );
      }
      if (sub.yearlyExport) {
        totals.yearlyExport.quantity += Number(sub.yearlyExport.quantity || 0);
        totals.yearlyExport.amount = dAdd(
          totals.yearlyExport.amount,
          sub.yearlyExport.amount,
        );
      }

      if (sub.currentMonth) {
        totals.currentMonth.openingQuantity += Number(
          sub.currentMonth.openingQuantity || 0,
        );
        totals.currentMonth.openingTotalAmount = dAdd(
          totals.currentMonth.openingTotalAmount,
          sub.currentMonth.openingTotalAmount,
        );
        totals.currentMonth.monthlyImportQuantity += Number(
          sub.currentMonth.monthlyImportQuantity || 0,
        );
        totals.currentMonth.monthlyImportAmount = dAdd(
          totals.currentMonth.monthlyImportAmount,
          sub.currentMonth.monthlyImportAmount,
        );
        totals.currentMonth.monthlyExportQuantity += Number(
          sub.currentMonth.monthlyExportQuantity || 0,
        );
        totals.currentMonth.monthlyExportAmount = dAdd(
          totals.currentMonth.monthlyExportAmount,
          sub.currentMonth.monthlyExportAmount,
        );
        totals.currentMonth.closingQuantity += Number(
          sub.currentMonth.closingQuantity || 0,
        );
        totals.currentMonth.closingTotalAmount = dAdd(
          totals.currentMonth.closingTotalAmount,
          sub.currentMonth.closingTotalAmount,
        );
        totals.currentMonth.suggestedPurchaseQuantity += Number(
          sub.currentMonth.suggestedPurchaseQuantity || 0,
        );
        totals.currentMonth.suggestedPurchaseAmount = dAdd(
          totals.currentMonth.suggestedPurchaseAmount,
          sub.currentMonth.suggestedPurchaseAmount,
        );
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
          year: currentYear,
        },
      },
      include: {
        medicine: {
          include: {
            category: true,
          },
        },
      },
    });

    if (!inventory) {
      // Nếu chưa có inventory cho tháng này, trả về 0
      const medicine = await this.prisma.medicine.findUnique({
        where: { id: medicineId },
        include: { category: true },
      });

      if (!medicine) {
        throw new NotFoundException(`Medicine with ID ${medicineId} not found`);
      }

      return {
        medicine,
        currentStock: 0,
        unitPrice: 0,
        totalValue: 0,
        expiryDate: null,
      };
    }

    return {
      medicine: inventory.medicine,
      currentStock: Number(inventory.closingQuantity),
      unitPrice: D(inventory.closingUnitPrice).toFixed(),
      totalValue: D(inventory.closingTotalAmount).toFixed(),
      expiryDate: inventory.expiryDate,
    };
  }

  /**
   * Đảo ngược (hoàn tác) các giao dịch XUẤT KHO đã tạo cho một medical record.
   *
   * Dùng khi BÁC SĨ CHỈNH SỬA đơn thuốc:
   *  1. Xóa bản ghi InventoryTransaction cũ (EXPORT) khỏi log
   *  2. Trừ số lượng xuất ra khỏi MedicineInventory (monthly + yearly export qty/amount)
   *  3. Cập nhật lại closingQuantity/Price/Amount
   *
   * Cách tiếp cận này giữ báo cáo xuất sạch sẽ (không tạo thêm IMPORT giả).
   */
  async reverseExportTransaction(
    medicineId: string,
    referenceId: string,
  ): Promise<void> {
    // 1. Tìm tất cả EXPORT transactions cho medicineId + referenceId này
    const oldTx = await this.prisma.inventoryTransaction.findMany({
      where: { medicineId, referenceId, type: 'EXPORT' },
    });

    if (oldTx.length === 0) return; // Không có gì để đảo ngược

    // 2. Tổng qty + amount cần hoàn trả
    const totalQty = oldTx.reduce(
      (s, t) => D(s).plus(D(t.quantity)).toFixed(),
      '0',
    );
    const totalAmount = oldTx.reduce(
      (s, t) => D(s).plus(D(t.totalAmount)).toFixed(),
      '0',
    );

    // 3. Xóa các transaction records cũ
    await this.prisma.inventoryTransaction.deleteMany({
      where: { medicineId, referenceId, type: 'EXPORT' },
    });

    // 4. Xác định month/year từ transaction đầu tiên
    const txDate = oldTx[0].transactionDate;
    const month = txDate.getMonth() + 1;
    const year = txDate.getFullYear();

    // 5. Đọc inventory record của tháng đó
    const inv = await this.prisma.medicineInventory.findUnique({
      where: { medicineId_month_year: { medicineId, month, year } },
    });

    if (!inv) return; // Không có tồn kho tháng đó → không cần cập nhật

    // 6. Tính lại export quantities (trừ đi lượng đã hoàn tác)
    const safeQty = (base: unknown, sub: string) => {
      const r = D(base).minus(D(sub));
      return r.gte(0) ? r : new Prisma.Decimal(0);
    };

    const newMonthExportQty = safeQty(inv.monthlyExportQuantity, totalQty);
    const newMonthExportAmount = safeQty(inv.monthlyExportAmount, totalAmount);
    const newMonthExportPrice = newMonthExportQty.gt(0)
      ? newMonthExportAmount.div(newMonthExportQty)
      : new Prisma.Decimal(0);

    const newYearExportQty = safeQty(inv.yearlyExportQuantity, totalQty);
    const newYearExportAmount = safeQty(inv.yearlyExportAmount, totalAmount);
    const newYearExportPrice = newYearExportQty.gt(0)
      ? newYearExportAmount.div(newYearExportQty)
      : new Prisma.Decimal(0);

    // 7. Tính lại tồn cuối kỳ
    const closingQty = D(inv.openingQuantity)
      .plus(D(inv.monthlyImportQuantity))
      .minus(newMonthExportQty);

    const totalValue = D(inv.openingQuantity)
      .times(D(inv.openingUnitPrice))
      .plus(D(inv.monthlyImportAmount))
      .minus(newMonthExportAmount);

    const closingPrice = closingQty.gt(0)
      ? totalValue.div(closingQty)
      : new Prisma.Decimal(0);
    const closingAmount = closingQty.times(closingPrice);

    // 8. Cập nhật MedicineInventory
    await this.prisma.medicineInventory.update({
      where: { medicineId_month_year: { medicineId, month, year } },
      data: {
        monthlyExportQuantity: newMonthExportQty.toFixed(),
        monthlyExportUnitPrice: newMonthExportPrice.toFixed(),
        monthlyExportAmount: newMonthExportAmount.toFixed(),
        yearlyExportQuantity: newYearExportQty.toFixed(),
        yearlyExportUnitPrice: newYearExportPrice.toFixed(),
        yearlyExportAmount: newYearExportAmount.toFixed(),
        closingQuantity: closingQty.toFixed(),
        closingUnitPrice: closingPrice.toFixed(),
        closingTotalAmount: closingAmount.toFixed(),
      },
    });
  }

  /**
   * Cập nhật thông tin inventory balance thủ công
   */
  async updateInventoryBalanceManual(data: UpdateInventoryBalanceDto) {
    const { medicineId, month, year } = data;

    // Đọc record hiện tại để lấy monthly import/export (giữ nguyên khi cập nhật opening)
    const existing = await this.prisma.medicineInventory.findUnique({
      where: { medicineId_month_year: { medicineId, month, year } },
    });

    // Tính opening bằng Decimal (ưu tiên giá trị mới, fallback về existing)
    const openingQty = D(data.openingQuantity ?? existing?.openingQuantity ?? 0);
    const openingPrice = D(data.openingUnitPrice ?? existing?.openingUnitPrice ?? 0);
    const openingAmount = openingQty.times(openingPrice);

    // Tính suggested bằng Decimal
    const suggestedQty = D(data.suggestedPurchaseQuantity ?? existing?.suggestedPurchaseQuantity ?? 0);
    const suggestedPrice = D(data.suggestedPurchaseUnitPrice ?? existing?.suggestedPurchaseUnitPrice ?? 0);
    const suggestedAmount = suggestedQty.times(suggestedPrice);

    // Tái tính tồn cuối kỳ dựa trên opening mới + monthly import/export hiện tại
    const importQty = D(existing?.monthlyImportQuantity ?? 0);
    const importAmount = D(existing?.monthlyImportAmount ?? 0);
    const exportQty = D(existing?.monthlyExportQuantity ?? 0);
    const exportAmount = D(existing?.monthlyExportAmount ?? 0);

    const closingQty = openingQty.plus(importQty).minus(exportQty);
    const totalValue = openingAmount.plus(importAmount).minus(exportAmount);
    const closingPrice = closingQty.gt(0)
      ? totalValue.div(closingQty)
      : new Prisma.Decimal(0);
    const closingAmount = closingQty.times(closingPrice);

    return this.prisma.medicineInventory.upsert({
      where: {
        medicineId_month_year: {
          medicineId,
          month,
          year,
        },
      },
      update: {
        openingQuantity: openingQty.toFixed(),
        openingUnitPrice: openingPrice.toFixed(),
        openingTotalAmount: openingAmount.toFixed(),
        suggestedPurchaseQuantity: suggestedQty.toFixed(),
        suggestedPurchaseUnitPrice: suggestedPrice.toFixed(),
        suggestedPurchaseAmount: suggestedAmount.toFixed(),
        closingQuantity: closingQty.toFixed(),
        closingUnitPrice: closingPrice.toFixed(),
        closingTotalAmount: closingAmount.toFixed(),
        ...(data.expiryDate ? { expiryDate: new Date(data.expiryDate) } : {}),
      },
      create: {
        medicineId,
        month,
        year,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
        openingQuantity: openingQty.toFixed(),
        openingUnitPrice: openingPrice.toFixed(),
        openingTotalAmount: openingAmount.toFixed(),
        suggestedPurchaseQuantity: suggestedQty.toFixed(),
        suggestedPurchaseUnitPrice: suggestedPrice.toFixed(),
        suggestedPurchaseAmount: suggestedAmount.toFixed(),
        closingQuantity: closingQty.toFixed(),
        closingUnitPrice: closingPrice.toFixed(),
        closingTotalAmount: closingAmount.toFixed(),
      },
      include: {
        medicine: {
          include: {
            category: true,
          },
        },
      },
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
    const currentMatch = normalizedTitle.match(
      /QT\s+THU[OỐ]C\s+TH[AÁ]NG\s+(\d{1,2})\s+N[AĂ]M\s+(\d{4})/,
    );
    const suggestedMatch = normalizedTitle.match(
      /[DĐ][EỀ]\s+NGH[IỊ]\s+MUA\s+THU[OỐ]C\s+TH[AÁ]NG\s+(\d{1,2})\s+N[AĂ]M\s+(\d{4})/,
    );

    if (!currentMatch) {
      console.warn(
        '⚠️ Could not extract current month/year from title:',
        normalizedTitle,
      );
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

    console.log(
      `📅 Detected from title: Current ${currentMonth}/${currentYear}, Suggested ${suggestedMonth}/${suggestedYear}`,
    );

    return {
      currentMonth,
      currentYear,
      suggestedMonth,
      suggestedYear,
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
      throw new Error(
        'Không thể xác định tháng/năm từ tiêu đề Excel. Format yêu cầu: "QT THUỐC THÁNG XX NĂM YYYY _ ĐỀ NGHỊ MUA THUỐC THÁNG YY NĂM YYYY"',
      );
    }

    const { currentMonth: month, currentYear: year } = dateInfo;

    // Convert to array format, starting from row 9 (0-indexed: 8)
    const data = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      range: 8,
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

        const categoryMatch = firstCell.match(
          /^(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI|XVII)\s*-/,
        );
        if (categoryMatch) {
          currentCategory = categoryMatch[1];
          console.log(`\n📁 Category: ${currentCategory} - ${firstCell}`);
          continue;
        }

        // Skip total rows, signature section, and date rows
        const skipPatterns = [
          'TỔNG CỘNG',
          'Tổng cộng',
          'Ngày',
          'NGÀY',
          'ngày',
          'TGĐ',
          'TỔNG HỢP',
          'Tổng hợp',
          'KẾ TOÁN',
          'Kế toán',
          'Giám đốc',
          'GIÁM ĐỐC',
          'LÊ THANH',
          'PHAN THỊ',
          'CHỮ KÝ',
          'chữ ký',
        ];

        const shouldSkip = skipPatterns.some(
          (pattern) =>
            firstCell.includes(pattern) || secondCell.includes(pattern),
        );

        if (shouldSkip) {
          console.log(
            `⊘ Skipping signature/date row: ${firstCell} | ${secondCell}`,
          );
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
        if (
          invalidPatterns.some((pattern) =>
            medicineName.toUpperCase().includes(pattern),
          )
        ) {
          skipped++;
          continue;
        }

        // Progress indicator
        if ((imported + updated) % 10 === 0 && imported + updated > 0) {
          process.stdout.write(
            `\r⏳ Processing... ${imported + updated} medicines`,
          );
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
            where: { code: currentCategory },
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
            isActive: true,
          },
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
            },
          });
          imported++;
        } else {
          medicine = await this.prisma.medicine.update({
            where: { id: medicine.id },
            data: {
              type: itemType,
              categoryId:
                categoryId !== undefined ? categoryId : medicine.categoryId,
              route: route || medicine.route,
              strength: strength || medicine.strength,
              manufacturer: manufacturer || medicine.manufacturer,
              units: units || medicine.units,
            },
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

                if (
                  day >= 1 &&
                  day <= 31 &&
                  month >= 1 &&
                  month <= 12 &&
                  year >= 1900 &&
                  year <= 2100
                ) {
                  const isoDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const testDate = new Date(isoDateStr);

                  if (
                    testDate.getFullYear() === year &&
                    testDate.getMonth() + 1 === month &&
                    testDate.getDate() === day
                  ) {
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
                expiryDate = new Date(
                  year1900.getTime() + (days - 1) * 24 * 60 * 60 * 1000,
                );

                if (isNaN(expiryDate.getTime())) {
                  expiryDate = null;
                }
              }
            }
          } catch (e: any) {
            console.warn(
              `⚠️ Error parsing expiry date: ${expiryStr}`,
              e.message,
            );
            expiryDate = null;
          }
        }

        // Upsert MedicineInventory
        await this.prisma.medicineInventory.upsert({
          where: {
            medicineId_month_year: {
              medicineId: medicine.id,
              month,
              year,
            },
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
          },
        });
      } catch (error) {
        errors.push({
          row: row[0],
          medicine: row[1],
          error: error.message,
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
      year,
    };
  }
}
