import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { SafeNotificationGateway } from './safe-notification.gateway';
import { PrismaService } from 'src/common/prisma.service';

@Module({
  providers: [
    NotificationService, 
    SafeNotificationGateway, 
    PrismaService
  ],
  exports: [NotificationService, SafeNotificationGateway],
})
export class SafeNotificationModule {}