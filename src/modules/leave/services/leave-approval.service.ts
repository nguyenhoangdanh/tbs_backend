import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from 'src/common/prisma.service';
import { LeaveBalanceService } from './leave-balance.service';
import { ApproveLeaveDto, ApprovalDecision } from '../dto/leave-request/approve-leave.dto';
import { ApproverMode, LeaveApprovalAction, LeaveTimeoutAction, Prisma } from '@prisma/client';

@Injectable()
export class LeaveApprovalService {
  private readonly logger = new Logger(LeaveApprovalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly balanceService: LeaveBalanceService,
  ) {}

  // ── Tìm flow phù hợp nhất cho một đơn ────────────────────────
  // Logic: match theo companyId + leaveTypeId (or null) + officeId (or null) + deptId (or null)
  // Sort by priority DESC → chọn flow cao nhất

  async findMatchingFlow(
    companyId: string,
    leaveTypeId: string,
    officeId: string,
    departmentId: string,
  ) {
    const flows = await this.prisma.leaveApprovalFlow.findMany({
      where: {
        companyId,
        isActive: true,
        OR: [{ leaveTypeId }, { leaveTypeId: null }],
        AND: [
          { OR: [{ officeId }, { officeId: null }] },
          { OR: [{ departmentId }, { departmentId: null }] },
        ],
      },
      include: { levels: { where: { isActive: true }, orderBy: { level: 'asc' } } },
      orderBy: { priority: 'desc' },
    });

    if (!flows.length) return null;

    // Ưu tiên flow khớp nhiều điều kiện nhất
    return flows.sort((a, b) => {
      const scoreA = (a.leaveTypeId ? 4 : 0) + (a.officeId ? 2 : 0) + (a.departmentId ? 1 : 0);
      const scoreB = (b.leaveTypeId ? 4 : 0) + (b.officeId ? 2 : 0) + (b.departmentId ? 1 : 0);
      return scoreB - scoreA || b.priority - a.priority;
    })[0];
  }

  // ── Thực hiện phê duyệt/từ chối ──────────────────────────────

  async processApproval(requestId: string, approverId: string, dto: ApproveLeaveDto) {
    const request = await this.prisma.leaveRequest.findUnique({
      where: { id: requestId },
      include: {
        flow: { include: { levels: { where: { isActive: true }, orderBy: { level: 'asc' } } } },
        leaveType: true,
        user: { select: { id: true, companyId: true } },
      },
    });

    if (!request) throw new NotFoundException('Đơn xin phép không tồn tại');
    if (request.status !== 'PENDING') {
      throw new BadRequestException(`Đơn đang ở trạng thái ${request.status}, không thể xử lý`);
    }

    // Xác minh quyền duyệt
    const canApprove = await this.canApproveRequest(requestId, approverId);
    if (!canApprove) throw new BadRequestException('Bạn không có quyền duyệt đơn này');

    const { isSubstitute, targetUserId } = await this.resolveApproverContext(request, approverId);

    const action: LeaveApprovalAction = dto.action === ApprovalDecision.APPROVED ? 'APPROVED' : 'REJECTED';

    // Ghi lại bản ghi approval
    await this.prisma.leaveApproval.create({
      data: {
        requestId,
        level: request.currentLevel,
        approverId,
        targetUserId: targetUserId ?? null,
        isSubstitute,
        action,
        comment: dto.comment ?? null,
      },
    });

    if (action === 'REJECTED') {
      // Từ chối → cập nhật trạng thái đơn
      await this.prisma.leaveRequest.update({
        where: { id: requestId },
        data: { status: 'REJECTED', rejectedAt: new Date() },
      });
      // Hoàn lại số ngày pending
      if (request.leaveType.isAccruable) {
        await this.balanceService.adjustPending(
          request.userId, request.leaveTypeId,
          request.startDate.getFullYear(), request.companyId,
          -Number(request.totalDays),
        );
      }
    } else {
      // Duyệt → kiểm tra còn cấp tiếp theo không
      const nextLevel = request.currentLevel + 1;
      const hasNextLevel = request.flow?.levels.some((l) => l.level === nextLevel) ?? false;

      if (hasNextLevel) {
        // Chuyển lên cấp tiếp theo
        await this.prisma.leaveRequest.update({
          where: { id: requestId },
          data: { currentLevel: nextLevel },
        });
      } else {
        // Đã qua tất cả cấp → hoàn toàn duyệt
        await this.prisma.leaveRequest.update({
          where: { id: requestId },
          data: { status: 'APPROVED', approvedAt: new Date() },
        });
        // Chuyển pending → used
        if (request.leaveType.isAccruable) {
          await this.balanceService.confirmUsed(
            request.userId, request.leaveTypeId,
            request.startDate.getFullYear(), request.companyId,
            Number(request.totalDays),
          );
        }
      }
    }

    return this.prisma.leaveRequest.findUnique({
      where: { id: requestId },
      include: { leaveType: true, user: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  // ── Kiểm tra người dùng có quyền duyệt đơn không ─────────────

  async canApproveRequest(requestId: string, userId: string): Promise<boolean> {
    const request = await this.prisma.leaveRequest.findUnique({
      where: { id: requestId },
      include: {
        flow: { include: { levels: { where: { isActive: true }, orderBy: { level: 'asc' } } } },
        user: {
          select: {
            companyId: true, officeId: true,
            jobPosition: { select: { departmentId: true } },
          },
        },
      },
    });
    if (!request || request.status !== 'PENDING') return false;

    // Nếu không có flow → ai có quyền approve (ADMIN/SUPERADMIN) đều duyệt được
    if (!request.flow) {
      return this.hasApprovePermission(userId);
    }

    const currentLevelConfig = request.flow.levels.find((l) => l.level === request.currentLevel);
    if (!currentLevelConfig) return false;

    return this.isEligibleApprover(currentLevelConfig, userId, request.user);
  }

  // ── Lấy danh sách đơn đang chờ duyệt của một người ───────────
  // Performance: query bằng DB JOIN + index, cursor paginated

  async getPendingRequestsForApprover(
    approverId: string,
    companyId: string,
    cursor?: string,
    limit = 20,
  ) {
    const approver = await this.prisma.user.findUniqueOrThrow({
      where: { id: approverId },
      select: {
        id: true,
        companyId: true,
        officeId: true,
        roles: { select: { roleDefinitionId: true } },
        jobPosition: { select: { departmentId: true } },
        managedDepartments: { select: { departmentId: true } },
      },
    });

    const roleIds = approver.roles.map((r) => r.roleDefinitionId);
    const managedDeptIds = approver.managedDepartments.map((d) => d.departmentId);

    // Tìm tất cả flow levels mà người này có thể duyệt
    const eligibleLevels = await this.prisma.leaveApprovalFlowLevel.findMany({
      where: {
        isActive: true,
        OR: [
          // SPECIFIC_USER
          { approverMode: 'SPECIFIC_USER', specificUserId: approverId },
          // Substitute
          { substitute1Id: approverId },
          { substitute2Id: approverId },
          // ROLE_IN_COMPANY
          { approverMode: 'ROLE_IN_COMPANY', roleDefinitionId: { in: roleIds } },
          // ROLE_IN_OFFICE
          { approverMode: 'ROLE_IN_OFFICE', roleDefinitionId: { in: roleIds } },
          // ROLE_IN_DEPARTMENT
          { approverMode: 'ROLE_IN_DEPARTMENT', roleDefinitionId: { in: roleIds } },
          // DEPARTMENT_MANAGERS
          ...(managedDeptIds.length > 0
            ? [{ approverMode: ApproverMode.DEPARTMENT_MANAGERS, targetDepartmentId: { in: managedDeptIds } }]
            : []),
        ],
      },
      select: { flowId: true, level: true },
    });

    if (!eligibleLevels.length) return { data: [], total: 0, nextCursor: null };

    // Groupby flowId + level
    const flowLevelPairs = eligibleLevels.map((el) => ({ flowId: el.flowId, level: el.level }));

    const whereConditions: Prisma.LeaveRequestWhereInput[] = flowLevelPairs.map((fl) => ({
      flowId: fl.flowId,
      currentLevel: fl.level,
      status: 'PENDING',
      companyId,
    }));

    const where: Prisma.LeaveRequestWhereInput = {
      AND: [
        { OR: whereConditions },
        ...(cursor ? [{ id: { gt: cursor } }] : []),
      ],
    };

    const [data, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where, take: limit, orderBy: { submittedAt: 'asc' },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
          leaveType: { select: { id: true, code: true, name: true, colorCode: true } },
        },
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    const nextCursor = data.length === limit ? data[data.length - 1].id : null;
    return { data, total, nextCursor };
  }

  // ── Private helpers ────────────────────────────────────────────

  private async isEligibleApprover(
    levelConfig: any,
    userId: string,
    requesterInfo: { companyId: string; officeId: string; jobPosition: { departmentId: string } },
  ): Promise<boolean> {
    const { approverMode, specificUserId, roleDefinitionId, targetDepartmentId,
            substitute1Id, substitute2Id } = levelConfig;

    // Kiểm tra substitute trước
    if (substitute1Id === userId || substitute2Id === userId) return true;

    switch (approverMode as ApproverMode) {
      case 'SPECIFIC_USER':
        return specificUserId === userId;

      case 'ROLE_IN_COMPANY': {
        const hasRole = await this.prisma.userRole.findFirst({
          where: { userId, roleDefinitionId, isActive: true },
        });
        return !!hasRole;
      }

      case 'ROLE_IN_OFFICE': {
        const hasRole = await this.prisma.userRole.findFirst({
          where: { userId, roleDefinitionId, isActive: true },
        });
        if (!hasRole) return false;
        const approverUser = await this.prisma.user.findUnique({ where: { id: userId }, select: { officeId: true } });
        return approverUser?.officeId === requesterInfo.officeId;
      }

      case 'ROLE_IN_DEPARTMENT': {
        const hasRole = await this.prisma.userRole.findFirst({
          where: { userId, roleDefinitionId, isActive: true },
        });
        if (!hasRole) return false;
        const approverUser = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { jobPosition: { select: { departmentId: true } } },
        });
        return approverUser?.jobPosition?.departmentId === requesterInfo.jobPosition.departmentId;
      }

      case 'DEPARTMENT_MANAGERS': {
        const deptId = targetDepartmentId ?? requesterInfo.jobPosition.departmentId;
        const isMgr = await this.prisma.userDepartmentManagement.findFirst({
          where: { userId, departmentId: deptId, isActive: true },
        });
        return !!isMgr;
      }

      default:
        return false;
    }
  }

  private async resolveApproverContext(
    request: any,
    approverId: string,
  ): Promise<{ isSubstitute: boolean; targetUserId: string | null }> {
    const levelConfig = request.flow?.levels?.find((l: any) => l.level === request.currentLevel);
    if (!levelConfig) return { isSubstitute: false, targetUserId: null };

    const isSubstitute = levelConfig.substitute1Id === approverId || levelConfig.substitute2Id === approverId;
    const targetUserId = levelConfig.specificUserId ?? null;

    return { isSubstitute, targetUserId };
  }

  // Kiểm tra người dùng có quyền approve qua role (dùng khi không có flow cấu hình)
  private async hasApprovePermission(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        roles: {
          where: { isActive: true },
          include: {
            roleDefinition: {
              include: {
                permissions: {
                  where: { isGranted: true },
                  include: { permission: { select: { resource: true, action: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!user) return false;

    return user.roles.some((ur) =>
      ur.roleDefinition.permissions.some(
        (rdp) =>
          rdp.permission.resource === 'leave-approvals' &&
          (rdp.permission.action === 'approve' || rdp.permission.action === 'manage'),
      ),
    );
  }
}
