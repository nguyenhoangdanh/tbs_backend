import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { DatabaseModule } from '../common/database/database.module';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [DatabaseModule, NotificationModule],
  controllers: [HealthController],
})
export class HealthModule {}
