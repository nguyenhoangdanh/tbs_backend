import { Module, forwardRef } from '@nestjs/common';
import { MobileController } from './mobile.controller';
import { MobileService } from './mobile.service';
import { WorksheetModule } from '../worksheet/worksheet.module';
import { PrismaService } from '../../common/prisma.service';

@Module({
  imports: [forwardRef(() => WorksheetModule)],
  controllers: [MobileController],
  providers: [MobileService, PrismaService],
  exports: [MobileService],
})
export class MobileModule {}