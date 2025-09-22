import { Module } from '@nestjs/common';
import { HierarchyReportsController } from './hierarchy-reports.controller';
import { HierarchyReportsService } from './hierarchy-reports.service';
import { HierarchyCalculationHelper } from './helpers/hierarchy-calculation.helper';
import { PrismaService } from 'src/common/prisma.service';

@Module({
  controllers: [HierarchyReportsController],
  providers: [
    HierarchyReportsService,
    HierarchyCalculationHelper,
    PrismaService
  ],
  exports: [HierarchyReportsService, HierarchyCalculationHelper],
})
export class HierarchyReportsModule {}
