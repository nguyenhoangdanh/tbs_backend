import { Module } from '@nestjs/common';
import { PositionsController } from './positions.controller';
import { PositionsService } from './positions.service';
import { PrismaService } from '../common/prisma.service';
import { EnvironmentConfig } from '../config/config.environment';

@Module({
  controllers: [PositionsController],
  providers: [PositionsService, PrismaService, EnvironmentConfig],
  exports: [PositionsService],
})
export class PositionsModule {}
