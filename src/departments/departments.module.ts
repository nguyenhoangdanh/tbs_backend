import { Module } from '@nestjs/common';
import { DepartmentsController } from './departments.controller';
import { DepartmentsService } from './departments.service';
import { PrismaService } from '../common/prisma.service';
import { EnvironmentConfig } from '../config/config.environment';

@Module({
  controllers: [DepartmentsController],
  providers: [DepartmentsService, PrismaService, EnvironmentConfig],
  exports: [DepartmentsService],
})
export class DepartmentsModule {}
