import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { PrismaService } from '../common/prisma.service';
import { GoogleDriveService } from '../common/google-drive.service';

// Medicine management modules
import { HealthcareController } from './healthcare.controller';
import { HealthcareService } from './healthcare.service';
import { HealthcareCron } from './healthcare.cron';

// Inventory management modules
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [
    MulterModule.register({
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
    }),
  ],
  controllers: [HealthcareController, InventoryController],
  providers: [HealthcareService, InventoryService, PrismaService, GoogleDriveService, HealthcareCron],
  exports: [HealthcareService, InventoryService],
})
export class HealthcareModule {}