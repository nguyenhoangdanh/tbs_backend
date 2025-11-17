import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EnvironmentConfig } from '../../config/config.environment';

// Services
import { OfficeService } from './services/office.service';
import { DepartmentService } from './services/department.service';
import { PositionService } from './services/position.service';
import { JobPositionService } from './services/job-position.service';
import { OrganizationHierarchyService } from './services/organization-hierarchy.service';

// Controllers
import { OfficeController } from './controllers/office.controller';
import { DepartmentController } from './controllers/department.controller';
import { PositionController } from './controllers/position.controller';
import { JobPositionController } from './controllers/job-position.controller';
import { OrganizationController } from './organization.controller';

@Module({
  controllers: [
    OrganizationController,
    OfficeController,
    DepartmentController,
    PositionController,
    JobPositionController,
  ],
  providers: [
    PrismaService,
    EnvironmentConfig,
    OfficeService,
    DepartmentService,
    PositionService,
    JobPositionService,
    OrganizationHierarchyService,
  ],
  exports: [
    OfficeService,
    DepartmentService,
    PositionService,
    JobPositionService,
    OrganizationHierarchyService,
  ],
})
export class OrganizationModule {}
