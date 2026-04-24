import { Module } from '@nestjs/common';
import { WorksheetController } from './worksheet.controller';
import { WorksheetService } from './worksheet.service';
import { WorksheetGateway } from './worksheet.gateway';

@Module({
  controllers: [WorksheetController],
  providers: [WorksheetService, WorksheetGateway],
  exports: [WorksheetService, WorksheetGateway],
})
export class WorksheetModule {}
