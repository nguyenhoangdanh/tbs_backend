/**
 * Data Migration Script: Fix WorkSheetRecord DateTime Fields
 * 
 * This script fixes WorkSheetRecord entries where startTime and endTime
 * were stored as strings instead of proper DateTime objects.
 * 
 * Issue: Prisma error "Unexpected conversion failure for field WorkSheetRecord.endTime 
 * from String(01:30:00) to DateTime. Reason: input contains invalid characters"
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface WorkSheetRecordWithStrings {
  id: string;
  worksheetId: string;
  workHour: number;
  startTime: string | Date;
  endTime: string | Date;
  worksheet: {
    date: Date;
  };
}

/**
 * Create a proper DateTime object from a date and time string
 */
function createDateTimeFromTimeString(date: Date, timeString: string): Date {
  let timeStr = timeString;
  
  // Handle various time formats
  if (typeof timeString === 'string') {
    // Remove any invalid characters and extract time
    timeStr = timeString.replace(/[^0-9:]/g, '');
    
    // If it looks like just time (HH:MM or HH:MM:SS), extract hours and minutes
    const timeParts = timeStr.split(':');
    if (timeParts.length >= 2) {
      const hours = parseInt(timeParts[0], 10);
      const minutes = parseInt(timeParts[1], 10);
      
      if (!isNaN(hours) && !isNaN(minutes)) {
        // Fixed: Use explicit UTC date construction to avoid timezone issues
        const year = date.getFullYear();
        const month = date.getMonth();
        const day = date.getDate();
        
        // Create DateTime using explicit UTC values to avoid timezone conversion issues
        const dateTime = new Date(Date.UTC(year, month, day, hours, minutes, 0, 0));
        return dateTime;
      }
    }
  }
  
  // Fallback: if we can't parse the time, return a default time
  console.warn(`Warning: Could not parse time string "${timeString}", using default time`);
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const dateTime = new Date(Date.UTC(year, month, day, 8, 0, 0, 0)); // Default to 8:00 AM UTC
  return dateTime;
}

/**
 * Get standard work hours for a given hour number based on typical shift patterns
 */
function getStandardTimeForHour(hour: number): { startTime: string; endTime: string } {
  const standardHours: Record<number, { startTime: string; endTime: string }> = {
    1: { startTime: '07:30', endTime: '08:30' },
    2: { startTime: '08:30', endTime: '09:30' },
    3: { startTime: '09:30', endTime: '10:30' },
    4: { startTime: '10:30', endTime: '11:30' },
    5: { startTime: '12:30', endTime: '13:30' },
    6: { startTime: '13:30', endTime: '14:30' },
    7: { startTime: '14:30', endTime: '15:30' },
    8: { startTime: '15:30', endTime: '16:30' },
    9: { startTime: '16:30', endTime: '17:30' },
    10: { startTime: '17:30', endTime: '18:30' },
    11: { startTime: '18:30', endTime: '19:30' },
  };
  
  return standardHours[hour] || { startTime: '08:00', endTime: '09:00' };
}

async function fixWorksheetDateTimeFields() {
  console.log('🔍 Starting WorkSheetRecord DateTime field migration...');
  
  try {
    // First, let's check if there are any records with string time values
    console.log('📊 Analyzing current data...');
    
    // Get all worksheet records with their associated worksheet date
    const records = await prisma.$queryRaw<WorkSheetRecordWithStrings[]>`
      SELECT 
        wr.id,
        wr."worksheetId",
        wr."workHour",
        wr."startTime",
        wr."endTime",
        ws.date as worksheet_date
      FROM "worksheet_records" wr
      JOIN "worksheets" ws ON wr."worksheetId" = ws.id
    `;
    
    console.log(`📈 Found ${records.length} worksheet records to check`);
    
    let fixedCount = 0;
    let skippedCount = 0;
    const errors: Array<{ id: string; error: string }> = [];
    
    for (const record of records) {
      try {
        const worksheetDate = new Date(record.worksheet_date);
        let needsUpdate = false;
        let newStartTime: Date | null = null;
        let newEndTime: Date | null = null;
        
        // Check if startTime needs fixing
        if (typeof record.startTime === 'string') {
          console.log(`🔧 Fixing startTime for record ${record.id}: "${record.startTime}"`);
          newStartTime = createDateTimeFromTimeString(worksheetDate, record.startTime);
          needsUpdate = true;
        } else if (record.startTime instanceof Date) {
          // Check if it's the old 1970 date pattern
          const year = record.startTime.getFullYear();
          if (year === 1970) {
            console.log(`🔧 Fixing 1970 startTime for record ${record.id}`);
            const timeStr = record.startTime.toTimeString().split(' ')[0].substring(0, 5); // Extract HH:MM
            newStartTime = createDateTimeFromTimeString(worksheetDate, timeStr);
            needsUpdate = true;
          }
        }
        
        // Check if endTime needs fixing
        if (typeof record.endTime === 'string') {
          console.log(`🔧 Fixing endTime for record ${record.id}: "${record.endTime}"`);
          newEndTime = createDateTimeFromTimeString(worksheetDate, record.endTime);
          needsUpdate = true;
        } else if (record.endTime instanceof Date) {
          // Check if it's the old 1970 date pattern
          const year = record.endTime.getFullYear();
          if (year === 1970) {
            console.log(`🔧 Fixing 1970 endTime for record ${record.id}`);
            const timeStr = record.endTime.toTimeString().split(' ')[0].substring(0, 5); // Extract HH:MM
            newEndTime = createDateTimeFromTimeString(worksheetDate, timeStr);
            needsUpdate = true;
          }
        }
        
        // If we couldn't determine proper times, use standard times based on work hour
        if (needsUpdate && (!newStartTime || !newEndTime)) {
          const standardTimes = getStandardTimeForHour(record.workHour);
          if (!newStartTime) {
            newStartTime = createDateTimeFromTimeString(worksheetDate, standardTimes.startTime);
          }
          if (!newEndTime) {
            newEndTime = createDateTimeFromTimeString(worksheetDate, standardTimes.endTime);
          }
        }
        
        // Update the record if needed
        if (needsUpdate && newStartTime && newEndTime) {
          await prisma.workSheetRecord.update({
            where: { id: record.id },
            data: {
              startTime: newStartTime,
              endTime: newEndTime,
            },
          });
          
          fixedCount++;
          console.log(`✅ Fixed record ${record.id} - Work Hour ${record.workHour}`);
          console.log(`   StartTime: ${newStartTime.toISOString()}`);
          console.log(`   EndTime: ${newEndTime.toISOString()}`);
        } else {
          skippedCount++;
        }
        
      } catch (error) {
        console.error(`❌ Error processing record ${record.id}:`, error);
        errors.push({ id: record.id, error: error.message });
      }
    }
    
    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Records fixed: ${fixedCount}`);
    console.log(`   ⏭️ Records skipped (already valid): ${skippedCount}`);
    console.log(`   ❌ Errors: ${errors.length}`);
    
    if (errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      errors.forEach(({ id, error }) => {
        console.log(`   Record ${id}: ${error}`);
      });
    }
    
    console.log('\n🎉 Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Execute if run directly
if (require.main === module) {
  fixWorksheetDateTimeFields()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}

export { fixWorksheetDateTimeFields };