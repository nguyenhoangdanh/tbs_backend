import {
  Controller, Get, Post, Put, Delete, Patch, Body, Param,
  Query, ParseUUIDPipe, DefaultValuePipe, ParseIntPipe,
  ForbiddenException,
} from '@nestjs/common';
import { GatePassService } from '../services/gate-pass.service';
import { CreateGatePassDto } from '../dto/create-gate-pass.dto';
import { ApproveGatePassDto, RejectGatePassDto } from '../dto/approve-gate-pass.dto';
import { CreateApprovalConfigDto, UpdateApprovalConfigDto } from '../dto/approval-config.dto';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { RequirePermissions } from 'src/common/decorators/permissions.decorator';

@Controller('gate-passes')
export class GatePassController {
  constructor(private readonly service: GatePassService) {}

  private resolveCompanyId(user: any): string | undefined {
    const isSuperAdmin = user?.roles?.some((r: any) => r?.roleDefinition?.code === 'SUPERADMIN');
    return isSuperAdmin ? undefined : (user?.companyId ?? undefined);
  }

  // ── Tạo đơn ────────────────────────────────────────────────

  @Post()
  @RequirePermissions('gate-passes:create')
  create(@GetUser('id') userId: string, @Body() dto: CreateGatePassDto) {
    return this.service.create(userId, dto);
  }

  // ── Đơn của tôi ─────────────────────────────────────────────

  @Get('my')
  @RequirePermissions('gate-passes:view')
  getMyPasses(
    @GetUser('id') userId: string,
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.service.getMyPasses(userId, { status, page, limit });
  }

  // ── Đơn chờ tôi duyệt ───────────────────────────────────────

  @Get('pending-my-approval')
  @RequirePermissions('gate-passes:view')
  getPendingMyApproval(
    @GetUser('id') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.service.getPendingMyApproval(userId, { page, limit });
  }

  @Get('pending-my-approval/count')
  @RequirePermissions('gate-passes:view')
  getPendingCount(@GetUser('id') userId: string) {
    return this.service.getPendingMyApprovalCount(userId).then(count => ({ count }));
  }

  // ── Admin: tất cả đơn ───────────────────────────────────────

  @Get('admin/all')
  @RequirePermissions('gate-passes:manage')
  getAll(
    @GetUser() currentUser: any,
    @Query('companyId') companyIdParam?: string,
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    const isSuperAdmin = (currentUser?.roles ?? []).some(
      (r: any) => (r.roleDefinition?.code ?? r.code) === 'SUPERADMIN',
    );
    const companyId = isSuperAdmin ? (companyIdParam ?? undefined) : (currentUser?.companyId ?? undefined);
    return this.service.getAll({ companyId, status, page, limit });
  }

  // ── Chi tiết ────────────────────────────────────────────────

  @Get('my-approver')
  @RequirePermissions('gate-passes:view')
  getMyApprover(@GetUser() currentUser: any) {
    return this.service.getMyApprover(currentUser.id);
  }

  @Get(':id')
  @RequirePermissions('gate-passes:view')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(id);
  }

  // ── Phê duyệt ────────────────────────────────────────────────

  @Patch(':id/approve')
  @RequirePermissions('gate-passes:approve')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('id') userId: string,
    @Body() dto: ApproveGatePassDto,
  ) {
    return this.service.approve(id, userId, dto);
  }

  // ── Từ chối ──────────────────────────────────────────────────

  @Patch(':id/reject')
  @RequirePermissions('gate-passes:approve')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('id') userId: string,
    @Body() dto: RejectGatePassDto,
  ) {
    return this.service.reject(id, userId, dto);
  }

  // ── Chỉnh sửa ────────────────────────────────────────────────

  @Patch(':id')
  @RequirePermissions('gate-passes:create')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('id') userId: string,
    @Body() dto: CreateGatePassDto,
  ) {
    return this.service.update(id, userId, dto);
  }

  // ── Huỷ đơn ──────────────────────────────────────────────────

  @Patch(':id/cancel')
  @RequirePermissions('gate-passes:create')
  cancel(@Param('id', ParseUUIDPipe) id: string, @GetUser('id') userId: string) {
    return this.service.cancel(id, userId);
  }

  // ── Nộp nháp ─────────────────────────────────────────────────

  @Patch(':id/submit')
  @RequirePermissions('gate-passes:create')
  submitDraft(@Param('id', ParseUUIDPipe) id: string, @GetUser('id') userId: string) {
    return this.service.submitDraft(id, userId);
  }

  // ── Xoá ──────────────────────────────────────────────────────

  @Delete(':id')
  @RequirePermissions('gate-passes:create')
  delete(@Param('id', ParseUUIDPipe) id: string, @GetUser('id') userId: string) {
    return this.service.delete(id, userId);
  }

  // ── Cấu hình phê duyệt ───────────────────────────────────────

  @Get('config/list')
  @RequirePermissions('gate-passes:manage')
  getConfigs(@GetUser() currentUser: any, @Query('companyId') companyIdParam?: string) {
    // SUPERADMIN có thể lọc theo bất kỳ companyId nào; ADMIN chỉ xem công ty mình
    const companyId = this.resolveCompanyId(currentUser) ?? companyIdParam;
    return this.service.getConfigs(companyId);
  }

  @Post('config')
  @RequirePermissions('gate-passes:manage')
  createConfig(@GetUser() currentUser: any, @Body() dto: CreateApprovalConfigDto) {
    // Luôn dùng companyId từ JWT cho non-SUPERADMIN để tránh giả mạo company
    const jwtCompanyId = this.resolveCompanyId(currentUser);
    return this.service.createConfig({ ...dto, companyId: jwtCompanyId ?? dto.companyId });
  }

  @Put('config/:id')
  @RequirePermissions('gate-passes:manage')
  async updateConfig(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() currentUser: any,
    @Body() dto: UpdateApprovalConfigDto,
  ) {
    const jwtCompanyId = this.resolveCompanyId(currentUser);
    if (jwtCompanyId) {
      // Đảm bảo ADMIN chỉ cập nhật config thuộc công ty mình
      await this.service.assertConfigBelongsToCompany(id, jwtCompanyId);
    }
    return this.service.updateConfig(id, dto);
  }

  @Delete('config/:id')
  @RequirePermissions('gate-passes:manage')
  async deleteConfig(@Param('id', ParseUUIDPipe) id: string, @GetUser() currentUser: any) {
    const jwtCompanyId = this.resolveCompanyId(currentUser);
    if (jwtCompanyId) {
      await this.service.assertConfigBelongsToCompany(id, jwtCompanyId);
    }
    return this.service.deleteConfig(id);
  }

  @Get('config/approver-candidates')
  @RequirePermissions('gate-passes:manage')
  getApproverCandidates(
    @GetUser() currentUser: any,
    @Query('officeId') officeId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('includeAll') includeAll?: string,
    @Query('allUsers') allUsers?: string,
    @Query('allPositions') allPositions?: string,
    @Query('jobName') jobName?: string,
  ) {
    const companyId = this.resolveCompanyId(currentUser);
    return this.service.getApproverCandidates(officeId, departmentId, includeAll === 'true', allUsers === 'true', allPositions === 'true', jobName, companyId);
  }

  @Get('config/job-names')
  @RequirePermissions('gate-passes:manage')
  getJobNames(
    @GetUser() currentUser: any,
    @Query('officeId') officeId?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    const companyId = this.resolveCompanyId(currentUser);
    return this.service.getDistinctJobNames(officeId, departmentId, companyId);
  }

  @Get('config/dept-heads')
  @RequirePermissions('gate-passes:manage')
  getDeptHeads(
    @GetUser() currentUser: any,
    @Query('departmentId') departmentId?: string,
    @Query('jobName') jobName?: string,
  ) {
    const companyId = this.resolveCompanyId(currentUser);
    return this.service.getDeptHeadPreview(departmentId, jobName, companyId);
  }

  // ── Xem quy trình phê duyệt ──────────────────────────────────

  @Get('config/workflow-preview')
  @RequirePermissions('gate-passes:view')
  getWorkflowPreview(@GetUser() currentUser: any, @Query('companyId') companyIdParam?: string) {
    const companyId = this.resolveCompanyId(currentUser) ?? companyIdParam;
    return this.service.getWorkflowPreview(companyId);
  }
}
