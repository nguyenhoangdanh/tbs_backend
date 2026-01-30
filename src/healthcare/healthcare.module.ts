import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { PrismaService } from '../common/prisma.service';

// Medicine management modules
import { HealthcareController } from './healthcare.controller';
import { HealthcareService } from './healthcare.service';

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
  providers: [HealthcareService, InventoryService, PrismaService],
  exports: [HealthcareService, InventoryService],
})
export class HealthcareModule {}