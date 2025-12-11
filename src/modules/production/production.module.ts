import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EnvironmentConfig } from '../../config/config.environment';
import { CommonModule } from '../../common/common.module';

// Services
import { TeamService } from './services/team.service';
import { GroupService } from './services/group.service';
import { ProductionHierarchyService } from './services/production-hierarchy.service';
// Controllers
import { TeamController } from './controllers/team.controller';
import { GroupController } from './controllers/group.controller';
import { ProductionController } from './production.controller';

@Module({
  imports: [CommonModule],
  controllers: [
    ProductionController,
    TeamController,
    GroupController,
  ],
  providers: [
    PrismaService,
    EnvironmentConfig,
    TeamService,
    GroupService,
    ProductionHierarchyService,
  ],
  exports: [
    TeamService,
    GroupService,
    ProductionHierarchyService,
  ],
})
export class ProductionModule {}
