import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { LeaveTypeService } from '../services/leave-type.service';
import { CreateLeaveTypeDto } from '../dto/leave-type/create-leave-type.dto';
import { UpdateLeaveTypeDto } from '../dto/leave-type/update-leave-type.dto';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { RequirePermissions } from 'src/common/decorators/permissions.decorator';

@Controller('leave-types')
export class LeaveTypeController {
  constructor(private readonly leaveTypeService: LeaveTypeService) {}

  @Get('categories')
  @RequirePermissions('leave-types:view')
  findCategories(
    @GetUser('companyId') companyId: string,
    @Query('companyId') queryCompanyId?: string,
  ) {
    return this.leaveTypeService.findCategories(queryCompanyId ?? companyId);
  }

  @Post()
  @RequirePermissions('leave-types:create')
  create(@Body() dto: CreateLeaveTypeDto) {
    return this.leaveTypeService.create(dto);
  }

  @Get()
  @RequirePermissions('leave-types:view')
  findAll(
    @GetUser('companyId') companyId: string,
    @Query('companyId') queryCompanyId?: string,
  ) {
    return this.leaveTypeService.findAll(queryCompanyId ?? companyId);
  }

  @Get(':id')
  @RequirePermissions('leave-types:view')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.leaveTypeService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('leave-types:update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLeaveTypeDto) {
    return this.leaveTypeService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('leave-types:delete')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.leaveTypeService.remove(id);
  }
}
