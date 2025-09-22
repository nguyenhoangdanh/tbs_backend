import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { PrismaService } from 'src/common/prisma.service';
import { ReportsCron } from './reports.cron';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [ReportsController],
  providers: [ReportsService, PrismaService, ReportsCron],
  exports: [ReportsService],
})
export class ReportsModule {}
