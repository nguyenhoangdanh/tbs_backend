import { Module } from '@nestjs/common';
import { TaskEvaluationsController } from './task-evaluations.controller';
import { TaskEvaluationsService } from './task-evaluations.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [TaskEvaluationsController],
  providers: [TaskEvaluationsService, PrismaService],
  exports: [TaskEvaluationsService],
})
export class TaskEvaluationsModule {}