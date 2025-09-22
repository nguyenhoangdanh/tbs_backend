import { Module } from '@nestjs/common';
import { LineController } from './line.controller';
import { LineService } from './line.service';
import { PrismaService } from '../../common/prisma.service';

@Module({
  controllers: [LineController],
  providers: [LineService, PrismaService],
  exports: [LineService],
})
export class LineModule {}
