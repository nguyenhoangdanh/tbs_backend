import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, ParseUUIDPipe,
} from '@nestjs/common';
import { LeaveFlowService } from '../services/leave-flow.service';
import { CreateLeaveFlowDto } from '../dto/leave-flow/create-leave-flow.dto';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { RequirePermissions } from 'src/common/decorators/permissions.decorator';

@Controller('leave-flows')
export class LeaveFlowController {
  constructor(private readonly leaveFlowService: LeaveFlowService) {}

  @Post()
  @RequirePermissions('leave-flows:create')
  create(
    @GetUser('companyId') companyId: string,
    @Body() dto: CreateLeaveFlowDto,
  ) {
    // companyId from JWT takes precedence (whitelist validation strips it from body anyway)
    return this.leaveFlowService.create({ ...dto, companyId });
  }

  @Get()
  @RequirePermissions('leave-flows:view')
  findAll(
    @GetUser('companyId') companyId: string,
    @Query('companyId') queryCompanyId?: string,
  ) {
    return this.leaveFlowService.findAll(queryCompanyId ?? companyId);
  }

  @Get('preview-approvers')
  @RequirePermissions('leave-flows:view')
  previewApprovers(
    @GetUser('companyId') jwtCompanyId: string,
    @Query('mode') mode: string,
    @Query('companyId') queryCompanyId?: string,
    @Query('roleDefinitionId') roleDefinitionId?: string,
    @Query('targetDepartmentId') targetDepartmentId?: string,
    @Query('officeId') officeId?: string,
  ) {
    // Pass queryCompanyId if provided; otherwise pass jwtCompanyId as soft hint
    // (previewApprovers uses it as fallback, not strict filter)
    return this.leaveFlowService.previewApprovers(queryCompanyId ?? jwtCompanyId, mode, roleDefinitionId, targetDepartmentId, officeId);
  }

  @Get(':id')
  @RequirePermissions('leave-flows:view')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.leaveFlowService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('leave-flows:update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: Partial<CreateLeaveFlowDto>) {
    return this.leaveFlowService.update(id, dto);
  }

  @Post('reattach-all')
  @RequirePermissions('leave-flows:manage')
  reattachAll() {
    return this.leaveFlowService.reattachAllPendingRequests();
  }

  @Post('fix-scoping')
  @RequirePermissions('leave-flows:manage')
  fixFlowScoping() {
    return this.leaveFlowService.fixFlowScoping();
  }

  @Delete(':id')
  @RequirePermissions('leave-flows:delete')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.leaveFlowService.remove(id);
  }
}
