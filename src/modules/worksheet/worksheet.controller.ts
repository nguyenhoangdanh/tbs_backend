import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Query,
  Put,
  Patch
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { CreateWorksheetDto } from './dto/create-worksheet.dto';
import { UpdateWorksheetDto } from './dto/update-worksheet.dto';
import { UpdateWorksheetRecordDto } from './dto/update-worksheet-record.dto';
import { BatchUpdateByHourDto } from './dto/batch-update-by-hour.dto';
import { QuickUpdateRecordDto } from './dto/quick-update-record.dto';
import { AdjustRecordTargetDto } from './dto/adjust-record-target.dto';
import { BulkUpdateGroupWorksheetsDto } from './dto/bulk-update-group-worksheets.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { WorksheetService } from './worksheet.service';

@ApiTags('worksheets')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('worksheets')
export class WorksheetController {
  constructor(private readonly worksheetService: WorksheetService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('SUPERADMIN', 'ADMIN', 'USER')
  @ApiOperation({ summary: 'Create new worksheet' })
  @ApiResponse({ status: 201, description: 'Worksheet created successfully' })
  create(@Body() createWorksheetDto: CreateWorksheetDto, @GetUser() user: any) {
    return this.worksheetService.createWorksheet(createWorksheetDto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all worksheets' })
  @ApiQuery({ name: 'officeId', required: false, type: String, description: 'Office ID' })
  @ApiQuery({ name: 'groupId', required: false, type: String })
  @ApiQuery({ name: 'departmentId', required: false, type: String, description: 'Filter by Department ID (Department → Team → Group)' })
  @ApiQuery({ name: 'date', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Worksheets retrieved successfully' })
  findAll(
    @Query('officeId') officeId?: string,
    @Query('groupId') groupId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('date') date?: string,
    @Query('status') status?: string,
    @GetUser() user?: any
  ) {
    const dateFilter = date ? new Date(date) : undefined;
    return this.worksheetService.findAll({
      officeId,
      groupId,
      departmentId,
      date: dateFilter,
      status,
      userId: user.id,
      userRole: user.role
    });
  }

  @Get('group/:groupId')
  @ApiOperation({ summary: 'Get worksheets for specific group' })
  @ApiQuery({ name: 'date', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Group worksheets retrieved successfully' })
  getGroupWorksheets(
    @Param('groupId') groupId: string,
    @Query('date') date?: string,
    @GetUser() user?: any
  ) {
    const dateFilter = date ? new Date(date) : new Date();
    return this.worksheetService.getGroupWorksheets(groupId, dateFilter, user);
  }

  @Get('my-groups')
  @ApiOperation({ summary: 'Get worksheets for groups led by current user' })
  @ApiQuery({ name: 'date', required: false, type: String })
  @ApiResponse({ status: 200, description: 'My group worksheets retrieved successfully' })
  getMyGroupWorksheets(
    @Query('date') date?: string,
    @GetUser() user?: any
  ) {
    const dateFilter = date ? new Date(date) : new Date();
    return this.worksheetService.getMyGroupWorksheets(user.id, dateFilter);
  }

  @Get('my-today')
  @ApiOperation({ summary: 'Get today worksheets for current group leader' })
  @ApiResponse({ status: 200, description: 'Today worksheets retrieved' })
  async getMyTodayWorksheets(@GetUser() user: any) {
    const today = new Date();
    return this.worksheetService.getMyGroupWorksheets(user.id, today);
  }

  @Get('dashboard/today')
  @UseGuards(RolesGuard)
  @Roles('SUPERADMIN', 'ADMIN')
  @ApiOperation({ summary: 'Today production dashboard' })
  @ApiResponse({ status: 200, description: 'Dashboard data retrieved' })
  async getTodayDashboard(@GetUser() user: any) {
    const today = new Date();
    return this.worksheetService.getTodayProductionDashboard(today, user);
  }

  @Get('dashboard/office/:officeId')
  @UseGuards(RolesGuard)
  @Roles('SUPERADMIN', 'ADMIN')
  @ApiOperation({ summary: 'Office production dashboard' })
  async getOfficeDashboard(
    @Param('officeId') officeId: string,
    @Query('date') date?: string,
    @GetUser() user?: any
  ) {
    const targetDate = date ? new Date(date) : new Date();
    return this.worksheetService.getOfficeDashboard(officeId, targetDate, user);
  }

  @Get('analytics/realtime')
  @UseGuards(RolesGuard)
  @Roles('SUPERADMIN', 'ADMIN', 'USER')
  @ApiOperation({ summary: 'Get real-time analytics' })
  @ApiQuery({ name: 'officeId', required: false, type: String })
  @ApiQuery({ name: 'date', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Real-time analytics retrieved' })
  getRealtimeAnalytics(
    @Query('officeId') officeId?: string,
    @Query('date') date?: string,
    @GetUser() user?: any
  ) {
    const dateFilter = date ? new Date(date) : undefined;
    return this.worksheetService.getRealtimeAnalytics({
      officeId,
      date: dateFilter,
      userId: user.id,
      userRole: user.role
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get worksheet by ID' })
  @ApiResponse({ status: 200, description: 'Worksheet retrieved successfully' })
  findOne(@Param('id') id: string, @GetUser() user: any) {
    return this.worksheetService.findOne(id, user);
  }

  @Get(':id/analytics')
  @ApiOperation({ summary: 'Get worksheet analytics' })
  @ApiResponse({ status: 200, description: 'Analytics retrieved successfully' })
  getAnalytics(@Param('id') id: string, @GetUser() user: any) {
    return this.worksheetService.getAnalytics(id, user);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('SUPERADMIN', 'ADMIN', 'USER')
  @ApiOperation({ summary: 'Update worksheet' })
  @ApiResponse({ status: 200, description: 'Worksheet updated successfully' })
  update(
    @Param('id') id: string,
    @Body() updateWorksheetDto: UpdateWorksheetDto,
    @GetUser() user: any
  ) {
    return this.worksheetService.update(id, updateWorksheetDto, user);
  }

  @Put('group/:groupId/bulk-update')
  @UseGuards(RolesGuard)
  @Roles('SUPERADMIN', 'ADMIN', 'USER')
  @ApiOperation({ 
    summary: 'Bulk update all worksheets in a group',
    description: 'Update shift type, product, process, and planned output for all workers in group at once'
  })
  @ApiResponse({ status: 200, description: 'All worksheets updated successfully' })
  bulkUpdateGroupWorksheets(
    @Param('groupId') groupId: string,
    @Body() bulkUpdateDto: BulkUpdateGroupWorksheetsDto,
    @GetUser() user: any
  ) {
    return this.worksheetService.bulkUpdateGroupWorksheets(groupId, bulkUpdateDto, user);
  }

  @Patch(':id/records/:recordId')
  @UseGuards(RolesGuard)
  @Roles('SUPERADMIN', 'ADMIN', 'USER')
  @ApiOperation({ summary: 'Update worksheet record' })
  @ApiResponse({ status: 200, description: 'Record updated successfully' })
  updateRecord(
    @Param('id') worksheetId: string,
    @Param('recordId') recordId: string,
    @Body() updateRecordDto: UpdateWorksheetRecordDto,
    @GetUser() user: any
  ) {
    return this.worksheetService.updateRecord(worksheetId, recordId, updateRecordDto, user);
  }

  @Patch(':id/records/:recordId/quick-update')
  @UseGuards(RolesGuard)
  @Roles('SUPERADMIN', 'ADMIN', 'USER')
  @ApiOperation({ summary: 'Quick update record for mobile (group leaders)' })
  @ApiResponse({ status: 200, description: 'Record updated successfully' })
  async quickUpdateRecord(
    @Param('id') worksheetId: string,
    @Param('recordId') recordId: string,
    @Body() quickUpdateDto: QuickUpdateRecordDto,
    @GetUser() user: any
  ) {
    return this.worksheetService.quickUpdateRecord(
      worksheetId,
      recordId,
      quickUpdateDto.actualOutput,
      user
    );
  }

  // ⭐ CORE ENDPOINT - Batch update by hour for entire group
  @Post('group/:groupId/hour/:workHour/batch-update')
  @UseGuards(RolesGuard)
  @Roles('SUPERADMIN', 'ADMIN', 'USER')
  @ApiOperation({ 
    summary: 'Batch update outputs for all workers in a specific hour',
    description: 'Group leader updates 30 workers at once. Supports multiple products per worker per hour.'
  })
  @ApiResponse({ status: 200, description: 'All workers updated successfully' })
  batchUpdateByHour(
    @Param('groupId') groupId: string,
    @Param('workHour') workHour: string,
    @Body() batchDto: BatchUpdateByHourDto,
    @GetUser() user: any
  ) {
    return this.worksheetService.batchUpdateByHour(
      groupId,
      parseInt(workHour),
      batchDto,
      user
    );
  }

  @Post(':id/complete')
  @UseGuards(RolesGuard)
  @Roles('SUPERADMIN', 'ADMIN', 'USER')
  @ApiOperation({ summary: 'Complete worksheet' })
  @ApiResponse({ status: 200, description: 'Worksheet completed successfully' })
  completeWorksheet(@Param('id') id: string, @GetUser() user: any) {
    return this.worksheetService.completeWorksheet(id, user);
  }

  @Post('archive-old')
  @UseGuards(RolesGuard)
  @Roles('SUPERADMIN', 'ADMIN')
  @ApiOperation({ summary: 'Archive old worksheets' })
  @ApiQuery({ name: 'beforeDate', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Old worksheets archived successfully' })
  archiveOldWorksheets(
    @Query('beforeDate') beforeDate?: string,
    @GetUser() user?: any
  ) {
    const archiveDate = beforeDate ? new Date(beforeDate) : undefined;
    return this.worksheetService.archiveOldWorksheets(archiveDate, user);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('SUPERADMIN', 'ADMIN')
  @ApiOperation({ summary: 'Delete worksheet' })
  @ApiResponse({ status: 200, description: 'Worksheet deleted successfully' })
  remove(@Param('id') id: string, @GetUser() user: any) {
    return this.worksheetService.remove(id, user);
  }

  // ============= GRID VIEW & ADVANCED FEATURES =============

  @Get('group/:groupId/grid')
  @ApiOperation({ summary: 'Get worksheet grid for a group (matrix view: workers × hours)' })
  @ApiQuery({ name: 'date', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Worksheet grid retrieved successfully' })
  getWorksheetGrid(
    @Param('groupId') groupId: string,
    @Query('date') date?: string,
    @GetUser() user?: any
  ) {
    const dateFilter = date ? new Date(date) : new Date();
    return this.worksheetService.getWorksheetGrid(groupId, dateFilter, user);
  }

  @Patch(':id/adjust-target/:workHour')
  @UseGuards(RolesGuard)
  @Roles('SUPERADMIN', 'ADMIN', 'USER')
  @ApiOperation({ summary: 'Adjust planned output for a specific hour' })
  @ApiResponse({ status: 200, description: 'Record target adjusted successfully' })
  adjustRecordTarget(
    @Param('id') worksheetId: string,
    @Param('workHour') workHour: string,
    @Body() adjustDto: AdjustRecordTargetDto,
    @GetUser() user: any
  ) {
    return this.worksheetService.adjustRecordTarget(
      worksheetId, 
      parseInt(workHour), 
      adjustDto.plannedOutput, 
      user
    );
  }

    @Post(':id/copy-forward')
  @UseGuards(RolesGuard)
  @Roles('SUPERADMIN', 'ADMIN', 'USER')
  @ApiOperation({ summary: 'Copy forward product/process for speed input' })
  @ApiResponse({ status: 200, description: 'Product/process copied successfully' })
  async copyForwardProductProcess(
    @Param('id') id: string,
    @Body() copyDto: any,
    @GetUser() user: any
  ) {
    return this.worksheetService.copyForwardProductProcess(
      id,
      copyDto.fromHour,
      copyDto.toHourStart,
      copyDto.toHourEnd,
      user
    );
  }

  @Get('reports/by-organization')
  @ApiOperation({ 
    summary: 'Get worksheets for report export by organization structure',
    description: 'Export data hierarchically: Office → Department → Team → Group. Shows all workers (with/without worksheets).'
  })
  @ApiQuery({ name: 'date', required: true, type: String, description: 'Date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'officeId', required: false, type: String, description: 'Filter by Office' })
  @ApiQuery({ name: 'departmentId', required: false, type: String, description: 'Filter by Department' })
  @ApiQuery({ name: 'teamId', required: false, type: String, description: 'Filter by Team' })
  @ApiQuery({ name: 'groupId', required: false, type: String, description: 'Filter by Group' })
  @ApiResponse({ status: 200, description: 'Report data retrieved successfully' })
  async getWorksheetsForReport(
    @Query('date') date: string,
    @Query('officeId') officeId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('teamId') teamId?: string,
    @Query('groupId') groupId?: string,
    @GetUser() user?: any
  ) {
    return this.worksheetService.getWorksheetsForReport({
      date: new Date(date),
      officeId: officeId,
      departmentId: departmentId,
      teamId,
      groupId,
      userId: user?.id,
      userRole: user?.role
    });
  }
}
