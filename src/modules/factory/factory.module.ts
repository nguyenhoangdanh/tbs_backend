import { Module } from '@nestjs/common';
import { FactoryController } from './factory.controller';
import { FactoryService } from './factory.service';
import { PrismaService } from '../../common/prisma.service';

@Module({
  controllers: [FactoryController],
  providers: [FactoryService, PrismaService],
  exports: [FactoryService],
})
export class FactoryModule {}
