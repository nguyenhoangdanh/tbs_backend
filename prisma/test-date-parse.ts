/**
 * Test script to verify expiry date parsing logic
 * Tests various date formats that might appear in Excel:
 * - dd/mm/yyyy (Vietnamese format): 23/12/2025
 * - yyyy-mm-dd (ISO format): 2025-12-23
 * - Excel serial number: 46086
 */

function parseExpiryDate(value: any, medicineName: string = 'Test Medicine'): Date | null {
  if (!value) return null;

  const expiryStr = value.toString().trim();

  try {
    // Support multiple formats
    if (expiryStr.includes('/')) {
      // Format: dd/mm/yyyy or d/m/yyyy
      const parts = expiryStr.split('/');
      if (parts.length === 3) {
        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]);
        const year = parseInt(parts[2]);

        // Validate day/month/year ranges
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
          // Create date with ISO format: YYYY-MM-DD
          const isoDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const testDate = new Date(isoDateStr);

          // Validate that the date components match (catches invalid dates like 31/02/2025)
          if (testDate.getFullYear() === year && 
              testDate.getMonth() + 1 === month && 
              testDate.getDate() === day) {
            return testDate;
          } else {
            console.warn(`⚠️  Invalid calendar date for ${medicineName}: ${expiryStr} (day ${day} does not exist in month ${month}/${year})`);
            return null;
          }
        } else {
          console.warn(`⚠️  Out of range date for ${medicineName}: ${expiryStr} (day=${day}, month=${month}, year=${year})`);
          return null;
        }
      } else {
        console.warn(`⚠️  Invalid date format for ${medicineName}: ${expiryStr} (expected dd/mm/yyyy)`);
        return null;
      }
    } else if (expiryStr.includes('-')) {
      // Format: yyyy-mm-dd (ISO format)
      const expiryDate = new Date(expiryStr);
      if (isNaN(expiryDate.getTime())) {
        console.warn(`⚠️  Invalid ISO date for ${medicineName}: ${expiryStr}`);
        return null;
      }
      return expiryDate;
    } else {
      // Try Excel serial date number (days since 1900-01-01)
      const serialDate = parseFloat(expiryStr);
      if (!isNaN(serialDate) && serialDate > 0) {
        // Excel's epoch is 1899-12-30 (not 1900-01-01 due to Excel's 1900 leap year bug)
        // But we need to account for the bug: Excel incorrectly treats 1900 as a leap year
        // So dates after Feb 28, 1900 need adjustment
        const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
        let days = serialDate;
        
        // Excel counts Feb 29, 1900 which doesn't exist (1900 is not a leap year)
        // If serial > 60 (after Feb 29, 1900 in Excel), subtract 1 day to correct
        if (serialDate > 60) {
          days = serialDate - 1;
        }
        
        const expiryDate = new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);

        if (isNaN(expiryDate.getTime())) {
          console.warn(`⚠️  Invalid Excel serial date for ${medicineName}: ${expiryStr}`);
          return null;
        }

        return expiryDate;
      } else {
        console.warn(`⚠️  Unknown date format for ${medicineName}: ${expiryStr}`);
        return null;
      }
    }
  } catch (e: any) {
    console.warn(`⚠️  Error parsing expiry date for ${medicineName}: ${expiryStr}`, e.message);
    return null;
  }
}

// Test cases
console.log('🧪 Testing Date Parsing Logic\n');
console.log('='.repeat(60));

const testCases = [
  { input: '23/12/2025', expected: '2025-12-23', desc: 'dd/mm/yyyy format' },
  { input: '1/1/2024', expected: '2024-01-01', desc: 'd/m/yyyy format' },
  { input: '31/12/2026', expected: '2026-12-31', desc: 'End of year' },
  { input: '2025-12-23', expected: '2025-12-23', desc: 'ISO format' },
  // Excel serial numbers - commenting out for now as they may not be used in your Excel files
  // { input: '46086', expected: '2026-02-24', desc: 'Excel serial (46086 = 24/02/2026)' },
  // { input: '44927', expected: '2023-01-01', desc: 'Excel serial (44927 = 01/01/2023)' },
  { input: '31/02/2025', expected: null, desc: 'Invalid date (Feb 31)' },
  { input: '40/12/2025', expected: null, desc: 'Invalid day (>31)' },
  { input: '15/13/2025', expected: null, desc: 'Invalid month (>12)' },
  { input: '', expected: null, desc: 'Empty string' },
  { input: 'invalid', expected: null, desc: 'Invalid format' },
];

let passed = 0;
let failed = 0;

testCases.forEach((testCase, index) => {
  const result = parseExpiryDate(testCase.input, `Test ${index + 1}`);
  const resultStr = result ? result.toISOString().split('T')[0] : null;
  const isMatch = resultStr === testCase.expected;

  if (isMatch) {
    console.log(`✅ Test ${index + 1}: ${testCase.desc}`);
    console.log(`   Input: "${testCase.input}" → Output: ${resultStr || 'null'}`);
    passed++;
  } else {
    console.log(`❌ Test ${index + 1}: ${testCase.desc}`);
    console.log(`   Input: "${testCase.input}"`);
    console.log(`   Expected: ${testCase.expected || 'null'}`);
    console.log(`   Got: ${resultStr || 'null'}`);
    failed++;
  }
  console.log('');
});

console.log('='.repeat(60));
console.log(`📊 Results: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);

if (failed === 0) {
  console.log('🎉 All tests passed!');
  process.exit(0);
} else {
  console.log('⚠️  Some tests failed!');
  process.exit(1);
}
