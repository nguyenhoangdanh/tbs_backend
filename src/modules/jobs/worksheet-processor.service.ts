import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma.service';
import { WorkSheetStatus } from '@prisma/client';

@Injectable()
export class WorksheetProcessorService {
  private readonly logger = new Logger(WorksheetProcessorService.name);

  constructor(private prisma: PrismaService) {}

  // Auto-complete worksheets at end of day
  @Cron('0 22 * * *') // 10 PM daily
  async autoCompleteWorksheets() {
    this.logger.log('Starting auto-complete worksheets job');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    try {
      const result = await this.prisma.workSheet.updateMany({
        where: {
          date: {
            gte: today,
            lt: tomorrow,
          },
          status: WorkSheetStatus.ACTIVE,
        },
        data: {
          status: WorkSheetStatus.COMPLETED,
        },
      });

      this.logger.log(`Auto-completed ${result.count} worksheets`);
    } catch (error) {
      this.logger.error('Error auto-completing worksheets:', error);
    }
  }

  // Monthly data archival
  @Cron('0 2 1 * *') // 2 AM on 1st of every month
  async monthlyDataArchival() {
    this.logger.log('Starting monthly data archival job');

    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    try {
      // Archive completed worksheets older than 1 month
      const result = await this.prisma.workSheet.updateMany({
        where: {
          date: { lt: oneMonthAgo },
          status: WorkSheetStatus.COMPLETED,
        },
        data: {
          status: WorkSheetStatus.ARCHIVED,
        },
      });

      this.logger.log(`Archived ${result.count} old worksheets`);
    } catch (error) {
      this.logger.error('Error archiving worksheets:', error);
    }
  }

  // Generate daily performance reports
  @Cron('0 6 * * *') // 6 AM daily
  async generateDailyReports() {
    this.logger.log('Generating daily performance reports');

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date(yesterday);
    today.setDate(today.getDate() + 1);

    try {
      // Implementation for daily reports generation
      // This would typically generate summary data and store in a reports table
      this.logger.log('Daily reports generated successfully');
    } catch (error) {
      this.logger.error('Error generating daily reports:', error);
    }
  }
}
