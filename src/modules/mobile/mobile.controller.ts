import { Controller, Get, Patch, Param, Body, UseGuards, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { WorksheetService } from '../worksheet/worksheet.service';
import { MobileService } from './mobile.service';
import { QuickUpdateRecordDto } from '../worksheet/dto/quick-update-record.dto';

@ApiTags('mobile')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('mobile')
export class MobileController {
  constructor(
    private readonly worksheetService: WorksheetService,
    private readonly mobileService: MobileService,
  ) {}

  @Get('my-worksheets-today')
  @ApiOperation({ summary: 'Get today worksheets for mobile (group leaders)' })
  async getMyWorksheetsToday(@GetUser() user: any) {
    const today = new Date();
    const worksheets = await this.worksheetService.getMyGroupWorksheets(user.id, today);
    
    // Simplify response for mobile
    return worksheets.map(ws => ({
      id: ws.id,
      groupName: ws.group.name,
      factoryCode: ws.factory.code,
      shiftType: ws.shiftType,
      totalWorkers: ws.totalWorkers,
      completedRecords: ws.records?.filter(r => r.status === 'COMPLETED').length || 0,
      totalRecords: ws.records?.length || 0,
      status: ws.status,
    }));
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Get mobile dashboard summary for group leaders' })
  async getMobileDashboard(@GetUser() user: any) {
    return this.mobileService.getMobileDashboard(user.id);
  }

  @Get('worksheet/:id/workers')
  @ApiOperation({ summary: 'Get mobile-friendly worker list for quick entry' })
  async getMobileWorkerList(
    @Param('id') worksheetId: string,
    @GetUser() user: any
  ) {
    return this.mobileService.getMobileWorkerList(worksheetId, user.id);
  }

  @Get('group/:groupId/performance')
  @ApiOperation({ summary: 'Get simplified group performance for mobile' })
  @ApiQuery({ name: 'date', required: false, type: String })
  async getMobileGroupPerformance(
    @Param('groupId') groupId: string,
    @Query('date') date?: string,
    @GetUser() user?: any
  ) {
    return this.mobileService.getMobileGroupPerformance(groupId, user.id, date);
  }

  @Post('bulk-sync')
  @ApiOperation({ summary: 'Bulk update for mobile (offline sync)' })
  async mobileBulkSync(
    @Body() body: { updates: any[] },
    @GetUser() user: any
  ) {
    return this.mobileService.mobileBulkSync(body.updates, user.id);
  }

  @Get('sync-status')
  @ApiOperation({ summary: 'Check mobile app connectivity and sync status' })
  async checkMobileSync(@GetUser() user: any) {
    return this.mobileService.checkMobileSync(user.id);
  }

  @Get('worksheet/:id/mobile-view')
  @ApiOperation({ summary: 'Get worksheet optimized for mobile view' })
  async getWorksheetMobileView(
    @Param('id') id: string,
    @GetUser() user: any
  ) {
    const worksheet = await this.worksheetService.findOne(id, user);
    
    // Transform for mobile-friendly response
    return {
      id: worksheet.id,
      date: worksheet.date,
      group: {
        name: worksheet.group.name,
        totalMembers: worksheet.items.length,
      },
      records: worksheet.records.map(record => ({
        id: record.id,
        workHour: record.workHour,
        timeSlot: `${record.startTime}-${record.endTime}`,
        status: record.status,
        completedWorkers: record.itemRecords.length,
        totalOutput: record.itemRecords.reduce((sum, item) => sum + item.actualOutput, 0),
      })),
      workers: worksheet.items.map(item => ({
        id: item.id,
        workerId: item.workerId,
        name: `${item.worker.firstName} ${item.worker.lastName}`,
        employeeCode: item.worker.employeeCode,
      })),
    };
  }

  @Patch('worksheet/:id/records/:recordId/quick-entry')
  @ApiOperation({ summary: 'Quick entry for mobile group leaders' })
  async quickEntry(
    @Param('id') worksheetId: string,
    @Param('recordId') recordId: string,
    @Body() quickUpdateDto: QuickUpdateRecordDto,
    @GetUser() user: any
  ) {
    const result = await this.worksheetService.quickUpdateRecord(
      worksheetId,
      recordId,
      quickUpdateDto,
      user
    );

    // Return simplified response for mobile
    return {
      success: true,
      recordId: result.id,
      updatedWorkers: result.itemRecords.length,
      totalOutput: result.itemRecords.reduce((sum, item) => sum + item.actualOutput, 0),
    };
  }
}
