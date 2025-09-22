import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { NotificationService } from './notification.service';
import { NotificationGateway } from './notification.gateway';
import { NotificationController } from './notification.controller';
import { NotificationCleanupService } from './notification-cleanup.service';
import { PrismaService } from 'src/common/prisma.service';
import { EmailService } from 'src/common/email.service';

@Module({
  imports: [
    ConfigModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '1d' },
    }),
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService, 
    NotificationGateway, 
    NotificationCleanupService,
    PrismaService,
    EmailService
  ],
  exports: [NotificationService, NotificationGateway, EmailService],
})
export class NotificationModule {}