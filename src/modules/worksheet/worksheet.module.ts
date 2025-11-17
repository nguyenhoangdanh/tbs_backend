import { Module } from '@nestjs/common';
import { WorksheetController } from './worksheet.controller';
import { WorksheetService } from './worksheet.service';
import { WorksheetGateway } from './worksheet.gateway';
import { PrismaService } from '../../common/prisma.service';

@Module({
  controllers: [WorksheetController],
  providers: [WorksheetService, WorksheetGateway, PrismaService],
  exports: [WorksheetService, WorksheetGateway],
})
export class WorksheetModule {}
