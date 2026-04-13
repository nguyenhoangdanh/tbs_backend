import {
  Controller, Get, Post, Put, Delete, Patch,
  Body, Param, Query, ParseUUIDPipe, DefaultValuePipe, ParseIntPipe,
} from '@nestjs/common';
import { LeaveRequestService } from '../services/leave-request.service';
import { LeaveApprovalService } from '../services/leave-approval.service';
import { CreateLeaveRequestDto } from '../dto/leave-request/create-leave-request.dto';
import { UpdateLeaveRequestDto } from '../dto/leave-request/update-leave-request.dto';
import {
  ApproveLeaveDto, CancelLeaveRequestDto, AddLeaveCommentDto, BulkApproveLeaveDto,
} from '../dto/leave-request/approve-leave.dto';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { RequirePermissions } from 'src/common/decorators/permissions.decorator';

@Controller('leave-requests')
export class LeaveRequestController {
  constructor(
    private readonly leaveRequestService: LeaveRequestService,
    private readonly leaveApprovalService: LeaveApprovalService,
  ) {}

  // ── Admin: danh sách tất cả đơn ──────────────────────────────

  @Get('admin/all')
  @RequirePermissions('leave-requests:manage')
  adminGetAll(
    @GetUser() currentUser: any,
    @Query('companyId') companyIdParam?: string,
    @Query('status') status?: string,
    @Query('leaveTypeId') leaveTypeId?: string,
    @Query('userId') userId?: string,
    @Query('year', new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) year?: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    // SUPERADMIN can see all companies; others scoped to own companyId
    const isSuperAdmin = (currentUser?.roles ?? []).some(
      (r: any) => (r.roleDefinition?.code ?? r.code) === 'SUPERADMIN',
    );
    const companyId = isSuperAdmin
      ? (companyIdParam ?? null)
      : (currentUser?.companyId ?? null);

    return this.leaveRequestService.getAllRequests(companyId, { status, leaveTypeId, userId, year, page, limit });
  }

  // ── Tạo đơn ────────────────────────────────────────────────────

  @Post()
  @RequirePermissions('leave-requests:create')
  create(@GetUser('id') userId: string, @Body() dto: CreateLeaveRequestDto) {
    return this.leaveRequestService.createRequest(userId, dto);
  }

  // ── Xem đơn của mình ─────────────────────────────────────────

  @Get('my-approver')
  @RequirePermissions('leave-requests:view')
  getMyApprover(@GetUser('id') userId: string) {
    return this.leaveRequestService.getMyApprover(userId);
  }

  @Get('my')
  @RequirePermissions('leave-requests:view')
  getMyRequests(
    @GetUser('id') userId: string,
    @GetUser('companyId') companyId: string,
    @Query('status') status?: string,
    @Query('leaveTypeId') leaveTypeId?: string,
    @Query('year', new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) year?: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.leaveRequestService.getMyRequests(userId, companyId, { status, leaveTypeId, year, page, limit });
  }

  // ── Queue đơn đang chờ mình duyệt ────────────────────────────

  @Get('pending-approval')
  @RequirePermissions('leave-approvals:view')
  getPendingForMe(
    @GetUser('id') approverId: string,
    @GetUser('companyId') companyId: string,
    @Query('cursor') cursor?: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.leaveApprovalService.getPendingRequestsForApprover(approverId, companyId, cursor, limit);
  }

  @Get('approved-by-me')
  @RequirePermissions('leave-approvals:view')
  getApprovedByMe(
    @GetUser('id') approverId: string,
    @GetUser('companyId') companyId: string,
    @Query('year', new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) year?: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.leaveRequestService.getApprovedByMe(approverId, companyId, { year, page, limit });
  }

  // ── Duyệt hàng loạt ──────────────────────────────────────────

  @Post('bulk-approve')
  @RequirePermissions('leave-approvals:approve')
  bulkApprove(
    @GetUser('id') approverId: string,
    @Body() dto: BulkApproveLeaveDto,
  ) {
    return this.leaveRequestService.bulkApprove(approverId, dto);
  }

  // ── Chi tiết đơn ─────────────────────────────────────────────

  @Get(':id')
  @RequirePermissions('leave-requests:view')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('id') viewerId: string,
  ) {
    return this.leaveRequestService.getRequestById(id, viewerId);
  }

  // ── Cập nhật (chỉ khi DRAFT) ──────────────────────────────────

  @Put(':id')
  @RequirePermissions('leave-requests:update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('id') userId: string,
    @Body() dto: UpdateLeaveRequestDto,
  ) {
    return this.leaveRequestService.updateRequest(id, userId, dto);
  }

  // ── Xóa đơn nháp ──────────────────────────────────────────────

  @Delete(':id')
  @RequirePermissions('leave-requests:delete')
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('id') userId: string,
  ) {
    return this.leaveRequestService.deleteRequest(id, userId);
  }

  // ── Submit đơn nháp ────────────────────────────────────────────

  @Post(':id/submit')
  @RequirePermissions('leave-requests:update')
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('id') userId: string,
  ) {
    return this.leaveRequestService.submitRequest(id, userId);
  }

  // ── Hủy đơn ──────────────────────────────────────────────────

  @Post(':id/cancel')
  @RequirePermissions('leave-requests:update')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() currentUser: any,
    @Body() dto: CancelLeaveRequestDto,
  ) {
    // Admin hoặc người có quyền approve có thể hủy đơn của người khác
    const hasApprovePermission = (currentUser?.roles ?? []).some((r: any) =>
      r.roleDefinition?.permissions?.some(
        (p: any) => p.permission?.resource === 'leave-approvals' && p.permission?.action === 'approve' && p.isGranted,
      ),
    );
    const isAdminOrApprover = hasApprovePermission ||
      ['ADMIN', 'SUPERADMIN', 'MANAGER', 'LINE_MANAGER', 'FACTORY_DIRECTOR'].some((role) =>
        (currentUser?.roles ?? []).some((r: any) => r.roleDefinition?.code === role),
      );
    return this.leaveRequestService.cancelRequest(id, currentUser.id, dto, isAdminOrApprover);
  }

  // ── Phê duyệt / Từ chối ───────────────────────────────────────

  @Post(':id/approve')
  @RequirePermissions('leave-approvals:approve')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('id') approverId: string,
    @Body() dto: ApproveLeaveDto,
  ) {
    return this.leaveApprovalService.processApproval(id, approverId, dto);
  }

  // ── Bình luận ────────────────────────────────────────────────

  @Post(':id/comments')
  @RequirePermissions('leave-requests:view')
  addComment(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('id') userId: string,
    @Body() dto: AddLeaveCommentDto,
  ) {
    return this.leaveRequestService.addComment(id, userId, dto);
  }
}
