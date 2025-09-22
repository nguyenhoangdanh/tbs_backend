import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReportsService } from './reports.service';
import { getCurrentWorkWeek, getPreviousWorkWeek } from '../common/utils/week-utils';

@Injectable()
export class ReportsCron {
  private readonly logger = new Logger(ReportsCron.name);

  constructor(private readonly reportsService: ReportsService) {}

  // Chạy vào 1h sáng thứ 6 hàng tuần (UTC+7 = 18:00 UTC thứ 5)
  @Cron('0 18 * * 4', {
    name: 'lockPreviousWeekReports',
    timeZone: 'UTC'
  })
  async handleLockPreviousWorkWeekReports() {
    try {
      const { weekNumber, year } = getCurrentWorkWeek();
      const prev = getPreviousWorkWeek(weekNumber, year);
      
      this.logger.log(`🔒 Auto-locking reports for work week ${prev.weekNumber}/${prev.year} (UTC+7: 1:00 AM Friday)`);
      
      const result = await this.reportsService.lockReportsByWeek(prev.weekNumber, prev.year);
      
      this.logger.log(`✅ Successfully locked ${result.count || 0} reports for week ${prev.weekNumber}/${prev.year}`);
    } catch (error) {
      this.logger.error('❌ Failed to auto-lock reports:', error.message);
    }
  }
}
