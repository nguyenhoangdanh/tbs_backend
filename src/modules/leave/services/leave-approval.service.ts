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
  // Logic: match theo companyId (+ parent hierarchy) + leaveTypeId + officeId + deptId
  // Traverses up the company hierarchy so flows created by SUPERADMIN (holding company)
  // are matched by employees in child companies.

  private async getCompanyHierarchy(companyId: string): Promise<string[]> {
    const ids: string[] = [companyId];
    let current = companyId;
    for (let depth = 0; depth < 6; depth++) {
      const company = await this.prisma.company.findUnique({
        where: { id: current },
        select: { parentCompanyId: true },
      });
      if (!company?.parentCompanyId) break;
      ids.push(company.parentCompanyId);
      current = company.parentCompanyId;
    }
    return ids;
  }

  async findMatchingFlow(
    companyId: string,
    leaveTypeId: string,
    officeId: string | null,
    departmentId: string | null,
    requesterId?: string,
    requesterJobName?: string | null,
  ) {
    const officeConditions = officeId
      ? [{ officeId }, { officeId: null }]
      : [{ officeId: null }];
    const deptConditions = departmentId
      ? [{ departmentId }, { departmentId: null }]
      : [{ departmentId: null }];

    // Traverse up company hierarchy so flows created by SUPERADMIN (holding company)
    // are also matched by employees in child companies
    const companyIds = await this.getCompanyHierarchy(companyId);

    const flows = await this.prisma.leaveApprovalFlow.findMany({
      where: {
        companyId: { in: companyIds },
        isActive: true,
        OR: [{ leaveTypeId }, { leaveTypeId: null }],
        AND: [
          { OR: officeConditions },
          { OR: deptConditions },
        ],
      },
      include: {
        levels: { where: { isActive: true }, orderBy: { level: 'asc' } },
        requesterFilters: { select: { userId: true } },
      },
      orderBy: { priority: 'desc' },
    });

    if (!flows.length) return null;

    // Đính kèm requesterFilterIds để dễ xử lý
    const enriched = flows.map((f) => ({
      ...f,
      requesterFilterIds: f.requesterFilters.map((r) => r.userId),
    }));

    // Loại bỏ flows có requesterFilter mà requesterId không nằm trong danh sách
    const eligible = enriched.filter((f) => {
      if (f.requesterFilterIds.length > 0) {
        return requesterId ? f.requesterFilterIds.includes(requesterId) : false;
      }
      return true;
    });

    if (!eligible.length) return null;

    // Ưu tiên: requesterFilter match > requesterJobNames match > catch-all
    // Sau đó: exact companyId > parent, more specific scope > priority
    return eligible.sort((a, b) => {
      // Flows with requesterFilter have highest priority
      const filterA = a.requesterFilterIds.length > 0 ? 16 : 0;
      const filterB = b.requesterFilterIds.length > 0 ? 16 : 0;
      // Flows with requesterJobNames that match the requester's VTCV
      const vtcvMatchA = a.requesterJobNames.length > 0 && requesterJobName && a.requesterJobNames.includes(requesterJobName) ? 8 : 0;
      const vtcvMatchB = b.requesterJobNames.length > 0 && requesterJobName && b.requesterJobNames.includes(requesterJobName) ? 8 : 0;
      // Skip flows with requesterJobNames that DON'T match
      const vtcvMismatchA = a.requesterJobNames.length > 0 && !vtcvMatchA ? -100 : 0;
      const vtcvMismatchB = b.requesterJobNames.length > 0 && !vtcvMatchB ? -100 : 0;

      const exactA = a.companyId === companyId ? 4 : 0;
      const exactB = b.companyId === companyId ? 4 : 0;
      const scopeA = (a.leaveTypeId ? 2 : 0) + (a.departmentId ? 1 : 0);
      const scopeB = (b.leaveTypeId ? 2 : 0) + (b.departmentId ? 1 : 0);

      const scoreA = filterA + vtcvMatchA + vtcvMismatchA + exactA + scopeA;
      const scoreB = filterB + vtcvMatchB + vtcvMismatchB + exactB + scopeB;
      return scoreB - scoreA || b.priority - a.priority;
    })[0] ?? null;
  }

  // ── Thực hiện phê duyệt/từ chối ──────────────────────────────

  async processApproval(requestId: string, approverId: string, dto: ApproveLeaveDto) {
    const request = await this.prisma.leaveRequest.findUnique({
      where: { id: requestId },
      include: {
        flow: { include: { levels: { where: { isActive: true }, orderBy: { level: 'asc' } } } },
        leaveType: true,
      user: { select: { id: true, companyId: true, officeId: true, jobPosition: { select: { departmentId: true, jobName: true } } } },
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
      // Duyệt → tìm cấp tiếp theo trong danh sách đã sắp xếp
      const sortedLevels = (request.flow?.levels ?? []).sort((a: any, b: any) => a.level - b.level);
      const currentIdx = sortedLevels.findIndex((l: any) => l.level === request.currentLevel);

      // Tìm cấp tiếp theo hợp lệ: bỏ qua các cấp mà người vừa duyệt là người duy nhất eligible
      const requesterInfo = {
        companyId: request.user.companyId,
        officeId: (request.user as any).officeId ?? '',
        jobPosition: {
          departmentId: (request.user as any).jobPosition?.departmentId ?? '',
          jobName: (request.user as any).jobPosition?.jobName ?? null,
        },
      };
      let nextIdx = currentIdx + 1;
      while (nextIdx < sortedLevels.length) {
        const candidateLevel = sortedLevels[nextIdx];
        // Kiểm tra có ai KHÁC approverId duyệt được không
        const hasOtherApprover = await this.hasEligibleApproverExcluding(candidateLevel, requesterInfo, approverId);
        if (hasOtherApprover) break; // có người khác → dừng ở đây
        // Không có ai khác → tự động skip (ghi lại log)
        this.logger.debug(`Auto-skip level ${candidateLevel.level}: no eligible approver other than ${approverId}`);
        nextIdx++;
      }
      const nextLevelConfig = nextIdx < sortedLevels.length ? sortedLevels[nextIdx] : null;

      if (nextLevelConfig) {
        // Chuyển lên cấp tiếp theo
        await this.prisma.leaveRequest.update({
          where: { id: requestId },
          data: { currentLevel: nextLevelConfig.level },
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
            jobPosition: { select: { departmentId: true, jobName: true } },
          },
        },
        approvals: { select: { approverId: true } },
      },
    });
    if (!request || request.status !== 'PENDING') return false;

    // Không được phép tự duyệt đơn của chính mình
    if ((request as any).userId === userId) return false;

    // Nếu người này đã duyệt rồi thì không duyệt lại nữa (chặn double-approval)
    const alreadyApproved = (request as any).approvals?.some((a: any) => a.approverId === userId);
    if (alreadyApproved) return false;

    // Nếu không có flow → ai có quyền approve (ADMIN/SUPERADMIN) đều duyệt được
    if (!request.flow) {
      return this.hasApprovePermission(userId);
    }

    const currentLevelConfig = request.flow.levels.find((l) => l.level === request.currentLevel);
    if (!currentLevelConfig) return false;

    return this.isEligibleApprover(currentLevelConfig, userId, {
      companyId: request.user.companyId,
      officeId: request.user.officeId ?? '',
      jobPosition: {
        departmentId: request.user.jobPosition?.departmentId ?? '',
        jobName: request.user.jobPosition?.jobName ?? null,
      },
    });
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
        jobPosition: { select: { departmentId: true, jobName: true } },
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
          // DEPARTMENT_MANAGERS: include both explicit targetDeptId AND null (resolved at runtime from requester's dept)
          ...(managedDeptIds.length > 0
            ? [{
                approverMode: ApproverMode.DEPARTMENT_MANAGERS,
                OR: [
                  { targetDepartmentId: { in: managedDeptIds } },
                  { targetDepartmentId: null }, // null = "use requester's dept", resolved in whereConditions below
                ],
              }]
            : []),
        ],
      },
      select: { flowId: true, level: true, approverMode: true, targetDepartmentId: true },
    });

    if (!eligibleLevels.length) {
      // Fallback: if the approver has company-wide approve permission, show flowId=null requests
      const canApproveAll = await this.hasApprovePermission(approverId);
      if (!canApproveAll) return { data: [], total: 0, nextCursor: null };

      const fallbackWhere: Prisma.LeaveRequestWhereInput = {
        companyId,
        status: 'PENDING',
        flowId: null,
        ...(cursor ? { id: { gt: cursor } } : {}),
      };
      const [data, total] = await Promise.all([
        this.prisma.leaveRequest.findMany({
          where: fallbackWhere, take: limit, orderBy: { submittedAt: 'asc' },
          include: {
            user: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
            leaveType: { select: { id: true, code: true, name: true, colorCode: true } },
          },
        }),
        this.prisma.leaveRequest.count({ where: fallbackWhere }),
      ]);
      return { data, total, nextCursor: data.length === limit ? data[data.length - 1].id : null };
    }

    // Build scope-aware where conditions per level (async để hỗ trợ VTCV lookup)
    const whereConditions: Prisma.LeaveRequestWhereInput[] = [];
    for (const el of eligibleLevels) {
      const base: Prisma.LeaveRequestWhereInput = {
        flowId: el.flowId,
        currentLevel: el.level,
        status: 'PENDING',
      };
      // Scope ROLE_IN_OFFICE: only see requests from users in same office as approver
      if (el.approverMode === 'ROLE_IN_OFFICE') {
        whereConditions.push({ ...base, user: { officeId: approver.officeId } });
        continue;
      }
      // Scope ROLE_IN_DEPARTMENT: filter by dept, then VTCV-aware
      if (el.approverMode === 'ROLE_IN_DEPARTMENT') {
        const approverJobName = approver.jobPosition?.jobName ?? null;
        // Dept từ flow level hoặc dept của approver
        const primaryDeptId = el.targetDepartmentId ?? approver.jobPosition?.departmentId;

        if (el.targetDepartmentId) {
          // Explicit target dept: scope tightly to that dept
          if (approverJobName) {
            whereConditions.push({ ...base, user: { jobPosition: { departmentId: el.targetDepartmentId, jobName: approverJobName } } });
          } else {
            whereConditions.push({ ...base, user: { jobPosition: { departmentId: el.targetDepartmentId } } });
          }
        } else {
          // No explicit target dept → use approver's own dept + VTCV (strict 3-condition check)
          // + UDM-managed depts (cross-dept manager via UserDepartmentManagement)
          if (primaryDeptId) {
            if (approverJobName) {
              whereConditions.push({ ...base, user: { jobPosition: { departmentId: primaryDeptId, jobName: approverJobName } } });
            } else {
              whereConditions.push({ ...base, user: { jobPosition: { departmentId: primaryDeptId } } });
            }
          } else if (approver.officeId) {
            // Approver has no dept → office-wide (pure management role)
            whereConditions.push({ ...base, user: { officeId: approver.officeId } });
          }
        }

        // UDM cross-dept: approver manages other depts (applied regardless of targetDepartmentId)
        for (const { departmentId: managedDeptId } of approver.managedDepartments) {
          if (managedDeptId === primaryDeptId) continue;
          if (approverJobName) {
            whereConditions.push({ ...base, user: { jobPosition: { departmentId: managedDeptId, jobName: approverJobName } } });
          } else {
            whereConditions.push({ ...base, user: { jobPosition: { departmentId: managedDeptId } } });
          }
        }
        continue;
      }
      // Scope DEPARTMENT_MANAGERS: VTCV-aware scoping
      if (el.approverMode === 'DEPARTMENT_MANAGERS') {
        const deptIds = el.targetDepartmentId ? [el.targetDepartmentId] : managedDeptIds;
        for (const deptId of deptIds) {
          const vtcvCondition = await this.buildDeptMgrVtcvCondition(approverId, deptId, approver.jobPosition?.jobName ?? null);
          whereConditions.push({ ...base, user: { jobPosition: { departmentId: deptId, ...vtcvCondition } } });
        }
        continue;
      }
      whereConditions.push(base);
    }

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

  /**
   * Tính level bắt đầu cho một đơn mới.
   * Bỏ qua level chỉ khi KHÔNG có ai (khác người tạo đơn) đủ điều kiện duyệt cấp đó.
   * Không skip chỉ vì người tạo đơn cũng có role đó — vẫn có thể có người khác duyệt.
   */
  async computeStartingLevel(
    flow: { levels: any[] },
    requesterId: string,
    requesterInfo: { companyId: string; officeId: string; jobPosition: { departmentId: string; jobName?: string | null } },
  ): Promise<number> {
    const sorted = [...flow.levels].sort((a, b) => a.level - b.level);
    for (const lvl of sorted) {
      const hasOtherApprover = await this.hasEligibleApproverExcluding(lvl, requesterInfo, requesterId);
      if (hasOtherApprover) {
        // Có người khác duyệt được → đây là level bắt đầu hợp lệ
        return lvl.level;
      }
      // Không có ai duyệt được (kể cả người tạo) → bỏ qua cấp này
      this.logger.debug(`Auto-advance past level ${lvl.level}: no eligible approver other than requester`);
    }
    return sorted[sorted.length - 1]?.level ?? 1;
  }

  /**
   * Kiểm tra có ít nhất 1 người (KHÁC requesterId) đủ điều kiện duyệt cấp này không.
   * Dùng để quyết định có nên skip level hay không.
   */
  private async hasEligibleApproverExcluding(
    levelConfig: any,
    requesterInfo: { companyId: string; officeId: string; jobPosition: { departmentId: string; jobName?: string | null } },
    excludeUserId: string,
  ): Promise<boolean> {
    const { approverMode, specificUserId, roleDefinitionId, targetDepartmentId,
            substitute1Id, substitute2Id } = levelConfig;

    // Substitutes (nếu là người khác) luôn hợp lệ
    if ((substitute1Id && substitute1Id !== excludeUserId) ||
        (substitute2Id && substitute2Id !== excludeUserId)) return true;

    switch (approverMode as ApproverMode) {
      case 'SPECIFIC_USER':
        return !!specificUserId && specificUserId !== excludeUserId;

      case 'ROLE_IN_COMPANY': {
        const count = await this.prisma.userRole.count({
          where: { roleDefinitionId, isActive: true, userId: { not: excludeUserId } },
        });
        return count > 0;
      }

      case 'ROLE_IN_OFFICE': {
        const usersWithRole = await this.prisma.userRole.findMany({
          where: { roleDefinitionId, isActive: true, userId: { not: excludeUserId } },
          select: { userId: true },
        });
        if (!usersWithRole.length) return false;
        const userIds = usersWithRole.map(u => u.userId);
        const count = await this.prisma.user.count({
          where: { id: { in: userIds }, officeId: requesterInfo.officeId },
        });
        return count > 0;
      }

      case 'ROLE_IN_DEPARTMENT': {
        const deptId = targetDepartmentId ?? requesterInfo.jobPosition?.departmentId;
        if (!deptId && !requesterInfo.officeId) return true;
        const usersWithRole = await this.prisma.userRole.findMany({
          where: { roleDefinitionId, isActive: true, userId: { not: excludeUserId } },
          select: { userId: true },
        });
        if (!usersWithRole.length) return false;
        const userIds = usersWithRole.map(u => u.userId);

        if (deptId) {
          const requesterJobName = requesterInfo.jobPosition?.jobName;
          if (requesterJobName) {
            // Case 1: same dept + same VTCV (strict 3-condition)
            const sameDeptSameVtcv = await this.prisma.user.count({
              where: { id: { in: userIds }, jobPosition: { departmentId: deptId, jobName: requesterJobName } },
            });
            if (sameDeptSameVtcv > 0) return true;

            // Case 2: UDM cross-dept manager (manages requester's dept)
            const udmManagers = await this.prisma.userDepartmentManagement.count({
              where: { userId: { in: userIds }, departmentId: deptId, isActive: true },
            });
            if (udmManagers > 0) return true;
          } else {
            // Requester không có VTCV → cùng phòng ban hoặc quản lý phòng là đủ
            const inDept = await this.prisma.user.count({
              where: { id: { in: userIds }, jobPosition: { departmentId: deptId } },
            });
            if (inDept > 0) return true;
            const managesDept = await this.prisma.userDepartmentManagement.count({
              where: { userId: { in: userIds }, departmentId: deptId, isActive: true },
            });
            if (managesDept > 0) return true;
          }
        }

        return false;
      }

      case 'DEPARTMENT_MANAGERS': {
        const deptId = targetDepartmentId ?? requesterInfo.jobPosition?.departmentId;
        if (!deptId) return false;
        const count = await this.prisma.userDepartmentManagement.count({
          where: { departmentId: deptId, isActive: true, userId: { not: excludeUserId } },
        });
        return count > 0;
      }

      default:
        return true;
    }
  }

  /**
   * @deprecated use hasEligibleApproverExcluding
   */
  private async hasEligibleApproverForLevel(
    levelConfig: any,
    requesterInfo: { companyId: string; officeId: string; jobPosition: { departmentId: string } },
  ): Promise<boolean> {
    const { approverMode, specificUserId, roleDefinitionId, targetDepartmentId,
            substitute1Id, substitute2Id } = levelConfig;

    // Substitutes are always valid
    if (substitute1Id || substitute2Id) return true;

    switch (approverMode as ApproverMode) {
      case 'SPECIFIC_USER':
        return !!specificUserId;

      case 'ROLE_IN_COMPANY': {
        const count = await this.prisma.userRole.count({
          where: { roleDefinitionId, isActive: true },
        });
        return count > 0;
      }

      case 'ROLE_IN_OFFICE': {
        const usersWithRole = await this.prisma.userRole.findMany({
          where: { roleDefinitionId, isActive: true },
          select: { userId: true },
        });
        if (!usersWithRole.length) return false;
        const userIds = usersWithRole.map(u => u.userId);
        const count = await this.prisma.user.count({
          where: { id: { in: userIds }, officeId: requesterInfo.officeId },
        });
        return count > 0;
      }

      case 'ROLE_IN_DEPARTMENT': {
        const deptId = targetDepartmentId ?? requesterInfo.jobPosition?.departmentId;
        if (!deptId && !requesterInfo.officeId) return true;
        const usersWithRole = await this.prisma.userRole.findMany({
          where: { roleDefinitionId, isActive: true },
          select: { userId: true },
        });
        if (!usersWithRole.length) return false;
        const userIds = usersWithRole.map(u => u.userId);
        if (deptId) {
          // Check approver in same dept OR manages the dept
          const inDept = await this.prisma.user.count({
            where: { id: { in: userIds }, jobPosition: { departmentId: deptId } },
          });
          if (inDept > 0) return true;
          const managesDept = await this.prisma.userDepartmentManagement.count({
            where: { userId: { in: userIds }, departmentId: deptId, isActive: true },
          });
          if (managesDept > 0) return true;
        }
        // Office-head fallback
        if (!targetDepartmentId && requesterInfo.officeId) {
          const inOffice = await this.prisma.user.count({
            where: { id: { in: userIds }, officeId: requesterInfo.officeId },
          });
          return inOffice > 0;
        }
        return false;
      }

      case 'DEPARTMENT_MANAGERS': {
        const deptId = targetDepartmentId ?? requesterInfo.jobPosition?.departmentId;
        if (!deptId) return false;
        const count = await this.prisma.userDepartmentManagement.count({
          where: { departmentId: deptId, isActive: true },
        });
        return count > 0;
      }

      default:
        return true;
    }
  }

  private async isEligibleApprover(
    levelConfig: any,
    userId: string,
    requesterInfo: { companyId: string; officeId: string; jobPosition: { departmentId: string; jobName?: string | null } },
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
        const deptId = targetDepartmentId ?? requesterInfo.jobPosition?.departmentId;
        if (!deptId && !requesterInfo.officeId) return true; // no constraint at all
        const approverUser = await this.prisma.user.findUnique({
          where: { id: userId },
          include: {
            jobPosition: { select: { departmentId: true, jobName: true } },
            managedDepartments: { select: { departmentId: true }, where: { isActive: true } },
          },
        });
        const approverDept = approverUser?.jobPosition?.departmentId;
        const approverJobName = approverUser?.jobPosition?.jobName ?? null;
        const managedDepts = (approverUser as any)?.managedDepartments?.map((d: any) => d.departmentId) ?? [];
        const requesterJobName = requesterInfo.jobPosition?.jobName;

        if (deptId) {
          if (requesterJobName) {
            // UDM cross-dept manager (manages requester's dept)
            if (managedDepts.includes(deptId)) return true;
            // Same dept + same VTCV (strict 3-condition: office + dept + VTCV)
            if (approverJobName === requesterJobName && approverDept === deptId) return true;
          } else {
            if (approverDept === deptId || managedDepts.includes(deptId)) return true;
          }
        }

        return false;
      }

      case 'DEPARTMENT_MANAGERS': {
        const deptId = targetDepartmentId ?? requesterInfo.jobPosition.departmentId;
        const isMgr = await this.prisma.userDepartmentManagement.findFirst({
          where: { userId, departmentId: deptId, isActive: true },
        });
        if (!isMgr) return false;

        // VTCV-aware: check if this manager is eligible for the requester's VTCV group
        const requesterJobName = requesterInfo.jobPosition?.jobName;
        if (!requesterJobName) return true;
        const approverUser = await this.prisma.user.findUnique({ where: { id: userId }, select: { jobPosition: { select: { jobName: true } } } });
        const approverJobName = approverUser?.jobPosition?.jobName ?? null;
        return this.isDeptMgrEligibleForVtcv(userId, approverJobName, deptId, requesterJobName);
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

  /**
   * Check if a DEPARTMENT_MANAGER is eligible to approve requests from a given VTCV group.
   * Rules:
   * - If manager's VTCV == requesterVtcv → eligible (same group)
   * - If manager is "tech-specific" (non-UDM workers share their VTCV) → eligible ONLY for their own VTCV
   * - If manager is "general management" (no non-UDM workers share their VTCV) → eligible for all groups
   *   not already covered by a tech-specific TP.
   */
  private async isDeptMgrEligibleForVtcv(
    managerId: string,
    managerJobName: string | null,
    deptId: string,
    requesterJobName: string,
  ): Promise<boolean> {
    if (managerJobName === requesterJobName) return true; // same VTCV → always eligible

    // Get all UDM members and their VTCVs for this dept
    const udmMembers = await this.prisma.userDepartmentManagement.findMany({
      where: { departmentId: deptId, isActive: true },
      select: { userId: true, user: { select: { jobPosition: { select: { jobName: true } } } } },
    });
    const udmUserIds = udmMembers.map((m) => m.userId);

    // Check if this manager is "general" (no non-UDM workers share their VTCV in dept)
    const isGeneralMgr = !managerJobName || await this.prisma.user.count({
      where: { isActive: true, jobPosition: { departmentId: deptId, jobName: managerJobName }, id: { notIn: udmUserIds } },
    }) === 0;

    if (!isGeneralMgr) {
      // Tech-specific TP: can only approve their own VTCV group
      return false; // managerJobName !== requesterJobName already checked above
    }

    // General manager: eligible if requester's VTCV is NOT covered by a tech-specific TP
    const techSpecificTpForRequester = udmMembers.find((m) => m.user.jobPosition?.jobName === requesterJobName);
    if (techSpecificTpForRequester) {
      // A UDM member has same VTCV as requester — check if they are tech-specific
      const nonMgrWithRequesterVtcv = await this.prisma.user.count({
        where: { isActive: true, jobPosition: { departmentId: deptId, jobName: requesterJobName }, id: { notIn: udmUserIds } },
      });
      if (nonMgrWithRequesterVtcv > 0) {
        // There's a tech-specific TP for the requester's group → general manager defers to them
        return false;
      }
    }
    return true; // general manager handles this group
  }

  /**
   * Build Prisma jobName filter for DEPARTMENT_MANAGERS pending queue scoping.
   * Returns the appropriate jobName condition for the WHERE clause.
   */
  private async buildDeptMgrVtcvCondition(
    managerId: string,
    deptId: string,
    managerJobName: string | null,
  ): Promise<{ jobName?: string | { notIn: string[] } }> {
    const udmMembers = await this.prisma.userDepartmentManagement.findMany({
      where: { departmentId: deptId, isActive: true },
      select: { userId: true, user: { select: { jobPosition: { select: { jobName: true } } } } },
    });
    const udmUserIds = udmMembers.map((m) => m.userId);

    // Is this manager "general" (no non-UDM workers share their VTCV)?
    const isGeneralMgr = !managerJobName || await this.prisma.user.count({
      where: { isActive: true, jobPosition: { departmentId: deptId, jobName: managerJobName }, id: { notIn: udmUserIds } },
    }) === 0;

    if (!isGeneralMgr) {
      // Tech-specific TP: only show their own VTCV group
      return managerJobName ? { jobName: managerJobName } : {};
    }

    // General manager: show all groups EXCEPT those covered by tech-specific TPs
    const techSpecificVtcvs: string[] = [];
    for (const udm of udmMembers) {
      const vtcv = udm.user.jobPosition?.jobName;
      if (!vtcv) continue;
      const nonMgr = await this.prisma.user.count({
        where: { isActive: true, jobPosition: { departmentId: deptId, jobName: vtcv }, id: { notIn: udmUserIds } },
      });
      if (nonMgr > 0) techSpecificVtcvs.push(vtcv);
    }

    return techSpecificVtcvs.length > 0 ? { jobName: { notIn: techSpecificVtcvs } } : {};
  }

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
