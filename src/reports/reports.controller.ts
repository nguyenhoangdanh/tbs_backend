import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import {
  CreateWeeklyReportDto,
  UpdateReportDto,
  UpdateTaskDto,
} from './dto/report.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo báo cáo tuần mới' })
  @ApiResponse({ status: 201, description: 'Báo cáo đã được tạo thành công' })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ' })
  @ApiResponse({ status: 409, description: 'Báo cáo đã tồn tại' })
  create(
    @Request() req: any,
    @Body() createReportDto: CreateWeeklyReportDto,
  ) {
    return this.reportsService.createWeeklyReport(req.user.id, createReportDto);
  }

  @Get('my-reports')
  @ApiOperation({ summary: 'Lấy danh sách báo cáo của tôi' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getMyReports(
    @Request() req: any,
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 10,
  ) {
    return this.reportsService.getMyReports(req.user.id, page, limit);
  }

  @Get('current-week')
  @ApiOperation({ summary: 'Lấy báo cáo tuần hiện tại' })
  getCurrentWeekReport(@Request() req: any) {
    return this.reportsService.getCurrentWeekReport(req.user.id);
  }

  @Get('week/:weekNumber/:year')
  @ApiOperation({ summary: 'Lấy báo cáo theo tuần' })
  @ApiParam({ name: 'weekNumber', type: Number })
  @ApiParam({ name: 'year', type: Number })
  getReportByWeek(
    @Request() req: any,
    @Param('weekNumber', ParseIntPipe) weekNumber: number,
    @Param('year', ParseIntPipe) year: number,
  ) {
    return this.reportsService.getReportByWeek(req.user.id, weekNumber, year);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết báo cáo' })
  @ApiParam({ name: 'id', type: String })
  getReport(@Request() req: any, @Param('id') id: string) {
    return this.reportsService.getReportById(id, req.user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật báo cáo' })
  @ApiParam({ name: 'id', type: String })
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() updateReportDto: UpdateReportDto,
  ) {
    return this.reportsService.updateReport(req.user.id, id, updateReportDto);
  }


  @Delete(':id')
  @ApiOperation({ summary: 'Xóa báo cáo' })
  @ApiParam({ name: 'id', type: String })
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Request() req: any, @Param('id') id: string) {
    return this.reportsService.deleteReport(req.user.id, id);
  }

  @Patch('tasks/:taskId')
  @ApiOperation({ summary: 'Cập nhật công việc' })
  @ApiParam({ name: 'taskId', type: String })
  updateTask(
    @Request() req: any,
    @Param('taskId') taskId: string,
    @Body() updateTaskDto: UpdateTaskDto,
  ) {
    return this.reportsService.updateTask(req.user.id, taskId, updateTaskDto);
  }

  @Patch('tasks/:taskId/approve')
  @ApiOperation({ summary: 'Duyệt công việc' })
  @ApiParam({ name: 'taskId', type: String })
  approveTask(@Request() req: any, @Param('taskId') taskId: string) {
    return this.reportsService.approveTask(taskId);
  }

  @Patch('tasks/:taskId/reject')
  @ApiOperation({ summary: 'Từ chối công việc' })
  @ApiParam({ name: 'taskId', type: String })
  rejectTask(@Request() req: any, @Param('taskId') taskId: string) {
    const fullname = `${req.user.firstName} ${req.user.lastName}`;
    return this.reportsService.rejectTask(taskId, fullname);
  }

  

  @Delete('tasks/:taskId')
  @ApiOperation({ summary: 'Xóa công việc' })
  @ApiParam({ name: 'taskId', type: String })
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteTask(@Request() req: any, @Param('taskId') taskId: string) {
    return this.reportsService.deleteTask(req.user.id, taskId);
  }

  // Admin endpoints
  @Get('admin/all')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Lấy tất cả báo cáo (Admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'departmentId', required: false, type: String })
  @ApiQuery({ name: 'weekNumber', required: false, type: Number })
  @ApiQuery({ name: 'year', required: false, type: Number })
  getAllReports(
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 10,
    @Query('departmentId') departmentId?: string,
    @Query('weekNumber', new ParseIntPipe({ optional: true })) weekNumber?: number,
    @Query('year', new ParseIntPipe({ optional: true })) year?: number,
  ) {
    return this.reportsService.getAllReports(page, limit, departmentId, weekNumber, year);
  }

  @Get('admin/stats')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Lấy thống kê báo cáo (Admin)' })
  @ApiQuery({ name: 'weekNumber', required: false, type: Number })
  @ApiQuery({ name: 'year', required: false, type: Number })
  getReportStats(
    @Query('weekNumber', new ParseIntPipe({ optional: true })) weekNumber?: number,
    @Query('year', new ParseIntPipe({ optional: true })) year?: number,
  ) {
    return this.reportsService.getReportStats(weekNumber, year);
  }

  @Post('admin/lock-reports/:weekNumber/:year')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Khóa báo cáo theo tuần (Admin)' })
  @ApiParam({ name: 'weekNumber', type: Number })
  @ApiParam({ name: 'year', type: Number })
  lockReportsByWeek(
    @Param('weekNumber', ParseIntPipe) weekNumber: number,
    @Param('year', ParseIntPipe) year: number,
  ) {
    return this.reportsService.lockReportsByWeek(weekNumber, year);
  }
}
