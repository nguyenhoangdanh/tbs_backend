import { PrismaClient } from '@prisma/client';
import { getCurrentWorkWeek, getPreviousWorkWeek } from '../src/common/utils/week-utils';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: ['error', 'warn'],
});

async function lockReports(weekNumber?: number, year?: number) {
  try {
    console.log('🔒 Starting report locking process...');
    
    // If no specific week provided, use previous work week
    let targetWeek: { weekNumber: number; year: number };
    
    if (weekNumber && year) {
      targetWeek = { weekNumber, year };
      console.log(`📅 Locking reports for specified week: ${weekNumber}/${year}`);
    } else {
      const currentWeek = getCurrentWorkWeek();
      targetWeek = getPreviousWorkWeek(currentWeek.weekNumber, currentWeek.year);
      console.log(`📅 Locking reports for previous work week: ${targetWeek.weekNumber}/${targetWeek.year}`);
    }

    // Find all reports for the target week
    const reportsToLock = await prisma.report.findMany({
      where: {
        weekNumber: targetWeek.weekNumber,
        year: targetWeek.year,
        isLocked: false,
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            employeeCode: true,
          },
        },
      },
    });

    console.log(`📊 Found ${reportsToLock.length} unlocked reports for week ${targetWeek.weekNumber}/${targetWeek.year}`);

    if (reportsToLock.length === 0) {
      console.log('✅ No reports to lock');
      return { count: 0, lockedReports: [] };
    }

    // Lock all reports
    const result = await prisma.report.updateMany({
      where: {
        weekNumber: targetWeek.weekNumber,
        year: targetWeek.year,
        isLocked: false,
      },
      data: {
        isLocked: true,
      },
    });

    console.log(`✅ Successfully locked ${result.count} reports`);

    // Log details of locked reports
    console.log('\n📋 Locked reports:');
    reportsToLock.forEach((report, index) => {
      console.log(`   ${index + 1}. ${report.user.firstName} ${report.user.lastName} (${report.user.employeeCode})`);
    });

    return {
      count: result.count,
      lockedReports: reportsToLock.map(r => ({
        id: r.id,
        userCode: r.user.employeeCode,
        userName: `${r.user.firstName} ${r.user.lastName}`,
        isCompleted: r.isCompleted,
      })),
    };

  } catch (error) {
    console.error('❌ Error locking reports:', error.message);
    throw error;
  }
}

// CLI usage
async function main() {
  const args = process.argv.slice(2);
  let weekNumber: number | undefined;
  let year: number | undefined;

  if (args.length >= 2) {
    weekNumber = parseInt(args[0]);
    year = parseInt(args[1]);
    
    if (isNaN(weekNumber) || isNaN(year)) {
      console.error('❌ Invalid week number or year');
      console.log('💡 Usage: npx tsx scripts/lock-report.ts [weekNumber] [year]');
      process.exit(1);
    }
  }

  try {
    console.log('🚀 Weekly Report Lock Script');
    console.log('============================');
    
    const result = await lockReports(weekNumber, year);
    
    console.log('\n🎉 Lock process completed successfully!');
    console.log(`📊 Total reports locked: ${result.count}`);
    
  } catch (error) {
    console.error('\n❌ Lock process failed:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { lockReports };
