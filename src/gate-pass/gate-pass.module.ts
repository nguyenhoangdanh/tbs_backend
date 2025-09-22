import { Module } from '@nestjs/common';
import { GatePassService } from './gate-pass.service';
import { GatePassController } from './gate-pass.controller';
import { NotificationModule } from '../notifications/notification.module';
import { PrismaService } from '../common/prisma.service';

@Module({
  imports: [NotificationModule],
  controllers: [GatePassController],
  providers: [GatePassService, PrismaService],
  exports: [GatePassService],
})
export class GatePassModule {}