import { Module } from '@nestjs/common';
import { WorksheetController } from './worksheet.controller';
import { WorksheetService } from './worksheet.service';
import { WorksheetBackupService } from './worksheet-backup.service';
import { PrismaService } from '../../common/prisma.service';

@Module({
  controllers: [WorksheetController],
  providers: [WorksheetService, WorksheetBackupService, PrismaService],
  exports: [WorksheetService, WorksheetBackupService],
})
export class WorksheetModule {}
