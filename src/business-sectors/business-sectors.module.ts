import { Module } from '@nestjs/common';
import { BusinessSectorsService } from './business-sectors.service';
import { BusinessSectorsController } from './business-sectors.controller';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [BusinessSectorsController],
  providers: [BusinessSectorsService, PrismaService],
  exports: [BusinessSectorsService],
})
export class BusinessSectorsModule {}
