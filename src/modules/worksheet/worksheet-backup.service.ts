import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class WorksheetBackupService {
  private readonly logger = new Logger(WorksheetBackupService.name);

  constructor(private prisma: PrismaService) {}

  // Run monthly backup on the 1st day of each month at 2 AM
  @Cron('0 2 1 * *')
  async handleMonthlyBackup() {
    this.logger.log('Starting monthly worksheet backup...');
    
    try {
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const month = lastMonth.getMonth() + 1;
      const year = lastMonth.getFullYear();

      await this.createMonthlyBackup(month, year);
      
      this.logger.log(`Monthly backup completed for ${month}/${year}`);
    } catch (error) {
      this.logger.error('Monthly backup failed:', error);
    }
  }

  /**
   * Create monthly backup for specified month/year
   */
  async createMonthlyBackup(month: number, year: number, retentionDays: number = 30) {
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 1);

    // Get all worksheets for the month
    const monthlyWorksheets = await this.prisma.workSheet.findMany({
      where: {
        date: {
          gte: startOfMonth,
          lt: endOfMonth
        }
      },
      include: {
        factory: { select: { id: true, name: true, code: true } },
        group: { select: { id: true, name: true, code: true } },
        records: {
          include: {
            itemRecords: {
              include: {
                item: {
                  include: {
                    worker: { select: { id: true, employeeCode: true } }
                  }
                }
              }
            },
            causes: true
          }
        }
      }
    });

    // Group by factory and group
    const factoryGroupMap = new Map<string, Map<string, any>>();

    monthlyWorksheets.forEach(worksheet => {
      const factoryId = worksheet.factoryId;
      const groupId = worksheet.groupId;

      if (!factoryGroupMap.has(factoryId)) {
        factoryGroupMap.set(factoryId, new Map());
      }

      const groupMap = factoryGroupMap.get(factoryId)!;
      if (!groupMap.has(groupId)) {
        groupMap.set(groupId, {
          factory: worksheet.factory,
          group: worksheet.group,
          worksheets: [],
          totalOutput: 0,
          totalTarget: 0,
          totalWorksheets: 0
        });
      }

      const groupData = groupMap.get(groupId)!;
      groupData.worksheets.push(worksheet);
      groupData.totalWorksheets += 1;

      // Calculate totals
      worksheet.records.forEach(record => {
        const recordTarget = worksheet.targetOutputPerHour;
        const recordActual = record.itemRecords.reduce((sum, item) => sum + item.actualOutput, 0);
        
        groupData.totalTarget += recordTarget;
        groupData.totalOutput += recordActual;
      });
    });

    // Create backup records for each factory-group combination
    const backupPromises: Promise<any>[] = [];

    for (const [factoryId, groupMap] of factoryGroupMap) {
      for (const [groupId, groupData] of groupMap) {
        const avgEfficiency = groupData.totalTarget > 0 ? 
          Math.round((groupData.totalOutput / groupData.totalTarget) * 100) : 0;

        // Prepare compressed summary data
        const backupData = {
          month,
          year,
          factory: groupData.factory,
          group: groupData.group,
          summary: {
            totalWorksheets: groupData.totalWorksheets,
            totalOutput: groupData.totalOutput,
            totalTarget: groupData.totalTarget,
            avgEfficiency
          },
          dailyBreakdown: this.calculateDailyBreakdown(groupData.worksheets),
          workerPerformance: this.calculateWorkerPerformance(groupData.worksheets),
          causesAnalysis: this.analyzeCauses(groupData.worksheets)
        };

        const backupPromise = this.prisma.workSheetMonthlyBackup.upsert({
          where: {
            month_year_factoryId_groupId: {
              month,
              year,
              factoryId,
              groupId
            }
          },
          update: {
            totalWorksheets: groupData.totalWorksheets,
            totalOutput: groupData.totalOutput,
            avgEfficiency: avgEfficiency / 100, // Store as decimal
            backupData: backupData as any
          },
          create: {
            month,
            year,
            factoryId,
            groupId,
            totalWorksheets: groupData.totalWorksheets,
            totalOutput: groupData.totalOutput,
            avgEfficiency: avgEfficiency / 100, // Store as decimal
            backupData: backupData as any
          }
        });

        backupPromises.push(backupPromise);
      }
    }

    // Execute all backup operations
    await Promise.all(backupPromises);

    // Optional: Archive old detailed records (configurable)
    if (retentionDays > 0) {
      await this.archiveOldRecords(retentionDays);
    }

    this.logger.log(`Created ${backupPromises.length} monthly backup records for ${month}/${year}`);
    
    return {
      month,
      year,
      totalBackups: backupPromises.length,
      totalWorksheets: monthlyWorksheets.length
    };
  }

  private calculateDailyBreakdown(worksheets: any[]) {
    const dailyMap = new Map<string, any>();

    worksheets.forEach(worksheet => {
      const dateKey = worksheet.date.toISOString().split('T')[0];
      
      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, {
          date: dateKey,
          worksheets: 0,
          totalOutput: 0,
          totalTarget: 0
        });
      }

      const dayData = dailyMap.get(dateKey)!;
      dayData.worksheets += 1;

      worksheet.records.forEach(record => {
        const recordTarget = worksheet.targetOutputPerHour;
        const recordActual = record.itemRecords.reduce((sum, item) => sum + item.actualOutput, 0);
        
        dayData.totalTarget += recordTarget;
        dayData.totalOutput += recordActual;
      });
    });

    return Array.from(dailyMap.values()).map(day => ({
      ...day,
      efficiency: day.totalTarget > 0 ? Math.round((day.totalOutput / day.totalTarget) * 100) : 0
    }));
  }

  private calculateWorkerPerformance(worksheets: any[]) {
    const workerMap = new Map<string, any>();

    worksheets.forEach(worksheet => {
      worksheet.records.forEach(record => {
        record.itemRecords.forEach(itemRecord => {
          const workerId = itemRecord.item.worker.id;
          const employeeCode = itemRecord.item.worker.employeeCode;

          if (!workerMap.has(workerId)) {
            workerMap.set(workerId, {
              workerId,
              employeeCode,
              totalOutput: 0,
              totalTarget: 0,
              totalHours: 0
            });
          }

          const workerData = workerMap.get(workerId)!;
          workerData.totalOutput += itemRecord.actualOutput;
          workerData.totalTarget += itemRecord.targetOutput || 0;
          workerData.totalHours += 1;
        });
      });
    });

    return Array.from(workerMap.values()).map(worker => ({
      ...worker,
      avgOutputPerHour: worker.totalHours > 0 ? Math.round(worker.totalOutput / worker.totalHours) : 0,
      efficiency: worker.totalTarget > 0 ? Math.round((worker.totalOutput / worker.totalTarget) * 100) : 0
    }));
  }

  private analyzeCauses(worksheets: any[]) {
    const causesMap = new Map<string, any>();

    worksheets.forEach(worksheet => {
      worksheet.records.forEach(record => {
        record.causes?.forEach(cause => {
          const causeType = cause.cause;

          if (!causesMap.has(causeType)) {
            causesMap.set(causeType, {
              cause: causeType,
              totalDelta: 0,
              occurrences: 0,
              avgImpact: 0
            });
          }

          const causeData = causesMap.get(causeType)!;
          causeData.totalDelta += cause.delta;
          causeData.occurrences += 1;
        });
      });
    });

    return Array.from(causesMap.values()).map(cause => ({
      ...cause,
      avgImpact: cause.occurrences > 0 ? Math.round(cause.totalDelta / cause.occurrences) : 0
    }));
  }

  private async archiveOldRecords(retentionDays: number) {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    // Mark old worksheets as archived
    const result = await this.prisma.workSheet.updateMany({
      where: {
        date: { lt: cutoffDate },
        status: { not: 'ARCHIVED' }
      },
      data: { status: 'ARCHIVED' }
    });

    this.logger.log(`Archived ${result.count} old worksheets older than ${retentionDays} days`);
    return result;
  }

  /**
   * Manual trigger for monthly backup (for testing or recovery)
   */
  async triggerManualBackup(month: number, year: number, retentionDays: number = 30) {
    this.logger.log(`Manually triggering backup for ${month}/${year}`);
    return await this.createMonthlyBackup(month, year, retentionDays);
  }

  /**
   * Get backup statistics
   */
  async getBackupStatistics() {
    const totalBackups = await this.prisma.workSheetMonthlyBackup.count();
    
    const latestBackup = await this.prisma.workSheetMonthlyBackup.findFirst({
      orderBy: [
        { year: 'desc' },
        { month: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    const backupsByYear = await this.prisma.workSheetMonthlyBackup.groupBy({
      by: ['year'],
      _count: { id: true },
      orderBy: { year: 'desc' }
    });

    return {
      totalBackups,
      latestBackup: latestBackup ? {
        month: latestBackup.month,
        year: latestBackup.year,
        createdAt: latestBackup.createdAt
      } : null,
      backupsByYear: backupsByYear.map(b => ({
        year: b.year,
        count: b._count.id
      }))
    };
  }
}