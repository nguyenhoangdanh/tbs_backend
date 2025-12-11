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
    this.logger.log(`Returned ${result.offices.length} offices`);
    
    // Log first office structure to debug
    if (result.offices.length > 0) {
      const firstOffice = result.offices[0];
      this.logger.debug(`First office: ${firstOffice.name}, Departments: ${firstOffice.departments?.length || 0}`);
      if (firstOffice.departments && firstOffice.departments.length > 0) {
        const firstDept = firstOffice.departments[0];
        this.logger.debug(`First department: ${firstDept.name}, Teams: ${firstDept.teams?.length || 0}`);
        // if (firstDept.teams && firstDept.teams.length > 0) {
        //   const firstTeam = firstLine.teams[0];
        //   this.logger.debug(`First team: ${firstTeam.name}, Groups: ${firstTeam.groups?.length || 0}`);
        // }
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
