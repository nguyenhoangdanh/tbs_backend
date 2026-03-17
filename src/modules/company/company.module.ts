import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CompanyController } from './company.controller';
import { CompanyService } from './company.service';
import { CompanyTypesController } from './company-types.controller';
import { CompanyTypesService } from './company-types.service';
import { BusinessSectorsController } from './business-sectors.controller';
import { BusinessSectorsService } from './business-sectors.service';
import { RegionsController } from './regions.controller';
import { RegionsService } from './regions.service';

@Module({
  controllers: [
    CompanyController,
    CompanyTypesController,
    BusinessSectorsController,
    RegionsController,
  ],
  providers: [
    PrismaService,
    CompanyService,
    CompanyTypesService,
    BusinessSectorsService,
    RegionsService,
  ],
  exports: [CompanyService, CompanyTypesService, BusinessSectorsService, RegionsService],
})
export class CompanyModule {}
