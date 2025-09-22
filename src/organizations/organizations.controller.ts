import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Put
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { OrganizationsService } from './organizations.service';

@ApiTags('organizations')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  // Office Management
  @Get('offices')
  @ApiOperation({ summary: 'Get all offices' })
  @ApiResponse({ status: 200, description: 'Offices retrieved successfully' })
  findAllOffices() {
    return this.organizationsService.findAllOffices();
  }

  @Get('offices/:id')
  @ApiOperation({ summary: 'Get office by ID' })
  @ApiResponse({ status: 200, description: 'Office retrieved successfully' })
  findOfficeById(@Param('id') id: string) {
    return this.organizationsService.findOfficeById(id);
  }

  @Get('offices/:id/departments')
  @ApiOperation({ summary: 'Get departments of an office' })
  @ApiResponse({ status: 200, description: 'Departments retrieved successfully' })
  getOfficeDepartments(@Param('id') id: string) {
    return this.organizationsService.getOfficeDepartments(id);
  }

  // Department Management
  @Get('departments')
  @ApiOperation({ summary: 'Get all departments' })
  @ApiResponse({ status: 200, description: 'Departments retrieved successfully' })
  findAllDepartments() {
    return this.organizationsService.findAllDepartments();
  }

  @Get('departments/:id')
  @ApiOperation({ summary: 'Get department by ID' })
  @ApiResponse({ status: 200, description: 'Department retrieved successfully' })
  findDepartmentById(@Param('id') id: string) {
    return this.organizationsService.findDepartmentById(id);
  }

  @Get('departments/:id/job-positions')
  @ApiOperation({ summary: 'Get job positions of a department' })
  @ApiResponse({ status: 200, description: 'Job positions retrieved successfully' })
  getDepartmentJobPositions(@Param('id') id: string) {
    return this.organizationsService.getDepartmentJobPositions(id);
  }

  // Position Management
  @Get('positions')
  @ApiOperation({ summary: 'Get all positions' })
  @ApiResponse({ status: 200, description: 'Positions retrieved successfully' })
  findAllPositions() {
    return this.organizationsService.findAllPositions();
  }

  @Get('positions/:id')
  @ApiOperation({ summary: 'Get position by ID' })
  @ApiResponse({ status: 200, description: 'Position retrieved successfully' })
  findPositionById(@Param('id') id: string) {
    return this.organizationsService.findPositionById(id);
  }

  // Job Position Management
  @Get('job-positions')
  @ApiOperation({ summary: 'Get all job positions' })
  @ApiResponse({ status: 200, description: 'Job positions retrieved successfully' })
  findAllJobPositions() {
    return this.organizationsService.findAllJobPositions();
  }

  @Get('job-positions/:id')
  @ApiOperation({ summary: 'Get job position by ID' })
  @ApiResponse({ status: 200, description: 'Job position retrieved successfully' })
  findJobPositionById(@Param('id') id: string) {
    return this.organizationsService.findJobPositionById(id);
  }

  // Organization Structure
  @Get('structure')
  @ApiOperation({ summary: 'Get complete organization structure' })
  @ApiResponse({ status: 200, description: 'Organization structure retrieved successfully' })
  getOrganizationStructure() {
    return this.organizationsService.getOrganizationStructure();
  }

  @Get('hierarchy')
  @ApiOperation({ summary: 'Get organization hierarchy for management' })
  @ApiResponse({ status: 200, description: 'Organization hierarchy retrieved successfully' })
  getOrganizationHierarchy() {
    return this.organizationsService.getOrganizationHierarchy();
  }
}
