import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createSampleWorksheetData() {
  console.log('🌱 Creating sample worksheet data...');
  
  try {
    // Get existing factories, groups, products, and processes
    const factories = await prisma.factory.findMany({ take: 3 });
    const groups = await prisma.group.findMany({ 
      take: 5,
      include: { 
        members: { where: { role: 'WORKER' } },
        team: { include: { line: { include: { factory: true } } } }
      }
    });
    const products = await prisma.product.findMany({ take: 3 });
    const processes = await prisma.process.findMany({ take: 3 });

    if (factories.length === 0 || groups.length === 0 || products.length === 0 || processes.length === 0) {
      console.log('❌ Missing required data. Please run sample-manufacturing-data.ts first');
      return;
    }

    // Get an admin user to create worksheets
    const adminUser = await prisma.user.findFirst({
      where: { role: 'ADMIN' }
    });

    if (!adminUser) {
      console.log('❌ No admin user found. Please create an admin user first');
      return;
    }

    // Create sample worksheets for the last 7 days
    const today = new Date();
    const worksheetsCreated = [];

    for (let i = 0; i < 7; i++) {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() - i);

      // Create 2-3 worksheets per day for different groups
      const dailyGroups = groups.slice(0, Math.min(3, groups.length));
      
      for (const group of dailyGroups) {
        // Skip if group has no workers
        if (!group.members || group.members.length === 0) {
          continue;
        }

        // Check if worksheet already exists
        const existing = await prisma.workSheet.findUnique({
          where: {
            date_groupId: {
              date: targetDate,
              groupId: group.id
            }
          }
        });

        if (existing) {
          console.log(`⏭️ Worksheet already exists for group ${group.name} on ${targetDate.toDateString()}`);
          continue;
        }

        // Get a product-process combination
        const productProcess = await prisma.productProcess.findFirst({
          where: {
            productId: products[i % products.length].id,
            processId: processes[i % processes.length].id
          },
          include: {
            product: true,
            process: true
          }
        });

        if (!productProcess) {
          // Create a missing product-process combination
          const product = products[i % products.length];
          const process = processes[i % processes.length];
          
          const newProductProcess = await prisma.productProcess.create({
            data: {
              productId: product.id,
              processId: process.id,
              standardOutputPerHour: 25 + (i * 5), // Vary the standard output
              standardWorkers: 5,
              sequence: 1
            },
            include: {
              product: true,
              process: true
            }
          });
          
          console.log(`✅ Created ProductProcess: ${newProductProcess.product.name} - ${newProductProcess.process.name}`);
        }

        // Determine shift type (vary across days)
        const shiftTypes = ['NORMAL_8H', 'EXTENDED_9_5H', 'OVERTIME_11H'] as const;
        const shiftType = shiftTypes[i % shiftTypes.length];

        // Create worksheet
        try {
          const totalWorkers = group.members.length;
          const factoryId = group.team.line.factory.id;
          
          // Calculate target output per hour
          const targetOutputPerHour = Math.round(
            (productProcess?.standardOutputPerHour || 25) * totalWorkers / (productProcess?.standardWorkers || 5)
          );

          const worksheet = await prisma.$transaction(async (tx) => {
            // Create main worksheet
            const newWorksheet = await tx.workSheet.create({
              data: {
                date: targetDate,
                factoryId,
                groupId: group.id,
                shiftType,
                totalWorkers,
                targetOutputPerHour,
                createdById: adminUser.id,
                status: 'ACTIVE',
              }
            });

            // Create worksheet items for each worker
            await Promise.all(
              group.members.map(worker =>
                tx.workSheetItem.create({
                  data: {
                    worksheetId: newWorksheet.id,
                    workerId: worker.id,
                    productId: productProcess?.productId || products[0].id,
                    processId: productProcess?.processId || processes[0].id,
                  }
                })
              )
            );

            // Create worksheet records for hours based on shift type
            const workHours = getWorkHoursWithDate(shiftType, targetDate);
            await Promise.all(
              workHours.map(({ hour, startTime, endTime }) =>
                tx.workSheetRecord.create({
                  data: {
                    worksheetId: newWorksheet.id,
                    workHour: hour,
                    startTime,
                    endTime,
                    expectedOutputTotal: targetOutputPerHour, // Set expected output
                    status: 'PENDING',
                  }
                })
              )
            );

            return newWorksheet;
          });

          worksheetsCreated.push({
            id: worksheet.id,
            date: targetDate.toDateString(),
            group: group.name,
            factory: group.team.line.factory.name,
            shiftType,
            workers: totalWorkers
          });

          console.log(`✅ Created worksheet for ${group.name} on ${targetDate.toDateString()} (${shiftType})`);
        } catch (error) {
          console.error(`❌ Failed to create worksheet for ${group.name}:`, error.message);
        }
      }
    }

    console.log(`\n🎉 Successfully created ${worksheetsCreated.length} sample worksheets`);
    console.log('\nSummary:');
    worksheetsCreated.forEach(ws => {
      console.log(`  - ${ws.date}: ${ws.factory} > ${ws.group} (${ws.shiftType}, ${ws.workers} workers)`);
    });

  } catch (error) {
    console.error('❌ Error creating sample worksheet data:', error);
  }
}

function getWorkHoursForShift(shiftType: string) {
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

  switch (shiftType) {
    case 'NORMAL_8H':
      return baseHours; // 7 working hours

    case 'EXTENDED_9_5H':
      return [
        ...baseHours,
        { hour: 8, startTime: '15:30', endTime: '16:30' },
        { hour: 9, startTime: '16:30', endTime: '17:00' },
        { hour: 10, startTime: '17:00', endTime: '18:00' },
      ];

    case 'OVERTIME_11H':
      return [
        ...baseHours,
        { hour: 8, startTime: '15:30', endTime: '16:30' },
        // Dinner break 16:30-17:00
        { hour: 9, startTime: '17:00', endTime: '18:00' },
        { hour: 10, startTime: '18:00', endTime: '19:00' },
        { hour: 11, startTime: '19:00', endTime: '20:00' },
      ];

    default:
      return baseHours;
  }
}

/**
 * Get work hours with full DateTime objects using the actual worksheet date
 */
function getWorkHoursWithDate(shiftType: string, worksheetDate: Date) {
  const timeSlots = getWorkHoursForShift(shiftType);
  
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

/**
 * Create a proper DateTime object from a date and time string
 */
function createDateTimeFromTimeString(date: Date, timeString: string): Date {
  const [hours, minutes] = timeString.split(':').map(Number);
  const dateTime = new Date(date);
  dateTime.setHours(hours, minutes, 0, 0);
  return dateTime;
}

// Execute if run directly
if (require.main === module) {
  createSampleWorksheetData()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}

export { createSampleWorksheetData };