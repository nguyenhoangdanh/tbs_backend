import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EnvironmentConfig } from '../../config/config.environment';
import { CommonModule } from '../../common/common.module';

// Services
import { FactoryService } from './services/factory.service';
import { LineService } from './services/line.service';
import { TeamService } from './services/team.service';
import { GroupService } from './services/group.service';
import { ProductionHierarchyService } from './services/production-hierarchy.service';
// Controllers
import { FactoryController } from './controllers/factory.controller';
import { LineController } from './controllers/line.controller';
import { TeamController } from './controllers/team.controller';
import { GroupController } from './controllers/group.controller';
import { ProductionController } from './production.controller';

@Module({
  imports: [CommonModule],
  controllers: [
    ProductionController,
    FactoryController,
    LineController,
    TeamController,
    GroupController,
  ],
  providers: [
    PrismaService,
    EnvironmentConfig,
    FactoryService,
    LineService,
    TeamService,
    GroupService,
    ProductionHierarchyService,
  ],
  exports: [
    FactoryService,
    LineService,
    TeamService,
    GroupService,
    ProductionHierarchyService,
  ],
})
export class ProductionModule {}
