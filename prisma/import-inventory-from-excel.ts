import { PrismaClient, MedicalItemType } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as path from 'path';

const prisma = new PrismaClient();

/**
 * Script để import dữ liệu thuốc từ file Excel
 * 
 * Cấu trúc Excel:
 * - Cột A: STT
 * - Cột B: TÊN THUỐC
 * - Cột C: ĐƯỜNG DÙNG (UỐNG, NHỎ MẮT, BÔI, DÁN)
 * - Cột D: HÀM LƯỢNG
 * - Cột E: NƠI SX
 * - Cột F: ĐơN VỊ TÍNH
 * - Cột G-I: TỒN ĐẦU KỲ (SL, ĐG, TT)
 * - Cột J-O: PHÁT SINH TRONG THÁNG (Nhập: SL, ĐG, TT | Xuất: SL, ĐG, TT)
 * - Cột P-R: TỒN CUỐI KỲ (SL, ĐG, TT)
 * - Cột S: HSD
 * - Cột T-Y: LŨY KẾ NĂM (Nhập: SL, ĐG, TT | Xuất: SL, ĐG, TT)
 * - Cột Z-AB: ĐỀ NGHỊ MUA THÁNG (SL, ĐG, TT)
 */

interface ExcelRow {
  STT?: number;
  'TÊN THUỐC'?: string;
  'ĐƯỜNG DÙNG'?: string;
  'HÀM LƯỢNG'?: string;
  'NƠI SX'?: string;
  'ĐƠN VỊ TÍNH'?: string;
  'NHÓM'?: string; // Category code nếu có
  
  // Tồn đầu kỳ
  'TĐK_SL'?: number;
  'TĐK_ĐG'?: number;
  'TĐK_TT'?: number;
  
  // Phát sinh nhập
  'NHẬP_SL'?: number;
  'NHẬP_ĐG'?: number;
  'NHẬP_TT'?: number;
  
  // Phát sinh xuất
  'XUẤT_SL'?: number;
  'XUẤT_ĐG'?: number;
  'XUẤT_TT'?: number;
  
  // Tồn cuối kỳ
  'TCK_SL'?: number;
  'TCK_ĐG'?: number;
  'TCK_TT'?: number;
  
  'HẠN SỬ DỤNG'?: string;
  
  // Lũy kế năm nhập
  'LKN_NHẬP_SL'?: number;
  'LKN_NHẬP_ĐG'?: number;
  'LKN_NHẬP_TT'?: number;
  
  // Lũy kế năm xuất
  'LKN_XUẤT_SL'?: number;
  'LKN_XUẤT_ĐG'?: number;
  'LKN_XUẤT_TT'?: number;
  
  // Đề nghị mua
  'ĐN_SL'?: number;
  'ĐN_ĐG'?: number;
  'ĐN_TT'?: number;
}

/**
 * Determine MedicalItemType based on category code
 * - XV: EMERGENCY_SUPPLY (Cấp cứu)
 * - XVI: MEDICAL_EQUIPMENT (Vật tư y tế)
 * - Others (I-XIV, XVII): MEDICINE (Thuốc)
 */
function getMedicalItemType(categoryCode: string): MedicalItemType {
  if (categoryCode === 'XV') {
    return MedicalItemType.EMERGENCY_SUPPLY;
  } else if (categoryCode === 'XVI') {
    return MedicalItemType.MEDICAL_EQUIPMENT;
  }
  return MedicalItemType.MEDICINE;
}

async function importFromExcel(filePath: string, month: number, year: number) {
  console.log(`📖 Reading Excel file: ${filePath}`);
  
  // Đọc file Excel
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  console.log(`📋 Sheet name: ${sheetName}`);
  
  // Chuyển đổi sang JSON với range bỏ qua header rows (bắt đầu từ row 9 - category I header)
  const data = XLSX.utils.sheet_to_json(worksheet, { 
    header: 1, // Use array format instead of object
    range: 8 // Start from row 9 (0-indexed, so 8)
  }) as any[][];
  
  console.log(`📊 Found ${data.length} rows`);
  
  // Preview first data row for debugging
  if (data.length > 0) {
    console.log('\n🔍 Preview first data row:');
    console.log(`   STT: ${data[0][0]}`);
    console.log(`   Medicine: ${data[0][1]}`);
    console.log(`   Route: ${data[0][2]}`);
    console.log(`   Strength: ${data[0][3]}`);
    console.log('');
  }
  
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

      // Check if this is a category header row (starts with Roman numeral I-XVII)
      // Category headers are in COLUMN A (row[0])
      const firstCell = row[0]?.toString() || '';
      // Match pattern: starts with Roman numerals I-XVII followed by space/hyphen
      const categoryMatch = firstCell.match(/^(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI|XVII)\s*-/);
      if (categoryMatch) {
        currentCategory = categoryMatch[1];
        console.log(`\n📁 Category: ${currentCategory} - ${firstCell}`);
        continue;
      }

      // Skip total rows and other non-data rows
      if (firstCell.includes('TỔNG CỘNG') || firstCell.includes('Tổng cộng')) {
        continue;
      }

      // ⭐ VALIDATION: Phải có đầy đủ 3 cột bắt buộc
      const stt = row[0]?.toString().trim(); // Cột A: STT
      const medicineName = row[1]?.toString().trim(); // Cột B: Tên thuốc
      const units = row[5]?.toString().trim(); // Cột F: ĐVT
      
      // Skip nếu thiếu STT hoặc Tên thuốc hoặc ĐVT
      if (!stt || !medicineName || !units) {
        skipped++;
        continue;
      }
      
      // Skip nếu tên là các ký hiệu không hợp lệ (chữ ký, tiêu đề...)
      const invalidPatterns = [
        'TGD', 'THANH', 'LỄ', 'CHỮ KÝ', 'GIÁM ĐỐC'
      ];
      if (invalidPatterns.some(pattern => medicineName.toUpperCase().includes(pattern))) {
        skipped++;
        continue;
      }

      // Progress indicator
      if ((imported + updated) % 10 === 0 && (imported + updated) > 0) {
        process.stdout.write(`\r⏳ Processing... ${imported + updated} medicines`);
      }

      await prisma.$transaction(async (tx) => {
        // Parse data from row array based on column positions (0-indexed)
        // A=0: STT, B=1: Tên thuốc, C=2: Đường dùng, D=3: Hàm lượng, E=4: Nơi SX, F=5: ĐVT
        const route = row[2]?.toString().trim() || null;
        const strength = row[3]?.toString().trim() || null;
        const manufacturer = row[4]?.toString().trim() || null;
        
        // G-I (columns 6-8): TỒN ĐẦU KỲ (SL, ĐG, TT)
        const openingQty = parseFloat(row[6]) || 0;
        const openingPrice = parseFloat(row[7]) || 0;
        const openingAmount = parseFloat(row[8]) || 0;
        
        // J-L (columns 9-11): NHẬP TRONG THÁNG (SL, ĐG 5%, TT 5%)
        const monthlyImportQty = parseFloat(row[9]) || 0;
        const monthlyImportPrice = parseFloat(row[10]) || 0;
        const monthlyImportAmount = parseFloat(row[11]) || 0;
        
        // M-O (columns 12-14): XUẤT TRONG THÁNG (SL, ĐG, TT)
        const monthlyExportQty = parseFloat(row[12]) || 0;
        const monthlyExportPrice = parseFloat(row[13]) || 0;
        const monthlyExportAmount = parseFloat(row[14]) || 0;
        
        // P-R (columns 15-17): TỒN CUỐI KỲ (SL, ĐG, TT)
        const closingQty = parseFloat(row[15]) || 0;
        const closingPrice = parseFloat(row[16]) || 0;
        const closingAmount = parseFloat(row[17]) || 0;
        
        // S (column 18): HẠN SỬ DỤNG (dd/mm/yyyy)
        const expiryStr = row[18]?.toString().trim();
        
        // T-V (columns 19-21): LŨY KẾ NĂM NHẬP (SL, ĐG, TT)
        const yearlyImportQty = parseFloat(row[19]) || 0;
        const yearlyImportPrice = parseFloat(row[20]) || 0;
        const yearlyImportAmount = parseFloat(row[21]) || 0;
        
        // W-Y (columns 22-24): LŨY KẾ NĂM XUẤT (SL, ĐG, TT)
        const yearlyExportQty = parseFloat(row[22]) || 0;
        const yearlyExportPrice = parseFloat(row[23]) || 0;
        const yearlyExportAmount = parseFloat(row[24]) || 0;
        
        // Z-AB (columns 25-27): ĐỀ NGHỊ MUA THÁNG 01/2026 (SL, ĐG, TT)
        const suggestedQty = parseFloat(row[25]) || 0;
        const suggestedPrice = parseFloat(row[26]) || 0;
        const suggestedAmount = parseFloat(row[27]) || 0;

        // 1. Tìm/tạo category nếu có
        let categoryId: string | undefined;
        let itemType = MedicalItemType.MEDICINE; // Default
        if (currentCategory) {
          let category = await tx.medicineCategory.findUnique({
            where: { code: currentCategory }
          });

          if (!category) {
            // Nếu category chưa tồn tại, tạo mới (không nên xảy ra nếu đã seed)
            itemType = getMedicalItemType(currentCategory);
            category = await tx.medicineCategory.create({
              data: {
                code: currentCategory,
                name: `Nhóm ${currentCategory}`,
                type: itemType,
                sortOrder: ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 
                           'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII'].indexOf(currentCategory) + 1
              }
            });
          } else {
            // Sử dụng type của category hiện tại
            itemType = category.type;
          }
          categoryId = category.id;
        }

        // 2. Tìm/tạo medicine
        let medicine = await tx.medicine.findFirst({
          where: {
            name: medicineName,
            isActive: true
          }
        });

        if (!medicine) {
          medicine = await tx.medicine.create({
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
          // Update existing medicine - SET categoryId if available
          medicine = await tx.medicine.update({
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

        // 3. Parse expiry date (format: dd/mm/yyyy hoặc mm/dd/yyyy - example: 23/12/2025 hoặc 12/23/2025)
        let expiryDate: Date | null = null;
        if (expiryStr) {
          try {
            // Support multiple formats
            if (expiryStr.includes('/')) {
              // Format: dd/mm/yyyy hoặc mm/dd/yyyy
              const parts = expiryStr.split('/');
              if (parts.length === 3) {
                const part1 = parseInt(parts[0]);
                const part2 = parseInt(parts[1]);
                const year = parseInt(parts[2]);
                
                // Xác định định dạng dựa trên logic:
                // Nếu part1 > 12, chắc chắn là dd/mm/yyyy (vì tháng không thể > 12)
                // Nếu part2 > 12, chắc chắn là mm/dd/yyyy (vì tháng không thể > 12)
                // Nếu cả hai <= 12, ưu tiên dd/mm/yyyy (định dạng Việt Nam)
                let day: number, month: number;
                
                if (part1 > 12) {
                  // Chắc chắn là dd/mm/yyyy
                  day = part1;
                  month = part2;
                } else if (part2 > 12) {
                  // Chắc chắn là mm/dd/yyyy (tự động chuyển sang dd/mm/yyyy)
                  month = part1;
                  day = part2;
                  console.log(`📅 Detected mm/dd/yyyy format for ${medicineName}: ${expiryStr} → converted to dd/mm/yyyy: ${day}/${month}/${year}`);
                } else {
                  // Cả hai <= 12, ưu tiên dd/mm/yyyy (định dạng Việt Nam)
                  day = part1;
                  month = part2;
                }
                
                // Validate day/month/year ranges
                if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
                  // Create date with ISO format: YYYY-MM-DD
                  const isoDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const testDate = new Date(isoDateStr);
                  
                  // Validate that the date components match (catches invalid dates like 31/02/2025)
                  if (testDate.getFullYear() === year && 
                      testDate.getMonth() + 1 === month && 
                      testDate.getDate() === day) {
                    expiryDate = testDate;
                  } else {
                    console.warn(`⚠️  Invalid calendar date for ${medicineName}: ${expiryStr} (day ${day} does not exist in month ${month}/${year})`);
                    expiryDate = null;
                  }
                } else {
                  console.warn(`⚠️  Out of range date for ${medicineName}: ${expiryStr} (day=${day}, month=${month}, year=${year})`);
                  expiryDate = null;
                }
              } else {
                console.warn(`⚠️  Invalid date format for ${medicineName}: ${expiryStr} (expected dd/mm/yyyy or mm/dd/yyyy)`);
                expiryDate = null;
              }
            } else if (expiryStr.includes('-')) {
              // Format: yyyy-mm-dd (ISO format)
              expiryDate = new Date(expiryStr);
              if (isNaN(expiryDate.getTime())) {
                console.warn(`⚠️  Invalid ISO date for ${medicineName}: ${expiryStr}`);
                expiryDate = null;
              }
            } else {
              // Try Excel serial date number (days since 1900-01-01)
              const serialDate = parseFloat(expiryStr);
              if (!isNaN(serialDate) && serialDate > 0) {
                // Excel date calculation:
                // - Excel epoch: 1899-12-31 (day 0)
                // - Serial 1 = 1900-01-01
                // - Excel bug: treats 1900 as leap year (it's not)
                // - For dates after Feb 28, 1900 (serial > 59), Excel adds an extra day
                
                let days = Math.floor(serialDate);
                
                // Correct for Excel's 1900 leap year bug
                // Excel serial 60 = 1900-02-29 (which doesn't exist)
                // So for serial > 59, we need to subtract 1
                if (days > 59) {
                  days = days - 1;
                }
                
                // Calculate date using UTC to avoid timezone issues
                // Excel epoch is 1899-12-31, so we add days from 1900-01-01
                const year1900 = new Date(Date.UTC(1900, 0, 1));
                expiryDate = new Date(year1900.getTime() + (days - 1) * 24 * 60 * 60 * 1000);
                
                // console.log(`📅 Excel serial ${serialDate} converted to ${expiryDate.toISOString().split('T')[0]} for ${medicineName}`);
                
                if (isNaN(expiryDate.getTime())) {
                  console.warn(`⚠️  Invalid Excel serial date for ${medicineName}: ${expiryStr}`);
                  expiryDate = null;
                }
              } else {
                console.warn(`⚠️  Unknown date format for ${medicineName}: ${expiryStr}`);
                expiryDate = null;
              }
            }
          } catch (e: any) {
            console.warn(`⚠️  Error parsing expiry date for ${medicineName}: ${expiryStr}`, e.message);
            expiryDate = null;
          }
        }

        // 4. Upsert MedicineInventory với dữ liệu THỰC từ Excel
        await tx.medicineInventory.upsert({
          where: {
            medicineId_month_year: {
              medicineId: medicine.id,
              month,
              year
            }
          },
          update: {
            expiryDate,
            // TỒN ĐẦU KỲ (G, H, I)
            openingQuantity: openingQty,
            openingUnitPrice: openingPrice,
            openingTotalAmount: openingAmount,
            // PHÁT SINH THÁNG - NHẬP (J, K, L)
            monthlyImportQuantity: monthlyImportQty,
            monthlyImportUnitPrice: monthlyImportPrice,
            monthlyImportAmount: monthlyImportAmount,
            // PHÁT SINH THÁNG - XUẤT (M, N, O)
            monthlyExportQuantity: monthlyExportQty,
            monthlyExportUnitPrice: monthlyExportPrice,
            monthlyExportAmount: monthlyExportAmount,
            // TỒN CUỐI KỲ (P, Q, R)
            closingQuantity: closingQty,
            closingUnitPrice: closingPrice,
            closingTotalAmount: closingAmount,
            // LŨY KẾ NĂM - NHẬP (T, U, V)
            yearlyImportQuantity: yearlyImportQty,
            yearlyImportUnitPrice: yearlyImportPrice,
            yearlyImportAmount: yearlyImportAmount,
            // LŨY KẾ NĂM - XUẤT (W, X, Y)
            yearlyExportQuantity: yearlyExportQty,
            yearlyExportUnitPrice: yearlyExportPrice,
            yearlyExportAmount: yearlyExportAmount,
            // ĐỀ NGHỊ MUA (Z, AA, AB)
            suggestedPurchaseQuantity: suggestedQty,
            suggestedPurchaseUnitPrice: suggestedPrice,
            suggestedPurchaseAmount: suggestedAmount,
          },
          create: {
            medicineId: medicine.id,
            month,
            year,
            expiryDate,
            // TỒN ĐẦU KỲ (G, H, I)
            openingQuantity: openingQty,
            openingUnitPrice: openingPrice,
            openingTotalAmount: openingAmount,
            // PHÁT SINH THÁNG - NHẬP (J, K, L)
            monthlyImportQuantity: monthlyImportQty,
            monthlyImportUnitPrice: monthlyImportPrice,
            monthlyImportAmount: monthlyImportAmount,
            // PHÁT SINH THÁNG - XUẤT (M, N, O)
            monthlyExportQuantity: monthlyExportQty,
            monthlyExportUnitPrice: monthlyExportPrice,
            monthlyExportAmount: monthlyExportAmount,
            // TỒN CUỐI KỲ (P, Q, R)
            closingQuantity: closingQty,
            closingUnitPrice: closingPrice,
            closingTotalAmount: closingAmount,
            // LŨY KẾ NĂM - NHẬP (T, U, V)
            yearlyImportQuantity: yearlyImportQty,
            yearlyImportUnitPrice: yearlyImportPrice,
            yearlyImportAmount: yearlyImportAmount,
            // LŨY KẾ NĂM - XUẤT (W, X, Y)
            yearlyExportQuantity: yearlyExportQty,
            yearlyExportUnitPrice: yearlyExportPrice,
            yearlyExportAmount: yearlyExportAmount,
            // ĐỀ NGHỊ MUA (Z, AA, AB)
            suggestedPurchaseQuantity: suggestedQty,
            suggestedPurchaseUnitPrice: suggestedPrice,
            suggestedPurchaseAmount: suggestedAmount,
          }
        });
      });
    } catch (error) {
      errors.push({
        row: row.STT,
        medicine: row['TÊN THUỐC'],
        error: error.message
      });
    }
  }

  console.log(`\n✅ Import completed:`);
  console.log(`   - Imported: ${imported} new medicines`);
  console.log(`   - Updated: ${updated} existing medicines`);
  if (errors.length > 0) {
    console.log(`   - Errors: ${errors.length}`);
    console.error('❌ Errors:', errors);
  }
}

async function main() {
  // Lấy tham số từ command line
  const args = process.argv.slice(2);
  
  // Default values
  const currentDate = new Date();
  const defaultMonth = currentDate.getMonth() + 1;
  const defaultYear = currentDate.getFullYear();
  const defaultFilePath = path.join(__dirname, 'inventory-data.xlsx');
  
  // Parse arguments với defaults
  const filePath = args[0] || defaultFilePath;
  const month = args[1] ? parseInt(args[1]) : defaultMonth;
  const year = args[2] ? parseInt(args[2]) : defaultYear;

  if (month < 1 || month > 12) {
    console.error('❌ Month must be between 1 and 12');
    process.exit(1);
  }

  // Check if file exists
  const fs = require('fs');
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    console.error('\n💡 Usage:');
    console.error('   npx tsx prisma/import-inventory-from-excel.ts [file-path] [month] [year]');
    console.error('\n📝 Examples:');
    console.error('   npx tsx prisma/import-inventory-from-excel.ts');
    console.error('   npx tsx prisma/import-inventory-from-excel.ts prisma/inventory-data.xlsx');
    console.error('   npx tsx prisma/import-inventory-from-excel.ts prisma/inventory-data.xlsx 1 2024');
    console.error('\n📁 Default file location: prisma/inventory-data.xlsx');
    process.exit(1);
  }

  console.log('\n📦 INVENTORY IMPORT');
  console.log('='.repeat(50));
  console.log(`📁 File:  ${filePath}`);
  console.log(`📅 Month: ${month}/${year}`);
  console.log('='.repeat(50));
  console.log('');

  await importFromExcel(filePath, month, year);
  
  console.log('\n🎉 Import completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Import failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
