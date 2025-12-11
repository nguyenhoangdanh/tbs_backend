import XLSX from 'xlsx';
import path from 'path';

const excelPath = path.join(__dirname, 'data.xlsx');
const workbook = XLSX.readFile(excelPath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(sheet);

console.log('First row keys:', data[0] ? Object.keys(data[0]) : 'No data');
console.log('First row:', data[0]);

const departments = new Map<string, { pb: string; tt: string }>();

data.forEach((row: any) => {
  const pb = row['PHÒNG BAN'];
  const tt = row['TRỰC THUỘC'];
  
  if (pb && tt) {
    const pbStr = pb.toString().trim();
    const ttStr = tt.toString().trim();
    const key = `${pbStr}__${ttStr}`;
    if (!departments.has(key)) {
      departments.set(key, { pb: pbStr, tt: ttStr });
    }
  }
});

console.log('\n📋 Unique Departments from Excel:\n');
const byOffice = new Map<string, string[]>();

departments.forEach(({ pb, tt }) => {
  if (!byOffice.has(tt)) {
    byOffice.set(tt, []);
  }
  byOffice.get(tt)!.push(pb);
});

byOffice.forEach((depts, office) => {
  console.log(`\n${office}:`);
  depts.forEach(dept => {
    console.log(`  - ${dept}`);
  });
});

console.log(`\nTotal: ${departments.size} unique departments`);
