import {
  Controller,
  Get,
  UseGuards,
  Query,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiQuery, ApiParam } from '@nestjs/swagger';
import { HierarchyReportsService } from './hierarchy-reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { GetUser } from '../common/decorators/get-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('hierarchy-reports')
@Controller('hierarchy-reports')
@UseGuards(JwtAuthGuard)
export class HierarchyReportsController {
  constructor(private readonly hierarchyReportsService: HierarchyReportsService) {}

  @Get('my-view')
  @ApiOperation({ summary: 'Get hierarchy view based on user role and permissions' })
  @ApiResponse({ status: 200, description: 'Hierarchy view retrieved successfully' })
  @ApiQuery({ name: 'weekNumber', required: false, description: 'Week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Year' })
  @ApiQuery({ name: 'month', required: false, description: 'Month' })
  @HttpCode(HttpStatus.OK)
  async getMyHierarchyView(
    @GetUser() user: any,
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const filters: any = {};

    if (weekNumber) {
      const parsedWeekNumber = parseInt(weekNumber, 10);
      if (!isNaN(parsedWeekNumber) && parsedWeekNumber >= 1 && parsedWeekNumber <= 53) {
        filters.weekNumber = parsedWeekNumber;
      }
    }

    if (year) {
      const parsedYear = parseInt(year, 10);
      if (!isNaN(parsedYear) && parsedYear >= 2020 && parsedYear <= 2030) {
        filters.year = parsedYear;
      }
    }

    if (month) {
      const parsedMonth = parseInt(month, 10);
      if (!isNaN(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12) {
        filters.month = parsedMonth;
      }
    }

    const result = await this.hierarchyReportsService.getMyHierarchyView(user.id, user.role, filters);
    
    return result;
  }

  @Get('offices-overview')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Get offices overview (Admin/Superadmin only)' })
  @ApiResponse({ status: 200, description: 'Offices overview retrieved successfully' })
  @ApiQuery({ name: 'weekNumber', required: false, description: 'Week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Year' })
  @HttpCode(HttpStatus.OK)
  async getOfficesOverview(
    @GetUser() user: any,
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
  ) {
    const filters: any = {};

    if (weekNumber) {
      const parsedWeekNumber = parseInt(weekNumber, 10);
      if (!isNaN(parsedWeekNumber) && parsedWeekNumber >= 1 && parsedWeekNumber <= 53) {
        filters.weekNumber = parsedWeekNumber;
      }
    }

    if (year) {
      const parsedYear = parseInt(year, 10);
      if (!isNaN(parsedYear) && parsedYear >= 2020 && parsedYear <= 2030) {
        filters.year = parsedYear;
      }
    }

    return this.hierarchyReportsService.getOfficesOverview(user.id, filters);
  }

  @Get('position/:positionId')
  @ApiOperation({ summary: 'Get position details' })
  @ApiResponse({ status: 200, description: 'Position details retrieved successfully' })
  @ApiParam({ name: 'positionId', description: 'Position ID' })
  @ApiQuery({ name: 'weekNumber', required: false, description: 'Week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Year' })
  @HttpCode(HttpStatus.OK)
  async getPositionDetails(
    @GetUser() user: any,
    @Param('positionId') positionId: string,
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
  ) {
    const filters: any = {};

    if (weekNumber) {
      const parsedWeekNumber = parseInt(weekNumber, 10);
      if (!isNaN(parsedWeekNumber) && parsedWeekNumber >= 1 && parsedWeekNumber <= 53) {
        filters.weekNumber = parsedWeekNumber;
      }
    }

    if (year) {
      const parsedYear = parseInt(year, 10);
      if (!isNaN(parsedYear) && parsedYear >= 2020 && parsedYear <= 2030) {
        filters.year = parsedYear;
      }
    }

    return this.hierarchyReportsService.getPositionDetails(user.id, user.role, positionId, filters);
  }

  @Get('position-users/:positionId')
  @ApiOperation({ summary: 'Get position users list' })
  @ApiResponse({ status: 200, description: 'Position users list retrieved successfully' })
  @ApiParam({ name: 'positionId', description: 'Position ID' })
  @ApiQuery({ name: 'weekNumber', required: false, description: 'Week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Year' })
  @HttpCode(HttpStatus.OK)
  async getPositionUsers(
    @GetUser() user: any,
    @Param('positionId') positionId: string,
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
  ) {
    const filters: any = {};

    if (weekNumber) {
      const parsedWeekNumber = parseInt(weekNumber, 10);
      if (!isNaN(parsedWeekNumber) && parsedWeekNumber >= 1 && parsedWeekNumber <= 53) {
        filters.weekNumber = parsedWeekNumber;
      }
    }

    if (year) {
      const parsedYear = parseInt(year, 10);
      if (!isNaN(parsedYear) && parsedYear >= 2020 && parsedYear <= 2030) {
        filters.year = parsedYear;
      }
    }

    return this.hierarchyReportsService.getPositionUsers(user.id, user.role, positionId, filters);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get user details' })
  @ApiResponse({ status: 200, description: 'User details retrieved successfully' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiQuery({ name: 'weekNumber', required: false, description: 'Week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Year' })
  @ApiQuery({ name: 'limit', required: false, description: 'Limit number of reports' })
  @HttpCode(HttpStatus.OK)
  async getUserDetails(
    @GetUser() user: any,
    @Param('userId') userId: string,
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
    @Query('limit') limit?: string,
  ) {
    const filters: any = {};

    if (weekNumber) {
      const parsedWeekNumber = parseInt(weekNumber, 10);
      if (!isNaN(parsedWeekNumber) && parsedWeekNumber >= 1 && parsedWeekNumber <= 53) {
        filters.weekNumber = parsedWeekNumber;
      }
    }

    if (year) {
      const parsedYear = parseInt(year, 10);
      if (!isNaN(parsedYear) && parsedYear >= 2020 && parsedYear <= 2030) {
        filters.year = parsedYear;
      }
    }

    if (limit) {
      const parsedLimit = parseInt(limit, 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0 && parsedLimit <= 100) {
        filters.limit = parsedLimit;
      }
    }

    return this.hierarchyReportsService.getUserDetails(user.id, user.role, userId, filters);
  }

  @Get('employees-without-reports')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Get employees without reports' })
  @ApiResponse({ status: 200, description: 'Employees without reports retrieved successfully' })
  @ApiQuery({ name: 'weekNumber', required: false, description: 'Week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Year' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @HttpCode(HttpStatus.OK)
  async getEmployeesWithoutReports(
    @GetUser() user: any,
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const filters: any = {};

    if (weekNumber) {
      const parsedWeekNumber = parseInt(weekNumber, 10);
      if (!isNaN(parsedWeekNumber) && parsedWeekNumber >= 1 && parsedWeekNumber <= 53) {
        filters.weekNumber = parsedWeekNumber;
      }
    }

    if (year) {
      const parsedYear = parseInt(year, 10);
      if (!isNaN(parsedYear) && parsedYear >= 2020 && parsedYear <= 2030) {
        filters.year = parsedYear;
      }
    }

    if (page) {
      const parsedPage = parseInt(page, 10);
      if (!isNaN(parsedPage) && parsedPage > 0) {
        filters.page = parsedPage;
      }
    }

    if (limit) {
      const parsedLimit = parseInt(limit, 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0 && parsedLimit <= 100) {
        filters.limit = parsedLimit;
      }
    }

    return this.hierarchyReportsService.getEmployeesWithoutReports(user.id, user.role, filters);
  }

  @Get('employees-incomplete-reports')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Get employees with incomplete reports' })
  @ApiResponse({ status: 200, description: 'Employees with incomplete reports retrieved successfully' })
  @ApiQuery({ name: 'weekNumber', required: false, description: 'Week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Year' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @HttpCode(HttpStatus.OK)
  async getEmployeesWithIncompleteReports(
    @GetUser() user: any,
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const filters: any = {};

    if (weekNumber) {
      const parsedWeekNumber = parseInt(weekNumber, 10);
      if (!isNaN(parsedWeekNumber) && parsedWeekNumber >= 1 && parsedWeekNumber <= 53) {
        filters.weekNumber = parsedWeekNumber;
      }
    }

    if (year) {
      const parsedYear = parseInt(year, 10);
      if (!isNaN(parsedYear) && parsedYear >= 2020 && parsedYear <= 2030) {
        filters.year = parsedYear;
      }
    }

    if (page) {
      const parsedPage = parseInt(page, 10);
      if (!isNaN(parsedPage) && parsedPage > 0) {
        filters.page = parsedPage;
      }
    }

    if (limit) {
      const parsedLimit = parseInt(limit, 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0 && parsedLimit <= 100) {
        filters.limit = parsedLimit;
      }
    }

    return this.hierarchyReportsService.getEmployeesWithIncompleteReports(user.id, user.role, filters);
  }

  @Get('employees-reporting-status')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Get employees reporting status' })
  @ApiResponse({ status: 200, description: 'Employees reporting status retrieved successfully' })
  @ApiQuery({ name: 'weekNumber', required: false, description: 'Week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Year' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'status', required: false, description: 'Status filter' })
  @HttpCode(HttpStatus.OK)
  async getEmployeesReportingStatus(
    @GetUser() user: any,
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    const filters: any = {};

    if (weekNumber) {
      const parsedWeekNumber = parseInt(weekNumber, 10);
      if (!isNaN(parsedWeekNumber) && parsedWeekNumber >= 1 && parsedWeekNumber <= 53) {
        filters.weekNumber = parsedWeekNumber;
      }
    }

    if (year) {
      const parsedYear = parseInt(year, 10);
      if (!isNaN(parsedYear) && parsedYear >= 2020 && parsedYear <= 2030) {
        filters.year = parsedYear;
      }
    }

    if (page) {
      const parsedPage = parseInt(page, 10);
      if (!isNaN(parsedPage) && parsedPage > 0) {
        filters.page = parsedPage;
      }
    }

    if (limit) {
      const parsedLimit = parseInt(limit, 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0 && parsedLimit <= 100) {
        filters.limit = parsedLimit;
      }
    }

    if (status && ['not_submitted', 'incomplete', 'completed', 'all'].includes(status)) {
      filters.status = status;
    }

    return this.hierarchyReportsService.getEmployeesReportingStatus(user.id, user.role, filters);
  }

  @Get('task-completion-trends')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Get task completion trends' })
  @ApiResponse({ status: 200, description: 'Task completion trends retrieved successfully' })
  @ApiQuery({ name: 'officeId', required: false, description: 'Office ID' })
  @ApiQuery({ name: 'departmentId', required: false, description: 'Department ID' })
  @ApiQuery({ name: 'weeks', required: false, description: 'Number of weeks' })
  @HttpCode(HttpStatus.OK)
  async getTaskCompletionTrends(
    @GetUser() user: any,
    @Query('officeId') officeId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('weeks') weeks?: string,
  ) {
    const filters: any = {};

    if (officeId) {
      filters.officeId = officeId;
    }

    if (departmentId) {
      filters.departmentId = departmentId;
    }

    if (weeks) {
      const parsedWeeks = parseInt(weeks, 10);
      if (!isNaN(parsedWeeks) && parsedWeeks > 0 && parsedWeeks <= 52) {
        filters.weeks = parsedWeeks;
      }
    }

    return this.hierarchyReportsService.getTaskCompletionTrends(user.id, user.role, filters);
  }

  @Get('incomplete-reasons-hierarchy')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Get incomplete reasons hierarchy analysis' })
  @ApiResponse({ status: 200, description: 'Incomplete reasons hierarchy analysis retrieved successfully' })
  @ApiQuery({ name: 'weekNumber', required: false, description: 'Week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Year' })
  @HttpCode(HttpStatus.OK)
  async getIncompleteReasonsHierarchy(
    @GetUser() user: any,
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
  ) {
    const filters: any = {};

    if (weekNumber) {
      const parsedWeekNumber = parseInt(weekNumber, 10);
      if (!isNaN(parsedWeekNumber) && parsedWeekNumber >= 1 && parsedWeekNumber <= 53) {
        filters.weekNumber = parsedWeekNumber;
      }
    }

    if (year) {
      const parsedYear = parseInt(year, 10);
      if (!isNaN(parsedYear) && parsedYear >= 2020 && parsedYear <= 2030) {
        filters.year = parsedYear;
      }
    }

    return this.hierarchyReportsService.getIncompleteReasonsHierarchy(user.id, user.role, filters);
  }

  /**
   * Get manager reports - for managers to view reports of their subordinates
   */
  @Get('manager-reports')
  @ApiOperation({ summary: 'Get manager reports - for managers to view reports of their subordinates' })
  @ApiResponse({ status: 200, description: 'Manager reports retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - User does not have management permissions' })
  @ApiQuery({ name: 'weekNumber', required: false, description: 'Week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Year' })
  @HttpCode(HttpStatus.OK)
  async getManagerReports(
    @GetUser() user: any,
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
  ) {
    const filters: any = {};

    if (weekNumber) {
      const parsedWeekNumber = parseInt(weekNumber, 10);
      if (!isNaN(parsedWeekNumber) && parsedWeekNumber >= 1 && parsedWeekNumber <= 53) {
        filters.weekNumber = parsedWeekNumber;
      }
    }

    if (year) {
      const parsedYear = parseInt(year, 10);
      if (!isNaN(parsedYear) && parsedYear >= 2020 && parsedYear <= 2030) {
        filters.year = parsedYear;
      }
    }

    return this.hierarchyReportsService.getManagerReports(user.id, user.role, filters);
  }

  /**
   * Get specific report details for admin view
   */
  @Get('user/:userId/report/:reportId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Get specific report details for admin view' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiParam({ name: 'reportId', description: 'Report ID' })
  async getReportDetailsForAdmin(
    @Param('userId') userId: string,
    @Param('reportId') reportId: string,
    @GetUser() currentUser: any,
  ) {
    return this.hierarchyReportsService.getReportDetailsForAdmin(userId, reportId, currentUser);
  }
}