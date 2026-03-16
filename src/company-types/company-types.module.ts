import { Module } from '@nestjs/common';
import { CompanyTypesService } from './company-types.service';
import { CompanyTypesController } from './company-types.controller';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [CompanyTypesController],
  providers: [CompanyTypesService, PrismaService],
  exports: [CompanyTypesService],
})
export class CompanyTypesModule {}
