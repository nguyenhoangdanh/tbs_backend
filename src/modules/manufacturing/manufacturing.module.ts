import { Module } from '@nestjs/common';
import { ManufacturingController } from './manufacturing.controller';
import { ManufacturingService } from './manufacturing.service';
import { PrismaService } from '../../common/prisma.service';

@Module({
  controllers: [ManufacturingController],
  providers: [ManufacturingService, PrismaService],
  exports: [ManufacturingService],
})
export class ManufacturingModule {}
