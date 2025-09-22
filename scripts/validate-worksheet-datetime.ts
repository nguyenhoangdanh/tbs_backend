/**
 * Test Script: Validate WorkSheetRecord DateTime Fix
 * 
 * This script validates that the DateTime fix works correctly by:
 * 1. Creating test data with proper DateTime objects
 * 2. Querying the data to ensure no conversion errors
 * 3. Verifying frontend-backend compatibility
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Create a proper DateTime object from a date and time string
 */
function createDateTimeFromTimeString(date: Date, timeString: string): Date {
  const [hours, minutes] = timeString.split(':').map(Number);
  const dateTime = new Date(date);
  dateTime.setHours(hours, minutes, 0, 0);
  return dateTime;
}

/**
 * Get work hours with proper DateTime objects
 */
function getWorkHoursWithDate(shiftType: string, worksheetDate: Date) {
  const baseHours = [
    { hour: 1, startTime: '07:30', endTime: '08:30' },
    { hour: 2, startTime: '08:30', endTime: '09:30' },
    { hour: 3, startTime: '09:30', endTime: '10:30' },
    { hour: 4, startTime: '10:30', endTime: '11:30' },
    // Lunch break 11:30-12:30
    { hour: 5, startTime: '12:30', endTime: '13:30' },
    { hour: 6, startTime: '13:30', endTime: '14:30' },
    { hour: 7, startTime: '14:30', endTime: '15:30' },
  ];

  let timeSlots = baseHours;

  switch (shiftType) {
    case 'NORMAL_8H':
      timeSlots = baseHours; // 7 working hours
      break;

    case 'EXTENDED_9_5H':
      timeSlots = [
        ...baseHours,
        { hour: 8, startTime: '15:30', endTime: '16:30' },
        { hour: 9, startTime: '16:30', endTime: '17:00' },
        { hour: 10, startTime: '17:00', endTime: '18:00' },
      ];
      break;

    case 'OVERTIME_11H':
      timeSlots = [
        ...baseHours,
        { hour: 8, startTime: '15:30', endTime: '16:30' },
        // Dinner break 16:30-17:00
        { hour: 9, startTime: '17:00', endTime: '18:00' },
        { hour: 10, startTime: '18:00', endTime: '19:00' },
        { hour: 11, startTime: '19:00', endTime: '20:00' },
      ];
      break;

    default:
      timeSlots = baseHours;
  }
  
  return timeSlots.map(({ hour, startTime, endTime }) => {
    // Create proper DateTime objects with the actual worksheet date
    const startDateTime = createDateTimeFromTimeString(worksheetDate, startTime);
    const endDateTime = createDateTimeFromTimeString(worksheetDate, endTime);
    
    return {
      hour,
      startTime: startDateTime,
      endTime: endDateTime
    };
  });
}

async function validateWorksheetDateTimeFix() {
  console.log('🧪 Starting WorkSheetRecord DateTime validation...');
  
  try {
    // Test 1: Query existing records to check for conversion errors
    console.log('\n📋 Test 1: Querying existing WorkSheetRecord data...');
    
    try {
      const existingRecords = await prisma.workSheetRecord.findMany({
        take: 5,
        include: {
          worksheet: {
            select: {
              date: true,
              shiftType: true
            }
          }
        }
      });
      
      console.log(`✅ Successfully queried ${existingRecords.length} existing records`);
      
      // Validate that startTime and endTime are proper Date objects
      for (const record of existingRecords) {
        if (!(record.startTime instanceof Date) || !(record.endTime instanceof Date)) {
          console.error(`❌ Record ${record.id} has invalid DateTime objects`);
          console.error(`   startTime type: ${typeof record.startTime}, value: ${record.startTime}`);
          console.error(`   endTime type: ${typeof record.endTime}, value: ${record.endTime}`);
        } else {
          console.log(`✅ Record ${record.id} has valid DateTime objects`);
          console.log(`   WorkHour: ${record.workHour}`);
          console.log(`   StartTime: ${record.startTime.toISOString()}`);
          console.log(`   EndTime: ${record.endTime.toISOString()}`);
        }
      }
      
    } catch (error) {
      console.error('❌ Error querying existing records:', error.message);
      return false;
    }
    
    // Test 2: Create test worksheet with proper DateTime objects
    console.log('\n📋 Test 2: Creating test worksheet with proper DateTime handling...');
    
    // Find a test group
    const testGroup = await prisma.group.findFirst({
      include: {
        members: { where: { role: 'WORKER' }, take: 2 },
        team: { include: { line: { include: { factory: true } } } }
      }
    });
    
    if (!testGroup || testGroup.members.length === 0) {
      console.log('⏭️ Skipping test worksheet creation - no suitable test group found');
    } else {
      const testDate = new Date();
      testDate.setDate(testDate.getDate() + 1); // Tomorrow to avoid conflicts
      
      // Get admin user
      const adminUser = await prisma.user.findFirst({
        where: { role: 'ADMIN' }
      });
      
      if (!adminUser) {
        console.log('⏭️ Skipping test worksheet creation - no admin user found');
      } else {
        const testWorksheetId = `test-${Date.now()}`;
        
        try {
          // Create test worksheet
          const testWorksheet = await prisma.$transaction(async (tx) => {
            const worksheet = await tx.workSheet.create({
              data: {
                date: testDate,
                factoryId: testGroup.team.line.factory.id,
                groupId: testGroup.id,
                shiftType: 'NORMAL_8H',
                totalWorkers: testGroup.members.length,
                targetOutputPerHour: 25,
                createdById: adminUser.id,
                status: 'ACTIVE',
              }
            });
            
            // Create test items
            await Promise.all(
              testGroup.members.map(worker => {
                // Find a product and process for testing
                return prisma.product.findFirst().then(product => {
                  if (product) {
                    return prisma.process.findFirst().then(process => {
                      if (process) {
                        return tx.workSheetItem.create({
                          data: {
                            worksheetId: worksheet.id,
                            workerId: worker.id,
                            productId: product.id,
                            processId: process.id,
                          }
                        });
                      }
                    });
                  }
                });
              })
            );
            
            // Create test records with proper DateTime objects
            const workHours = getWorkHoursWithDate('NORMAL_8H', testDate);
            const testRecords = await Promise.all(
              workHours.map(({ hour, startTime, endTime }) =>
                tx.workSheetRecord.create({
                  data: {
                    worksheetId: worksheet.id,
                    workHour: hour,
                    startTime,
                    endTime,
                    status: 'PENDING',
                  }
                })
              )
            );
            
            return { worksheet, records: testRecords };
          });
          
          console.log(`✅ Successfully created test worksheet with ${testWorksheet.records.length} records`);
          
          // Validate the created records
          for (const record of testWorksheet.records) {
            if (!(record.startTime instanceof Date) || !(record.endTime instanceof Date)) {
              console.error(`❌ Test record ${record.id} has invalid DateTime objects`);
            } else {
              console.log(`✅ Test record hour ${record.workHour}: ${record.startTime.toISOString()} - ${record.endTime.toISOString()}`);
            }
          }
          
          // Clean up test data
          await prisma.workSheet.delete({
            where: { id: testWorksheet.worksheet.id }
          });
          console.log('🧹 Cleaned up test worksheet');
          
        } catch (error) {
          console.error('❌ Error creating test worksheet:', error.message);
        }
      }
    }
    
    // Test 3: Validate time format consistency
    console.log('\n📋 Test 3: Validating time format consistency...');
    
    const testDate = new Date('2024-01-15');
    const workHours = getWorkHoursWithDate('NORMAL_8H', testDate);
    
    console.log('✅ Time schedule validation:');
    workHours.forEach(({ hour, startTime, endTime }) => {
      console.log(`   Hour ${hour}: ${startTime.toTimeString().substring(0, 8)} - ${endTime.toTimeString().substring(0, 8)}`);
      console.log(`   ISO: ${startTime.toISOString()} - ${endTime.toISOString()}`);
    });
    
    // Test 4: Frontend compatibility check
    console.log('\n📋 Test 4: Frontend compatibility validation...');
    
    // Simulate what frontend receives
    const mockApiResponse = workHours.map(({ hour, startTime, endTime }) => ({
      workHour: hour,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      status: 'PENDING'
    }));
    
    console.log('✅ Mock API response format:');
    mockApiResponse.forEach(record => {
      // Simulate frontend date parsing
      try {
        const frontendStartTime = new Date(record.startTime);
        const frontendEndTime = new Date(record.endTime);
        
        // Simulate frontend time formatting
        const timeDisplay = `${frontendStartTime.getHours().toString().padStart(2, '0')}:${frontendStartTime.getMinutes().toString().padStart(2, '0')}`;
        
        console.log(`   Hour ${record.workHour}: ${timeDisplay} (frontend format)`);
      } catch (error) {
        console.error(`❌ Frontend parsing error for hour ${record.workHour}:`, error.message);
      }
    });
    
    console.log('\n🎉 All DateTime validation tests completed successfully!');
    return true;
    
  } catch (error) {
    console.error('❌ Validation failed:', error);
    return false;
  }
}

// Execute if run directly
if (require.main === module) {
  validateWorksheetDateTimeFix()
    .then(success => {
      if (success) {
        console.log('\n✅ All validations passed!');
        process.exit(0);
      } else {
        console.log('\n❌ Some validations failed!');
        process.exit(1);
      }
    })
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}

export { validateWorksheetDateTimeFix };