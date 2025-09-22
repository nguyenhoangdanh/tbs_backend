import { Module } from '@nestjs/common';
import { OfficesController } from './offices.controller';
import { OfficesService } from './offices.service';
import { PrismaService } from '../common/prisma.service';
import { EnvironmentConfig } from '../config/config.environment';

@Module({
  controllers: [OfficesController],
  providers: [OfficesService, PrismaService, EnvironmentConfig],
  exports: [OfficesService],
})
export class OfficesModule {}
