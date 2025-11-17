import { Controller, Get, UseGuards, Logger } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ProductionHierarchyService } from './services/production-hierarchy.service';

@ApiTags('production')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('production')
export class ProductionController {
  private readonly logger = new Logger(ProductionController.name);

  constructor(
    private readonly hierarchyService: ProductionHierarchyService,
  ) {}

  @Get('structure')
  @ApiOperation({ summary: 'Get complete production structure' })
  @ApiResponse({
    status: 200,
    description: 'Production structure retrieved successfully',
  })
  async getStructure() {
    this.logger.log('Fetching production structure...');
    const result = await this.hierarchyService.getProductionStructure();
    this.logger.log(`Returned ${result.factories.length} factories`);
    
    // Log first factory structure to debug
    if (result.factories.length > 0) {
      const firstFactory = result.factories[0];
      this.logger.debug(`First factory: ${firstFactory.name}, Lines: ${firstFactory.lines?.length || 0}`);
      if (firstFactory.lines && firstFactory.lines.length > 0) {
        const firstLine = firstFactory.lines[0];
        this.logger.debug(`First line: ${firstLine.name}, Teams: ${firstLine.teams?.length || 0}`);
        if (firstLine.teams && firstLine.teams.length > 0) {
          const firstTeam = firstLine.teams[0];
          this.logger.debug(`First team: ${firstTeam.name}, Groups: ${firstTeam.groups?.length || 0}`);
        }
      }
    }
    
    return result;
  }

  @Get('hierarchy')
  @ApiOperation({ summary: 'Get production hierarchy tree' })
  @ApiResponse({
    status: 200,
    description: 'Production hierarchy retrieved successfully',
  })
  getHierarchy() {
    return this.hierarchyService.getProductionHierarchy();
  }
}
