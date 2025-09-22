import { Module } from '@nestjs/common';
import { JobPositionsController } from './job-positions.controller';
import { JobPositionsService } from './job-positions.service';
import { PrismaService } from '../common/prisma.service';
import { EnvironmentConfig } from '../config/config.environment';

@Module({
  controllers: [JobPositionsController],
  providers: [JobPositionsService, PrismaService, EnvironmentConfig],
  exports: [JobPositionsService],
})
export class JobPositionsModule {}
