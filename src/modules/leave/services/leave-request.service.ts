import {
  Injectable, BadRequestException, NotFoundException,
  ForbiddenException, Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/common/prisma.service';
import { WorkingDayService } from './working-day.service';
import { LeaveApprovalService } from './leave-approval.service';
import { LeaveBalanceService } from './leave-balance.service';
import { CreateLeaveRequestDto } from '../dto/leave-request/create-leave-request.dto';
import { UpdateLeaveRequestDto } from '../dto/leave-request/update-leave-request.dto';
import { CancelLeaveRequestDto, AddLeaveCommentDto, BulkApproveLeaveDto, ApprovalDecision } from '../dto/leave-request/approve-leave.dto';
import { LeaveRequestStatus, Prisma } from '@prisma/client';

@Injectable()
export class LeaveRequestService {
  private readonly logger = new Logger(LeaveRequestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workingDayService: WorkingDayService,
    private readonly approvalService: LeaveApprovalService,
    private readonly balanceService: LeaveBalanceService,
  ) {}

  // ── Tạo đơn xin phép ──────────────────────────────────────────

  async createRequest(userId: string, dto: CreateLeaveRequestDto) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, companyId: true, officeId: true, jobPositionId: true, jobPosition: { select: { departmentId: true, jobName: true } } },
    });

    let leaveType = await this.prisma.leaveType.findFirst({
      where: {
        id: dto.leaveTypeId,
        isActive: true,
        OR: [{ companyId: null }, { companyId: user.companyId }],
      },
    });

    // If not found as a LeaveType, the frontend may have sent a LeaveTypeCategory id
    // (this happens when the category has no leaf types, e.g. "Việc riêng - VR").
    // Find-or-create a default leaf LeaveType for that category.
    if (!leaveType) {
      const category = await this.prisma.leaveTypeCategory.findFirst({
        where: {
          id: dto.leaveTypeId,
          isActive: true,
          OR: [{ companyId: null }, { companyId: user.companyId }],
        },
      });
      if (!category) throw new NotFoundException('Loại phép không tồn tại');

      // Try to find an existing default leaf type for this category
      leaveType = await this.prisma.leaveType.findFirst({
        where: {
          categoryId: category.id,
          code: category.code,
          OR: [{ companyId: null }, { companyId: user.companyId }],
        },
      });

      // Auto-create one if it doesn't exist yet
      if (!leaveType) {
        leaveType = await this.prisma.leaveType.create({
          data: {
            categoryId: category.id,
            code: category.code,
            name: category.name,
            nameVi: category.nameVi,
            companyId: category.companyId,
            isActive: true,
            isPaid: false,
            countWorkingDaysOnly: false,
            allowHalfDay: true,
          },
        });
      }
    }

    if (!leaveType) throw new NotFoundException('Loại phép không tồn tại');

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (startDate > endDate) throw new BadRequestException('Ngày bắt đầu phải trước ngày kết thúc');

    // Kiểm tra trùng ngày với đơn nghỉ đang active (DRAFT hoặc PENDING hoặc APPROVED)
    const overlapping = await this.prisma.leaveRequest.findFirst({
      where: {
        userId,
        status: { in: ['DRAFT', 'PENDING', 'APPROVED'] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      select: { id: true, requestNumber: true, status: true, startDate: true, endDate: true },
    });
    if (overlapping) {
      throw new BadRequestException(
        `Trùng ngày với đơn ${overlapping.requestNumber} (${overlapping.status}) từ ` +
        `${overlapping.startDate.toISOString().split('T')[0]} đến ${overlapping.endDate.toISOString().split('T')[0]}`,
      );
    }

    // Tính tổng ngày làm việc
    const totalDays = await this.workingDayService.calculateWorkingDays(startDate, endDate, {
      startHalfDay: dto.startHalfDay,
      endHalfDay: dto.endHalfDay,
      companyId: user.companyId,
      countWorkingDaysOnly: leaveType.countWorkingDaysOnly,
    });
    if (totalDays <= 0) throw new BadRequestException('Không có ngày làm việc hợp lệ trong khoảng thời gian đã chọn');

    // Kiểm tra số ngày phép còn lại (chỉ với loại phép có số dư giới hạn)
    if (leaveType.isAccruable || leaveType.maxDaysPerYear) {
      const year = startDate.getFullYear();
      // Use leaveType.id (resolved/created leaf type), NOT dto.leaveTypeId (may be category id)
      const balance = await this.balanceService.getOrCreateBalance(userId, leaveType.id, year, user.companyId);
      const available = this.balanceService.calcAvailable(balance);
      if (available < totalDays) {
        throw new BadRequestException(
          `Số ngày phép không đủ. Còn lại: ${available} ngày, yêu cầu: ${totalDays} ngày`,
        );
      }
    }

    // Tìm flow duyệt phù hợp
    const flow = await this.approvalService.findMatchingFlow(
      user.companyId,
      dto.leaveTypeId,
      user.officeId,
      user.jobPosition?.departmentId ?? null,
      userId,
      user.jobPosition?.jobName ?? null,
    );

    // Tính level bắt đầu (bỏ qua nếu người tạo là người duyệt hoặc không có ai duyệt)
    const requesterInfo = {
      companyId: user.companyId,
      officeId: user.officeId ?? '',
      jobPosition: { departmentId: user.jobPosition?.departmentId ?? '', jobName: user.jobPosition?.jobName ?? null },
    };
    const startingLevel = flow
      ? await this.approvalService.computeStartingLevel(flow, userId, requesterInfo)
      : 1;

    // Tạo số đơn tự động
    const requestNumber = await this.generateRequestNumber(user.companyId);

    const status: LeaveRequestStatus = dto.submitImmediately !== false
      ? (leaveType.isAutoApproved ? 'APPROVED' : 'PENDING')
      : 'DRAFT';

    const request = await this.prisma.leaveRequest.create({
      data: {
        requestNumber,
        userId,
        companyId: user.companyId,
        leaveTypeId: leaveType.id,
        flowId: flow?.id ?? null,
        currentLevel: startingLevel,
        startDate,
        endDate,
        startHalfDay: dto.startHalfDay ?? false,
        endHalfDay: dto.endHalfDay ?? false,
        totalDays,
        reason: dto.reason ?? null,
        attachmentUrl: dto.attachmentUrl ?? null,
        status,
        submittedAt: status !== 'DRAFT' ? new Date() : null,
        approvedAt: status === 'APPROVED' ? new Date() : null,
        notifyByEmail: dto.notifyByEmail ?? false,
      },
      include: this.requestInclude(),
    });

    // Cập nhật số dư pending nếu đã submit
    if (status === 'PENDING' && leaveType.isAccruable) {
      await this.balanceService.adjustPending(userId, dto.leaveTypeId, startDate.getFullYear(), user.companyId, totalDays);
    }

    return request;
  }

  // ── Cập nhật đơn (chỉ khi DRAFT) ──────────────────────────────

  async updateRequest(requestId: string, userId: string, dto: UpdateLeaveRequestDto) {
    const request = await this.findRequestForUser(requestId, userId);
    if (request.status !== 'DRAFT') {
      throw new BadRequestException('Chỉ có thể chỉnh sửa đơn ở trạng thái Nháp');
    }

    const updateData: Prisma.LeaveRequestUpdateInput = {};

    if (dto.startDate || dto.endDate) {
      const startDate = new Date(dto.startDate ?? request.startDate.toISOString().split('T')[0]);
      const endDate = new Date(dto.endDate ?? request.endDate.toISOString().split('T')[0]);
      const leaveType = await this.prisma.leaveType.findUniqueOrThrow({ where: { id: request.leaveTypeId } });

      const totalDays = await this.workingDayService.calculateWorkingDays(startDate, endDate, {
        startHalfDay: dto.startHalfDay ?? request.startHalfDay,
        endHalfDay: dto.endHalfDay ?? request.endHalfDay,
        companyId: request.companyId,
        countWorkingDaysOnly: leaveType.countWorkingDaysOnly,
      });

      updateData.startDate = startDate;
      updateData.endDate = endDate;
      updateData.totalDays = totalDays;
    }
    if (dto.startHalfDay !== undefined) updateData.startHalfDay = dto.startHalfDay;
    if (dto.endHalfDay !== undefined) updateData.endHalfDay = dto.endHalfDay;
    if (dto.reason !== undefined) updateData.reason = dto.reason;
    if (dto.attachmentUrl !== undefined) updateData.attachmentUrl = dto.attachmentUrl;
    if (dto.notifyByEmail !== undefined) updateData.notifyByEmail = dto.notifyByEmail;

    return this.prisma.leaveRequest.update({
      where: { id: requestId },
      data: updateData,
      include: this.requestInclude(),
    });
  }

  // ── Submit đơn nháp ────────────────────────────────────────────

  async submitRequest(requestId: string, userId: string) {
    const request = await this.findRequestForUser(requestId, userId);
    if (request.status !== 'DRAFT') {
      throw new BadRequestException('Đơn đã được gửi trước đó');
    }
    const leaveType = await this.prisma.leaveType.findUniqueOrThrow({ where: { id: request.leaveTypeId } });
    const newStatus: LeaveRequestStatus = leaveType.isAutoApproved ? 'APPROVED' : 'PENDING';

    // Tính lại startingLevel nếu PENDING (bỏ qua cấp người tạo đơn = người duyệt)
    let startingLevel = request.currentLevel ?? 1;
    if (newStatus === 'PENDING' && request.flowId) {
      const flow = await this.prisma.leaveApprovalFlow.findUnique({
        where: { id: request.flowId },
        include: { levels: { where: { isActive: true }, orderBy: { level: 'asc' } } },
      });
      if (flow) {
        const user = await this.prisma.user.findUniqueOrThrow({
          where: { id: userId },
          select: { companyId: true, officeId: true, jobPosition: { select: { departmentId: true, jobName: true } } },
        });
        startingLevel = await this.approvalService.computeStartingLevel(
          flow,
          userId,
          { companyId: user.companyId, officeId: user.officeId ?? '', jobPosition: { departmentId: user.jobPosition?.departmentId ?? '', jobName: user.jobPosition?.jobName ?? null } },
        );
      }
    }

    const updated = await this.prisma.leaveRequest.update({
      where: { id: requestId },
      data: {
        status: newStatus,
        currentLevel: startingLevel,
        submittedAt: new Date(),
        approvedAt: newStatus === 'APPROVED' ? new Date() : null,
      },
      include: this.requestInclude(),
    });

    if (newStatus === 'PENDING' && leaveType.isAccruable) {
      await this.balanceService.adjustPending(
        userId, request.leaveTypeId,
        request.startDate.getFullYear(), request.companyId, Number(request.totalDays),
      );
    }

    return updated;
  }

  // ── Hủy đơn (DRAFT / PENDING / APPROVED) ─────────────────────

  async cancelRequest(requestId: string, userId: string, dto: CancelLeaveRequestDto, isAdminOrApprover = false) {
    const request = await this.prisma.leaveRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Đơn xin phép không tồn tại');

    // Chỉ chủ đơn hoặc admin/approver mới có quyền hủy
    if (request.userId !== userId && !isAdminOrApprover) {
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
    }

    if (!['DRAFT', 'PENDING', 'APPROVED'].includes(request.status)) {
      throw new BadRequestException('Không thể hủy đơn đã bị từ chối hoặc đã hủy');
    }

    const updated = await this.prisma.leaveRequest.update({
      where: { id: requestId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: dto.cancelReason ?? null,
      },
      include: this.requestInclude(),
    });

    const leaveType = await this.prisma.leaveType.findUniqueOrThrow({ where: { id: request.leaveTypeId } });
    if (leaveType.isAccruable) {
      const year = request.startDate.getFullYear();
      const days = Number(request.totalDays);
      if (request.status === 'PENDING') {
        // Hoàn lại pending
        await this.balanceService.adjustPending(request.userId, request.leaveTypeId, year, request.companyId, -days);
      } else if (request.status === 'APPROVED') {
        // Hoàn lại used
        await this.prisma.leaveBalance.update({
          where: { userId_leaveTypeId_year: { userId: request.userId, leaveTypeId: request.leaveTypeId, year } },
          data: { used: { decrement: days } },
        });
      }
    }

    return updated;
  }

  // ── Xóa đơn nháp ──────────────────────────────────────────────

  async deleteRequest(requestId: string, userId: string) {
    const request = await this.findRequestForUser(requestId, userId);
    if (request.status !== 'DRAFT') {
      throw new BadRequestException('Chỉ có thể xóa đơn ở trạng thái Nháp');
    }
    await this.prisma.leaveRequest.delete({ where: { id: requestId } });
    return { success: true };
  }

  // ── Thêm bình luận ─────────────────────────────────────────────

  async addComment(requestId: string, userId: string, dto: AddLeaveCommentDto) {
    // Kiểm tra quyền xem đơn
    await this.getRequestById(requestId, userId);

    return this.prisma.leaveRequestComment.create({
      data: {
        requestId,
        userId,
        content: dto.content,
        isInternal: dto.isInternal ?? false,
      },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  // ── Duyệt hàng loạt ───────────────────────────────────────────

  async bulkApprove(approverId: string, dto: BulkApproveLeaveDto) {
    const results: { id: string; success: boolean; error?: string }[] = [];
    const approveDto = { action: dto.action, comment: dto.comment };

    for (const requestId of dto.requestIds) {
      try {
        await this.approvalService.processApproval(requestId, approverId, approveDto as any);
        results.push({ id: requestId, success: true });
      } catch (e: any) {
        results.push({ id: requestId, success: false, error: e?.message ?? 'Unknown error' });
      }
    }

    const successCount = results.filter(r => r.success).length;
    return { successCount, failCount: results.length - successCount, results };
  }

  // ── Query ───────────────────────────────────────────────────────

  async getMyApprover(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true, companyId: true, officeId: true,
        jobPosition: { select: { departmentId: true, jobName: true } },
      },
    });

    const flow = await this.approvalService.findMatchingFlow(
      user.companyId,
      null as any,
      user.officeId ?? null,
      user.jobPosition?.departmentId ?? null,
      userId,
      user.jobPosition?.jobName ?? null,
    );

    if (!flow) return { approvers: [], levelInfo: null };

    const levels: any[] = ((flow as any).levels ?? []).sort((a: any, b: any) => a.level - b.level);
    if (!levels.length) return { approvers: [], levelInfo: null };

    const userSelect = {
      id: true, firstName: true, lastName: true, employeeCode: true,
      jobPosition: { select: { jobName: true, department: { select: { id: true, name: true } } } },
    };

    const requesterDeptId = user.jobPosition?.departmentId ?? null;
    const requesterJobName = user.jobPosition?.jobName ?? null;
    const requesterOfficeId = user.officeId ?? null;

    for (const lvl of levels) {
      const approvers = await this.resolveApproversForLevel(
        lvl, requesterDeptId, requesterJobName, requesterOfficeId, userId, userSelect,
      );
      if (approvers.length > 0) {
        return {
          approvers,
          levelInfo: { level: lvl.level, approverMode: lvl.approverMode },
        };
      }
    }

    return { approvers: [], levelInfo: null };
  }

  private async resolveApproversForLevel(
    lvl: any,
    requesterDeptId: string | null,
    requesterJobName: string | null,
    requesterOfficeId: string | null,
    excludeUserId: string,
    userSelect: any,
  ): Promise<any[]> {
    const { approverMode, specificUserId, substitute1Id, substitute2Id,
            roleDefinitionId, targetDepartmentId } = lvl;

    const mainApprovers = await this.resolveMainApprovers(
      approverMode, specificUserId, substitute1Id, substitute2Id,
      roleDefinitionId, targetDepartmentId,
      requesterDeptId, requesterJobName, requesterOfficeId,
      excludeUserId, userSelect,
    );

    // Always append substitutes (they can approve regardless of mode)
    const subIds = [substitute1Id, substitute2Id]
      .filter((id: string | undefined) => id && id !== excludeUserId) as string[];
    if (subIds.length && approverMode !== 'SPECIFIC_USER') {
      const existingIds = new Set(mainApprovers.map((u: any) => u.id));
      const subs = await this.prisma.user.findMany({
        where: { id: { in: subIds }, isActive: true, NOT: { id: { in: [...existingIds] } } },
        select: userSelect,
      });
      return [...mainApprovers, ...subs];
    }

    return mainApprovers;
  }

  private async resolveMainApprovers(
    approverMode: string,
    specificUserId: string | null,
    substitute1Id: string | null,
    substitute2Id: string | null,
    roleDefinitionId: string | null,
    targetDepartmentId: string | null,
    requesterDeptId: string | null,
    requesterJobName: string | null,
    requesterOfficeId: string | null,
    excludeUserId: string,
    userSelect: any,
  ): Promise<any[]> {
    switch (approverMode) {
      case 'SPECIFIC_USER': {
        if (!specificUserId) return [];
        const ids = [specificUserId, substitute1Id, substitute2Id].filter(Boolean) as string[];
        return this.prisma.user.findMany({ where: { id: { in: ids }, isActive: true }, select: userSelect });
      }

      case 'DEPARTMENT_MANAGERS': {
        const deptId = targetDepartmentId ?? requesterDeptId;
        if (!deptId) return [];
        const records = await this.prisma.userDepartmentManagement.findMany({
          where: { departmentId: deptId, isActive: true },
          include: { user: { select: userSelect } },
        });
        return records.map((r: any) => r.user).filter((u: any) => u.id !== excludeUserId);
      }

      case 'ROLE_IN_DEPARTMENT': {
        if (!roleDefinitionId) return [];
        const roleUsers = await this.prisma.userRole.findMany({
          where: { roleDefinitionId, isActive: true },
          select: { userId: true },
        });
        const ids = roleUsers.map((r: any) => r.userId).filter((id: string) => id !== excludeUserId);

        const deptId = targetDepartmentId ?? requesterDeptId;

        if (deptId && requesterJobName) {
          // VTCV-first: strictly same dept + same VTCV only
          if (ids.length) {
            const vtcvApprovers = await this.prisma.user.findMany({
              where: { id: { in: ids }, isActive: true, jobPosition: { departmentId: deptId, jobName: requesterJobName } },
              select: userSelect,
            });
            if (vtcvApprovers.length) return vtcvApprovers;
          }
          // User has VTCV but no same-VTCV role approver → skip (substitutes added by caller)
          return [];
        }

        if (deptId && ids.length) {
          // No VTCV constraint: any role user in same dept or UDM manager
          const inDept = await this.prisma.user.findMany({
            where: { id: { in: ids }, isActive: true, jobPosition: { departmentId: deptId } },
            select: userSelect,
          });
          if (inDept.length) return inDept;
          // UDM fallback only when requester has no VTCV
          const udmRecords = await this.prisma.userDepartmentManagement.findMany({
            where: { departmentId: deptId, isActive: true, userId: { in: ids } },
            select: { userId: true },
          });
          const udmIds = udmRecords.map((r: any) => r.userId);
          if (udmIds.length) {
            return this.prisma.user.findMany({
              where: { id: { in: udmIds }, isActive: true },
              select: userSelect,
            });
          }
        }

        return [];
      }

      case 'ROLE_IN_OFFICE': {
        if (!roleDefinitionId || !requesterOfficeId) return [];
        const roleUsers = await this.prisma.userRole.findMany({
          where: { roleDefinitionId, isActive: true },
          select: { userId: true },
        });
        const ids = roleUsers.map((r: any) => r.userId).filter((id: string) => id !== excludeUserId);
        if (!ids.length) return [];
        return this.prisma.user.findMany({
          where: { id: { in: ids }, officeId: requesterOfficeId, isActive: true },
          select: userSelect,
        });
      }

      case 'ROLE_IN_COMPANY': {
        if (!roleDefinitionId) return [];
        const roleUsers = await this.prisma.userRole.findMany({
          where: { roleDefinitionId, isActive: true },
          select: { userId: true },
        });
        const ids = roleUsers.map((r: any) => r.userId).filter((id: string) => id !== excludeUserId);
        if (!ids.length) return [];
        return this.prisma.user.findMany({
          where: { id: { in: ids }, isActive: true },
          select: userSelect,
          take: 5,
        });
      }

      default:
        return [];
    }
  }

  async getMyRequests(userId: string, companyId: string, filters: {
    status?: string; leaveTypeId?: string; year?: number; page?: number; limit?: number;
  }) {
    const { status, leaveTypeId, year, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;
    const where: Prisma.LeaveRequestWhereInput = { userId, companyId };
    if (status) where.status = status as LeaveRequestStatus;
    if (leaveTypeId) where.leaveTypeId = leaveTypeId;
    if (year) {
      where.startDate = {
        gte: new Date(Date.UTC(year, 0, 1)),
        lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59)),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: this.requestInclude(),
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getRequestById(requestId: string, viewerId: string) {
    const request = await this.prisma.leaveRequest.findUnique({
      where: { id: requestId },
      include: {
        ...this.requestInclude(),
        comments: {
          where: { isInternal: false },
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'asc' },
        },
        approvals: {
          include: { approver: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { level: 'asc' },
        },
      },
    });
    if (!request) throw new NotFoundException('Đơn xin phép không tồn tại');

    // Compute whether the viewer can approve this request right now
    const canApproveThis = request.status === 'PENDING'
      ? await this.approvalService.canApproveRequest(requestId, viewerId)
      : false;

    return { ...request, canApproveThis };
  }

  // ── Pending approvals queue ────────────────────────────────────

  async getPendingForApprover(approverId: string, companyId: string) {
    return this.approvalService.getPendingRequestsForApprover(approverId, companyId);
  }

  // ── Admin: xem tất cả đơn ─────────────────────────────────────

  async getAllRequests(companyId: string | null, filters: {
    status?: string; leaveTypeId?: string; year?: number;
    userId?: string; page?: number; limit?: number;
  }) {
    const { status, leaveTypeId, year, userId, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;
    const where: Prisma.LeaveRequestWhereInput = {};
    if (companyId) where.companyId = companyId;   // null = SUPERADMIN sees all companies
    if (status) where.status = status as LeaveRequestStatus;
    if (leaveTypeId) where.leaveTypeId = leaveTypeId;
    if (userId) where.userId = userId;
    if (year) {
      where.startDate = {
        gte: new Date(Date.UTC(year, 0, 1)),
        lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59)),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: this.requestInclude(),
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    // Batch-resolve actual approver names for ROLE_* modes (single query per unique role+dept combo)
    const enriched = await this.enrichWithResolvedApprovers(data);
    return { data: enriched, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** Resolve actual user names for ROLE_IN_DEPARTMENT/ROLE_IN_COMPANY flow levels */
  private async enrichWithResolvedApprovers(requests: any[]) {
    if (!requests.length) return requests;

    return Promise.all(requests.map(async (req) => {
      const lvl = req.flow?.levels?.find((l: any) => l.level === (req.currentLevel ?? 1));
      if (!lvl) return req;

      const requesterOfficeId = req.user?.officeId ?? null;
      const requesterDeptId = lvl.targetDepartment?.id ?? req.user?.jobPosition?.department?.id ?? null;
      const requesterJobName = req.user?.jobPosition?.jobName ?? null;
      // Use raw IDs if available, fallback to nested object IDs
      const roleDefinitionId = lvl.roleDefinitionId ?? lvl.roleDefinition?.id ?? null;
      const specificUserId = lvl.specificUserId ?? lvl.specificUser?.id ?? null;
      let approvers: { id: string; firstName: string; lastName: string; employeeCode: string }[] = [];

      switch (lvl.approverMode) {
        case 'SPECIFIC_USER': {
          if (specificUserId) {
            const u = await this.prisma.user.findUnique({
              where: { id: specificUserId },
              select: { id: true, firstName: true, lastName: true, employeeCode: true },
            });
            if (u) approvers = [u];
          }
          break;
        }

        case 'ROLE_IN_COMPANY': {
          if (roleDefinitionId) {
            const roleUsers = await this.prisma.userRole.findMany({
              where: { roleDefinitionId, isActive: true },
              select: { userId: true },
            });
            const ids = roleUsers.map((r: any) => r.userId);
            if (ids.length) {
              approvers = await this.prisma.user.findMany({
                where: { id: { in: ids }, isActive: true },
                select: { id: true, firstName: true, lastName: true, employeeCode: true },
                take: 3,
              });
            }
          }
          break;
        }

        case 'ROLE_IN_OFFICE': {
          if (roleDefinitionId && requesterOfficeId) {
            const roleUsers = await this.prisma.userRole.findMany({
              where: { roleDefinitionId, isActive: true },
              select: { userId: true },
            });
            const ids = roleUsers.map((r: any) => r.userId);
            if (ids.length) {
              approvers = await this.prisma.user.findMany({
                where: { id: { in: ids }, officeId: requesterOfficeId, isActive: true },
                select: { id: true, firstName: true, lastName: true, employeeCode: true },
                take: 3,
              });
            }
          }
          break;
        }

        case 'ROLE_IN_DEPARTMENT': {
          if (roleDefinitionId && requesterDeptId) {
            const roleUsers = await this.prisma.userRole.findMany({
              where: { roleDefinitionId, isActive: true },
              select: { userId: true },
            });
            const ids = roleUsers.map((r: any) => r.userId);
            if (ids.length) {
              // VTCV-first: if requester has VTCV, prefer same-VTCV approvers in dept
              if (requesterJobName) {
                const vtcvApprovers = await this.prisma.user.findMany({
                  where: { id: { in: ids }, isActive: true, jobPosition: { departmentId: requesterDeptId, jobName: requesterJobName } },
                  select: { id: true, firstName: true, lastName: true, employeeCode: true },
                  take: 3,
                });
                if (vtcvApprovers.length > 0) { approvers = vtcvApprovers; break; }

                // Fallback: UDM managers of requester's dept (cross-dept managers)
                if (requesterDeptId) {
                  const udmRecords = await this.prisma.userDepartmentManagement.findMany({
                    where: { departmentId: requesterDeptId, isActive: true, userId: { in: ids } },
                    select: { userId: true },
                  });
                  const udmIds = udmRecords.map((r: any) => r.userId);
                  if (udmIds.length > 0) {
                    approvers = await this.prisma.user.findMany({
                      where: { id: { in: udmIds }, isActive: true },
                      select: { id: true, firstName: true, lastName: true, employeeCode: true },
                      take: 3,
                    });
                    if (approvers.length > 0) break;
                  }
                }
              }
              // No VTCV constraint: any approver in same dept
              approvers = await this.prisma.user.findMany({
                where: { id: { in: ids }, isActive: true, jobPosition: { departmentId: requesterDeptId } },
                select: { id: true, firstName: true, lastName: true, employeeCode: true },
                take: 3,
              });
            }
          }
          break;
        }

        case 'DEPARTMENT_MANAGERS': {
          if (requesterDeptId) {
            const mgmtRecords = await this.prisma.userDepartmentManagement.findMany({
              where: { departmentId: requesterDeptId, isActive: true },
              select: { userId: true, user: { select: { jobPosition: { select: { jobName: true } } } } },
            });
            const udmUserIds = mgmtRecords.map((m: any) => m.userId);

            if (udmUserIds.length && requesterJobName) {
              // VTCV-aware: check if any UDM member has same VTCV as requester
              const sameVtcvMgrs = mgmtRecords.filter((m: any) => m.user.jobPosition?.jobName === requesterJobName);
              if (sameVtcvMgrs.length > 0) {
                // Same VTCV match → only those managers
                approvers = await this.prisma.user.findMany({
                  where: { id: { in: sameVtcvMgrs.map((m: any) => m.userId) }, isActive: true },
                  select: { id: true, firstName: true, lastName: true, employeeCode: true },
                  take: 5,
                });
                break;
              }

              // No same-VTCV match → find tech-specific TPs and exclude them
              const techSpecificVtcvs: string[] = [];
              for (const udm of mgmtRecords as any[]) {
                const vtcv = udm.user.jobPosition?.jobName;
                if (!vtcv) continue;
                const nonMgr = await this.prisma.user.count({
                  where: { isActive: true, jobPosition: { departmentId: requesterDeptId, jobName: vtcv }, id: { notIn: udmUserIds } },
                });
                if (nonMgr > 0) techSpecificVtcvs.push(vtcv);
              }

              const eligibleIds = techSpecificVtcvs.length > 0
                ? mgmtRecords.filter((m: any) => !techSpecificVtcvs.includes(m.user.jobPosition?.jobName ?? '')).map((m: any) => m.userId)
                : udmUserIds;

              approvers = await this.prisma.user.findMany({
                where: { id: { in: eligibleIds }, isActive: true },
                select: { id: true, firstName: true, lastName: true, employeeCode: true },
                take: 5,
              });
            } else if (udmUserIds.length) {
              approvers = await this.prisma.user.findMany({
                where: { id: { in: udmUserIds }, isActive: true },
                select: { id: true, firstName: true, lastName: true, employeeCode: true },
                take: 5,
              });
            }
          }
          break;
        }
      }

      return { ...req, resolvedApprovers: approvers };
    }));
  }

  // ── Helpers ────────────────────────────────────────────────────

  private async findRequestForUser(requestId: string, userId: string) {
    const request = await this.prisma.leaveRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Đơn xin phép không tồn tại');
    if (request.userId !== userId) throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
    return request;
  }

  private async generateRequestNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.leaveRequest.count({
      where: { companyId, submittedAt: { gte: new Date(`${year}-01-01`) } },
    });
    return `LR-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  async getApprovedByMe(
    approverId: string,
    companyId: string,
    params: { year?: number; page?: number; limit?: number } = {},
  ) {
    const { year = new Date().getFullYear(), page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const where = {
      approverId,
      request: {
        companyId,
        submittedAt: {
          gte: new Date(`${year}-01-01`),
          lt: new Date(`${year + 1}-01-01`),
        },
      },
    };

    const [approvals, total] = await Promise.all([
      this.prisma.leaveApproval.findMany({
        where,
        orderBy: { actionAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          level: true,
          action: true,
          actionAt: true,
          request: {
            select: {
              id: true,
              requestNumber: true,
              status: true,
              startDate: true,
              endDate: true,
              totalDays: true,
              reason: true,
              submittedAt: true,
              user: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
              leaveType: { select: { id: true, name: true, nameVi: true, code: true } },
            },
          },
        },
      }),
      this.prisma.leaveApproval.count({ where }),
    ]);

    const data = approvals.map(a => ({
      ...(a.request as any),
      myApprovalLevel: a.level,
      myAction: a.action,
      myActionAt: a.actionAt,
    }));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  private requestInclude() {
    return {
      leaveType: {
          select: {
            id: true,
            code: true,
            name: true,
            categoryId: true,
            colorCode: true,
            category: { select: { id: true, code: true, name: true, leaveCategory: true } },
          },
        },
      user: {
        select: {
          id: true, firstName: true, lastName: true, employeeCode: true,
          officeId: true,
          jobPosition: { select: { department: { select: { id: true, name: true } }, jobName: true } },
        },
      },
      flow: {
        select: {
          id: true,
          name: true,
          levels: {
            where: { isActive: true },
            orderBy: { level: 'asc' as const },
            select: {
              id: true,
              level: true,
              approverMode: true,
              specificUser: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
              substitute1: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
              substitute2: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
              roleDefinition: { select: { id: true, code: true, name: true } },
              targetDepartment: { select: { id: true, name: true } },
            },
          },
        },
      },
      approvals: {
        select: {
          id: true,
          level: true,
          action: true,
          approver: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        },
        orderBy: { level: 'asc' as const },
      },
    } as const;
  }
}
