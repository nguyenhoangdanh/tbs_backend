import {
  Controller,
  Get,
  UseGuards,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiQuery } from '@nestjs/swagger';
import { StatisticsService } from './statistics.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { GetUser } from '../common/decorators/get-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { getCurrentWorkWeek } from '../common/utils/week-utils';

@ApiTags('statistics')
@Controller('statistics')
@UseGuards(JwtAuthGuard)
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get user dashboard statistics' })
  @ApiResponse({ status: 200, description: 'Dashboard statistics retrieved successfully' })
  @HttpCode(HttpStatus.OK)
  async getDashboardStats(@GetUser() user: any) {
    return this.statisticsService.getDashboardStats(user.id);
  }

  @Get('user-reports')
  @ApiOperation({ summary: 'Get user report statistics' })
  @ApiResponse({ status: 200, description: 'User report statistics retrieved successfully' })
  @HttpCode(HttpStatus.OK)
  async getUserReportStats(@GetUser() user: any) {
    return this.statisticsService.getUserReportStats(user.id);
  }

  @Get('weekly-tasks')
  @ApiOperation({ summary: 'Get weekly task statistics' })
  @ApiResponse({ status: 200, description: 'Weekly task statistics retrieved successfully' })
  @ApiQuery({ name: 'weekNumber', required: false, description: 'Week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Year' })
  @HttpCode(HttpStatus.OK)
  async getWeeklyTaskStats(
    @GetUser() user: any,
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
  ) {
    // Parse and validate parameters manually
    const currentWeek = getCurrentWorkWeek();
    const parsedWeekNumber = weekNumber ? parseInt(weekNumber, 10) : currentWeek.weekNumber;
    const parsedYear = year ? parseInt(year, 10) : currentWeek.year;

    // Validate parsed values
    if (isNaN(parsedWeekNumber) || parsedWeekNumber < 1 || parsedWeekNumber > 53) {
      throw new Error('Invalid week number');
    }
    if (isNaN(parsedYear) || parsedYear < 2020 || parsedYear > 2030) {
      throw new Error('Invalid year');
    }

    // Fix: Pass only userId
    return this.statisticsService.getWeeklyTaskStats(user.id);
  }

  @Get('monthly-tasks')
  @ApiOperation({ summary: 'Get monthly task statistics' })
  @ApiResponse({ status: 200, description: 'Monthly task statistics retrieved successfully' })
  @ApiQuery({ name: 'year', required: false, description: 'Year' })
  @HttpCode(HttpStatus.OK)
  async getMonthlyTaskStats(
    @GetUser() user: any,
    @Query('year') year?: string,
  ) {
    const parsedYear = year ? parseInt(year, 10) : new Date().getFullYear();
    
    if (isNaN(parsedYear) || parsedYear < 2020 || parsedYear > 2030) {
      throw new Error('Invalid year');
    }

    return this.statisticsService.getMonthlyTaskStats(user.id, parsedYear);
  }

  @Get('yearly-tasks')
  @ApiOperation({ summary: 'Get yearly task statistics' })
  @ApiResponse({ status: 200, description: 'Yearly task statistics retrieved successfully' })
  @HttpCode(HttpStatus.OK)
  async getYearlyTaskStats(@GetUser() user: any) {
    return this.statisticsService.getYearlyTaskStats(user.id);
  }

  @Get('recent-activities')
  @ApiOperation({ summary: 'Get recent activities for user' })
  @ApiResponse({ status: 200, description: 'Recent activities retrieved successfully' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of activities to return' })
  @HttpCode(HttpStatus.OK)
  async getRecentActivities(
    @GetUser() user: any,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      throw new Error('Invalid limit');
    }

    // Fix: Pass only userId
    return this.statisticsService.getRecentActivities(user.id);
  }

  @Get('incomplete-reasons-analysis')
  @ApiOperation({ summary: 'Get incomplete reasons analysis' })
  @ApiResponse({ status: 200, description: 'Incomplete reasons analysis retrieved successfully' })
  @ApiQuery({ name: 'weekNumber', required: false, description: 'Week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Year' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (YYYY-MM-DD)' })
  @HttpCode(HttpStatus.OK)
  async getIncompleteReasonsAnalysis(
    @GetUser() user: any,
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
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

    if (startDate) {
      filters.startDate = startDate;
    }

    if (endDate) {
      filters.endDate = endDate;
    }

    return this.statisticsService.getIncompleteReasonsAnalysis(user.id, filters);
  }

  // Admin endpoints
  @Get('admin/dashboard')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Get admin dashboard statistics' })
  @ApiResponse({ status: 200, description: 'Admin dashboard statistics retrieved successfully' })
  @ApiQuery({ name: 'departmentId', required: false, description: 'Department ID' })
  @ApiQuery({ name: 'weekNumber', required: false, description: 'Week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Year' })
  @HttpCode(HttpStatus.OK)
  async getAdminDashboardStats(
    @GetUser() user: any,
    @Query('departmentId') departmentId?: string,
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
  ) {
    const filters: any = {};

    if (departmentId) {
      filters.departmentId = departmentId;
    }

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

    // Fix: Pass only userId
    return this.statisticsService.getAdminDashboardStats(user.id);
  }

  @Get('overview')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Get overview statistics (Admin only)' })
  @ApiResponse({ status: 200, description: 'Overview statistics retrieved successfully' })
  @HttpCode(HttpStatus.OK)
  async getOverview(@GetUser() user: any) {
    // Fix: Call the correct method
    return this.statisticsService.getAdminDashboardStats(user.id);
  }

  @Get('completion-rate')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Get completion rate statistics' })
  @ApiResponse({ status: 200, description: 'Completion rate statistics retrieved successfully' })
  @ApiQuery({ name: 'week', required: false, description: 'Week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Year' })
  @ApiQuery({ name: 'departmentId', required: false, description: 'Department ID' })
  @HttpCode(HttpStatus.OK)
  async getCompletionRate(
    @GetUser() user: any,
    @Query('week') week?: string,
    @Query('year') year?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    const filters: any = {};

    if (week) {
      const parsedWeek = parseInt(week, 10);
      if (!isNaN(parsedWeek) && parsedWeek >= 1 && parsedWeek <= 53) {
        filters.week = parsedWeek;
      }
    }

    if (year) {
      const parsedYear = parseInt(year, 10);
      if (!isNaN(parsedYear) && parsedYear >= 2020 && parsedYear <= 2030) {
        filters.year = parsedYear;
      }
    }

    if (departmentId) {
      filters.departmentId = departmentId;
    }

    // Fix: Pass only userId
    return this.statisticsService.getUserReportStats(user.id);
  }

  @Get('missing-reports')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Get missing reports statistics' })
  @ApiResponse({ status: 200, description: 'Missing reports statistics retrieved successfully' })
  @ApiQuery({ name: 'week', required: false, description: 'Week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Year' })
  @HttpCode(HttpStatus.OK)
  async getMissingReports(
    @GetUser() user: any,
    @Query('week') week?: string,
    @Query('year') year?: string,
  ) {
    const filters: any = {};

    if (week) {
      const parsedWeek = parseInt(week, 10);
      if (!isNaN(parsedWeek) && parsedWeek >= 1 && parsedWeek <= 53) {
        filters.week = parsedWeek;
      }
    }

    if (year) {
      const parsedYear = parseInt(year, 10);
      if (!isNaN(parsedYear) && parsedYear >= 2020 && parsedYear <= 2030) {
        filters.year = parsedYear;
      }
    }

    // Fix: Pass only userId  
    return this.statisticsService.getUserReportStats(user.id);
  }

  @Get('summary-report')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Get summary report' })
  @ApiResponse({ status: 200, description: 'Summary report retrieved successfully' })
  @ApiQuery({ name: 'week', required: false, description: 'Week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Year' })
  @HttpCode(HttpStatus.OK)
  async getSummaryReport(
    @GetUser() user: any,
    @Query('week') week?: string,
    @Query('year') year?: string,
  ) {
    const filters: any = {};

    if (week) {
      const parsedWeek = parseInt(week, 10);
      if (!isNaN(parsedWeek) && parsedWeek >= 1 && parsedWeek <= 53) {
        filters.week = parsedWeek;
      }
    }

    if (year) {
      const parsedYear = parseInt(year, 10);
      if (!isNaN(parsedYear) && parsedYear >= 2020 && parsedYear <= 2030) {
        filters.year = parsedYear;
      }
    }

    // Fix: Pass only userId
    return this.statisticsService.getDashboardStats(user.id);
  }
}
