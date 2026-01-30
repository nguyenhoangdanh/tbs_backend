import * as XLSX from 'xlsx';
import * as path from 'path';

/**
 * Script để validate cấu trúc Excel và preview dữ liệu
 * Giúp kiểm tra mapping columns có đúng không
 */

const COLUMN_MAPPING = {
  0: 'A - STT',
  1: 'B - TÊN THUỐC',
  2: 'C - ĐƯỜNG DÙNG',
  3: 'D - HÀM LƯỢNG',
  4: 'E - NƠI SX',
  5: 'F - ĐVT',
  6: 'G - TỒN ĐẦU KỲ SL',
  7: 'H - TỒN ĐẦU KỲ ĐG',
  8: 'I - TỒN ĐẦU KỲ TT',
  9: 'J - NHẬP SL',
  10: 'K - NHẬP ĐG',
  11: 'L - NHẬP TT',
  12: 'M - XUẤT SL',
  13: 'N - XUẤT ĐG',
  14: 'O - XUẤT TT',
  15: 'P - TỒN CUỐI KỲ SL',
  16: 'Q - TỒN CUỐI KỲ ĐG',
  17: 'R - TỒN CUỐI KỲ TT',
  18: 'S - HẠN SỬ DỤNG',
  19: 'T - LŨY KẾ NHẬP SL',
  20: 'U - LŨY KẾ NHẬP ĐG',
  21: 'V - LŨY KẾ NHẬP TT',
  22: 'W - LŨY KẾ XUẤT SL',
  23: 'X - LŨY KẾ XUẤT ĐG',
  24: 'Y - LŨY KẾ XUẤT TT',
  25: 'Z - ĐỀ NGHỊ MUA SL',
  26: 'AA - ĐỀ NGHỊ MUA ĐG',
  27: 'AB - ĐỀ NGHỊ MUA TT',
};

function validateExcel(filePath: string) {
  console.log('\n📖 Reading Excel file:', filePath);
  
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  console.log(`📋 Sheet name: ${sheetName}`);
  
  // Get range info
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  console.log(`📐 Range: ${XLSX.utils.encode_range(range)}`);
  console.log(`   Rows: ${range.s.r} to ${range.e.r} (${range.e.r - range.s.r + 1} total)`);
  console.log(`   Cols: ${range.s.c} to ${range.e.c} (${range.e.c - range.s.c + 1} total)`);
  
  // Read data starting from row 10 (index 9)
  const data = XLSX.utils.sheet_to_json(worksheet, { 
    header: 1,
    range: 9 // Start from row 10
  }) as any[][];
  
  console.log(`\n📊 Data rows: ${data.length}`);
  
  // Display column mapping
  console.log('\n📋 COLUMN MAPPING:');
  console.log('='.repeat(60));
  Object.entries(COLUMN_MAPPING).forEach(([index, desc]) => {
    console.log(`  ${index.padStart(2, ' ')}: ${desc}`);
  });
  
  // Preview first 3 valid data rows
  console.log('\n🔍 PREVIEW FIRST 3 VALID DATA ROWS:');
  console.log('='.repeat(80));
  
  let previewCount = 0;
  for (let i = 0; i < data.length && previewCount < 3; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;
    
    const stt = row[0]?.toString().trim();
    const name = row[1]?.toString().trim();
    const units = row[5]?.toString().trim();
    
    // Skip if not a data row
    if (!stt || !name || !units) continue;
    if (name.includes('NHÓM THUỐC') || name.includes('TỔNG CỘNG')) continue;
    
    previewCount++;
    console.log(`\n📌 Row ${i + 10} (Excel row ${i + 10}):`);
    console.log(`   [A] STT: ${row[0]}`);
    console.log(`   [B] TÊN THUỐC: ${row[1]}`);
    console.log(`   [C] ĐƯỜNG DÙNG: ${row[2] || '(empty)'}`);
    console.log(`   [D] HÀM LƯỢNG: ${row[3] || '(empty)'}`);
    console.log(`   [E] NƠI SX: ${row[4] || '(empty)'}`);
    console.log(`   [F] ĐVT: ${row[5]}`);
    console.log(`   --- TỒN ĐẦU KỲ ---`);
    console.log(`   [G] SL: ${row[6] || 0}`);
    console.log(`   [H] ĐG: ${row[7] || 0}`);
    console.log(`   [I] TT: ${row[8] || 0}`);
    console.log(`   --- NHẬP THÁNG ---`);
    console.log(`   [J] SL: ${row[9] || 0}`);
    console.log(`   [K] ĐG: ${row[10] || 0}`);
    console.log(`   [L] TT: ${row[11] || 0}`);
    console.log(`   --- XUẤT THÁNG ---`);
    console.log(`   [M] SL: ${row[12] || 0}`);
    console.log(`   [N] ĐG: ${row[13] || 0}`);
    console.log(`   [O] TT: ${row[14] || 0}`);
    console.log(`   --- TỒN CUỐI KỲ ---`);
    console.log(`   [P] SL: ${row[15] || 0}`);
    console.log(`   [Q] ĐG: ${row[16] || 0}`);
    console.log(`   [R] TT: ${row[17] || 0}`);
    console.log(`   [S] HẠN SỬ DỤNG: ${row[18] || '(empty)'}`);
    console.log(`   --- LŨY KẾ NĂM NHẬP ---`);
    console.log(`   [T] SL: ${row[19] || 0}`);
    console.log(`   [U] ĐG: ${row[20] || 0}`);
    console.log(`   [V] TT: ${row[21] || 0}`);
    console.log(`   --- LŨY KẾ NĂM XUẤT ---`);
    console.log(`   [W] SL: ${row[22] || 0}`);
    console.log(`   [X] ĐG: ${row[23] || 0}`);
    console.log(`   [Y] TT: ${row[24] || 0}`);
    console.log(`   --- ĐỀ NGHỊ MUA ---`);
    console.log(`   [Z] SL: ${row[25] || 0}`);
    console.log(`   [AA] ĐG: ${row[26] || 0}`);
    console.log(`   [AB] TT: ${row[27] || 0}`);
  }
  
  // Count valid data rows
  let validRows = 0;
  for (const row of data) {
    if (!row || row.length === 0) continue;
    const stt = row[0]?.toString().trim();
    const name = row[1]?.toString().trim();
    const units = row[5]?.toString().trim();
    if (!stt || !name || !units) continue;
    if (name.includes('NHÓM THUỐC') || name.includes('TỔNG CỘNG')) continue;
    validRows++;
  }
  
  console.log(`\n✅ Valid data rows: ${validRows}`);
  console.log('\n🎉 Validation completed!');
}

function main() {
  const args = process.argv.slice(2);
  const defaultFilePath = path.join(__dirname, 'inventory-data.xlsx');
  const filePath = args[0] || defaultFilePath;
  
  const fs = require('fs');
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    console.error('\n💡 Usage:');
    console.error('   npx tsx prisma/validate-excel-columns.ts [file-path]');
    console.error('\n📝 Example:');
    console.error('   npx tsx prisma/validate-excel-columns.ts prisma/inventory-data.xlsx');
    process.exit(1);
  }
  
  validateExcel(filePath);
}

main();
