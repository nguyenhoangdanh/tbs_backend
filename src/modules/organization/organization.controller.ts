import { Controller, Get, Post, Put, Delete, Query, Param, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { OrganizationHierarchyService } from './services/organization-hierarchy.service';

@ApiTags('organization')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequirePermissions('organizations:view')
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

  @Get('management-tree')
  @ApiOperation({ summary: 'Get management hierarchy tree (company→office→dept→managers)' })
  getManagementTree(@Query('companyId') companyId?: string) {
    return this.hierarchyService.getManagementTree(companyId);
  }

  @Get('departments/:id/managers')
  @ApiOperation({ summary: 'Get all managers of a department' })
  getDepartmentManagers(@Param('id') id: string) {
    return this.hierarchyService.getDepartmentManagers(id);
  }

  @Put('departments/:id/managers/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign a user as manager of a department' })
  assignManager(@Param('id') id: string, @Param('userId') userId: string) {
    return this.hierarchyService.assignManager(id, userId);
  }

  @Delete('departments/:id/managers/:userId')
  @ApiOperation({ summary: 'Remove a user from department managers' })
  removeManager(@Param('id') id: string, @Param('userId') userId: string) {
    return this.hierarchyService.removeManager(id, userId);
  }

  @Get('users/:userId/managed-departments')
  @ApiOperation({ summary: 'Get all departments managed by a user' })
  getManagedDepartments(@Param('userId') userId: string) {
    return this.hierarchyService.getManagedDepartments(userId);
  }
}
