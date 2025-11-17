import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationHierarchyService } from './services/organization-hierarchy.service';

@ApiTags('organization')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('organization')
export class OrganizationController {
  constructor(
    private readonly hierarchyService: OrganizationHierarchyService,
  ) {}

  @Get('structure')
  @ApiOperation({ summary: 'Get complete organization structure' })
  @ApiResponse({
    status: 200,
    description: 'Organization structure retrieved successfully',
  })
  getStructure() {
    return this.hierarchyService.getOrganizationStructure();
  }

  @Get('hierarchy')
  @ApiOperation({ summary: 'Get organization hierarchy for management' })
  @ApiResponse({
    status: 200,
    description: 'Organization hierarchy retrieved successfully',
  })
  getHierarchy() {
    return this.hierarchyService.getOrganizationHierarchy();
  }
}
