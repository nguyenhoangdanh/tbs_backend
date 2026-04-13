import {
  Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/common/prisma.service';
import { WebSocketGateway } from 'src/modules/websocket/websocket.gateway';
import { GatePassStatus, GatePassApprovalStatus } from '@prisma/client';
import { CreateGatePassDto } from '../dto/create-gate-pass.dto';
import { ApproveGatePassDto, RejectGatePassDto } from '../dto/approve-gate-pass.dto';
import { CreateApprovalConfigDto, UpdateApprovalConfigDto } from '../dto/approval-config.dto';

const USER_SELECT = {
  id: true, firstName: true, lastName: true, employeeCode: true,
  jobPosition: { select: { jobName: true, department: { select: { id: true, name: true } } } },
};

const CANDIDATE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  employeeCode: true,
  jobPosition: {
    select: {
      jobName: true,
      position: { select: { name: true, level: true } },
      department: { select: { id: true, name: true } },
    },
  },
};

@Injectable()
export class GatePassService {
  private readonly logger = new Logger(GatePassService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wsGateway: WebSocketGateway,
  ) {}

  // ── Tìm trưởng phòng/T.TEAM theo department ─────────────────
  // Ưu tiên: UserDepartmentManagement → fallback: position.isManagement cao nhất trong dept

  // ── Dept head resolution: UDM primary + position-based auto-detection fallback ──
  // Strategy:
  //  1. Check UserDepartmentManagement (explicit mapping)
  //  2. Fallback: find users in same dept + same VTCV with position.isManagement=true
  //     (lower position.level = higher rank — T.TEAM=5, NV=6)
  //     This auto-detects T.TEAM as approver without requiring UDM entry.

  /**
   * Get all dept IDs this user manages.
   * Primary: UDM records.
   * Fallback (per dept): if user has isManagement=true position and is the management
   * representative for their VTCV group in that dept.
   */
  private async getManagedDeptIds(userId: string, deptIds: string[]): Promise<string[]> {
    const udmRows = await this.prisma.userDepartmentManagement.findMany({
      where: { userId, isActive: true },
      select: { departmentId: true },
    });
    const udmDeptIds = new Set(udmRows.map((r) => r.departmentId));

    const approverUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        jobPosition: {
          select: {
            jobName: true,
            departmentId: true,
            position: { select: { level: true, isManagement: true } },
          },
        },
      },
    });

    const approverJobName = approverUser?.jobPosition?.jobName ?? null;
    const approverIsManagement = approverUser?.jobPosition?.position?.isManagement ?? false;
    const approverLevel = approverUser?.jobPosition?.position?.level ?? 999;
    // User must actually be in the dept to manage it via position-based fallback
    const approverDeptId = approverUser?.jobPosition?.departmentId ?? null;

    const result: string[] = [];
    for (const deptId of deptIds) {
      if (udmDeptIds.has(deptId)) {
        result.push(deptId);
        continue;
      }
      // Position-based fallback: user must be in THIS dept, have isManagement=true,
      // and be the highest-ranked (lowest level) management user for their VTCV in this dept.
      if (!approverIsManagement || !approverJobName || approverDeptId !== deptId) continue;

      const higherOrEqualMgr = await this.prisma.user.findFirst({
        where: {
          id: { not: userId },
          isActive: true,
          jobPosition: {
            departmentId: deptId,
            jobName: approverJobName,
            position: { isManagement: true, level: { lte: approverLevel } },
          },
        },
      });
      if (!higherOrEqualMgr) {
        // This user is the top manager for their VTCV group in this dept
        result.push(deptId);
      }
    }
    return result;
  }

  /**
   * Get management representative user IDs for a dept (UDM first, then position fallback).
   * Returns array of { userId, jobName } for VTCV-aware filtering.
   */
  private async getDeptManagers(deptId: string): Promise<Array<{ userId: string; jobName: string | null }>> {
    // Primary: UDM
    const udmRows = await this.prisma.userDepartmentManagement.findMany({
      where: { departmentId: deptId, isActive: true },
      select: { userId: true, user: { select: { jobPosition: { select: { jobName: true } } } } },
    });
    if (udmRows.length > 0) {
      return udmRows.map((r) => ({ userId: r.userId, jobName: r.user.jobPosition?.jobName ?? null }));
    }

    // Fallback: find all VTCV groups in this dept, pick their top manager (isManagement=true, lowest level)
    const vtcvGroups = await this.prisma.jobPosition.groupBy({
      by: ['jobName'],
      where: { departmentId: deptId, users: { some: { isActive: true } } },
    });

    const managers: Array<{ userId: string; jobName: string | null }> = [];
    for (const group of vtcvGroups) {
      if (!group.jobName) continue;
      const topMgr = await this.prisma.user.findFirst({
        where: {
          isActive: true,
          jobPosition: {
            departmentId: deptId,
            jobName: group.jobName,
            position: { isManagement: true },
          },
        },
        orderBy: { jobPosition: { position: { level: 'asc' } } },
        select: { id: true, jobPosition: { select: { jobName: true } } },
      });
      if (topMgr) {
        managers.push({ userId: topMgr.id, jobName: topMgr.jobPosition?.jobName ?? null });
      }
    }
    return managers;
  }

  /** Check if userId is an eligible dept head for the given dept and requester VTCV. */
  private async isDeptHead(
    userId: string,
    departmentId: string,
    requesterJobName?: string | null,
  ): Promise<boolean> {
    const managers = await this.getDeptManagers(departmentId);
    const managerIds = managers.map((m) => m.userId);

    if (managerIds.includes(userId)) {
      if (!requesterJobName) return true;
      const thisManager = managers.find((m) => m.userId === userId);
      const managerJobName = thisManager?.jobName ?? null;
      return this.isDeptMgrEligibleForVtcv(userId, managerJobName, departmentId, requesterJobName, managerIds);
    }

    // Not in UDM — check if they're a position-based manager (isManagement=true) for the requester's VTCV
    if (requesterJobName) {
      const isPosMgrForVtcv = await this.prisma.user.count({
        where: {
          id: userId,
          isActive: true,
          jobPosition: {
            departmentId,
            jobName: requesterJobName,
            position: { isManagement: true },
          },
        },
      });
      return isPosMgrForVtcv > 0;
    }

    return false;
  }

  /**
   * VTCV-aware eligibility check (same logic as leave system):
   * - Same VTCV as requester → always eligible
   * - General manager (no non-manager workers share their VTCV) → eligible for all groups
   *   not covered by a tech-specific TP (UDM OR position-based)
   * - Tech-specific TP → only their own VTCV group
   */
  private async isDeptMgrEligibleForVtcv(
    managerId: string,
    managerJobName: string | null,
    deptId: string,
    requesterJobName: string,
    managerIds?: string[],
  ): Promise<boolean> {
    if (managerJobName === requesterJobName) return true;

    const mgrIds = managerIds ?? (await this.getDeptManagers(deptId)).map((m) => m.userId);

    const isGeneralMgr = !managerJobName || (await this.prisma.user.count({
      where: { isActive: true, jobPosition: { departmentId: deptId, jobName: managerJobName }, id: { notIn: mgrIds } },
    })) === 0;

    if (!isGeneralMgr) return false;

    // General manager: eligible unless requester's VTCV is covered by a tech-specific TP
    // Check BOTH UDM managers AND position-based managers not in UDM
    const managers = await this.getDeptManagers(deptId);
    const techTpInUdm = managers.find((m) => m.jobName === requesterJobName);
    if (techTpInUdm) {
      const nonMgrWithVtcv = await this.prisma.user.count({
        where: { isActive: true, jobPosition: { departmentId: deptId, jobName: requesterJobName }, id: { notIn: mgrIds } },
      });
      if (nonMgrWithVtcv > 0) return false;
    }

    // Also check if there's a position-based manager (isManagement=true) for requesterJobName
    // who is NOT in UDM — they "own" that VTCV group
    const posMgrForVtcv = await this.prisma.user.count({
      where: {
        isActive: true,
        id: { notIn: mgrIds },
        jobPosition: { departmentId: deptId, jobName: requesterJobName, position: { isManagement: true } },
      },
    });
    if (posMgrForVtcv > 0) return false;

    return true;
  }

  /**
   * Build Prisma filter conditions for pending gate passes this dept head should see.
   * VTCV-aware: tech-specific TPs see only their VTCV; general managers see all others.
   * Checks both UDM and position-based managers.
   * If overrideApproverIds is set, user must be in the list; conditions show passes in scope
   * (still filtered by requesterJobName or requesterFilterIds if set).
   */
  private async buildDeptHeadPendingConditions(
    approverId: string,
    managedDeptIds: string[],
    configLevel: number,
    overrideApproverIds?: string[],
    requesterJobName?: string | null,
    requesterFilterIds?: string[],
    requesterJobNames?: string[],
  ): Promise<any[]> {
    if (managedDeptIds.length === 0) return [];

    // Normalize: use requesterJobNames array, fall back to legacy single requesterJobName
    const effectiveJobNames: string[] = requesterJobNames?.length ? requesterJobNames : (requesterJobName ? [requesterJobName] : []);

    // Build requester scope condition (requesterFilterIds > requesterJobNames)
    const requesterCondition: any = {};
    if (requesterFilterIds && requesterFilterIds.length > 0) {
      requesterCondition.userId = { in: requesterFilterIds };
    } else if (effectiveJobNames.length > 0) {
      requesterCondition.user = {
        jobPosition: { jobName: effectiveJobNames.length === 1 ? effectiveJobNames[0] : { in: effectiveJobNames } },
      };
    }

    // Override list: if approverId is in the list → see passes in scope
    if (overrideApproverIds && overrideApproverIds.length > 0) {
      if (!overrideApproverIds.includes(approverId)) return [];
      return managedDeptIds.map((deptId) => ({
        departmentId: deptId,
        currentLevel: configLevel,
        status: GatePassStatus.PENDING,
        NOT: { userId: approverId },
        ...requesterCondition,
      }));
    }

    const approverUser = await this.prisma.user.findUnique({
      where: { id: approverId },
      select: {
        jobPosition: { select: { jobName: true } },
        roles: {
          where: { isActive: true },
          select: { roleDefinition: { select: { code: true } } },
        },
      },
    });
    const approverJobName = approverUser?.jobPosition?.jobName ?? null;
    const approverRoleCodes = (approverUser?.roles ?? []).map((r: any) => r.roleDefinition?.code ?? '');
    const approverIsHighRole = approverRoleCodes.some((c: string) =>
      ['SUPERADMIN', 'ADMIN', 'MANAGER'].includes(c),
    );

    const conditions: any[] = [];

    for (const deptId of managedDeptIds) {
      const managers = await this.getDeptManagers(deptId);
      const mgrIds = managers.map((m) => m.userId);

      // General manager if: high system role, no VTCV, or no non-management users share their VTCV
      const isGeneralMgr = approverIsHighRole || !approverJobName || (await this.prisma.user.count({
        where: { isActive: true, jobPosition: { departmentId: deptId, jobName: approverJobName }, id: { notIn: mgrIds } },
      })) === 0;

      if (!isGeneralMgr) {
        // Tech-specific manager: only sees their VTCV, still within requester filter
        const condition: any = {
          departmentId: deptId,
          currentLevel: configLevel,
          status: GatePassStatus.PENDING,
          NOT: { userId: approverId },
          user: { jobPosition: { jobName: approverJobName } },
        };
        // If requesterFilterIds is set, further restrict to those users
        if (requesterFilterIds && requesterFilterIds.length > 0) {
          condition.userId = { in: requesterFilterIds };
          delete condition.user; // userId filter takes priority
        }
        conditions.push(condition);
      } else {
        // Collect VTCVs covered by tech-specific TPs (from UDM)
        const techSpecificVtcvs: string[] = [];
        for (const mgr of managers) {
          if (mgr.userId === approverId) continue;
          const vtcv = mgr.jobName;
          if (!vtcv) continue;
          const nonMgr = await this.prisma.user.count({
            where: { isActive: true, jobPosition: { departmentId: deptId, jobName: vtcv }, id: { notIn: mgrIds } },
          });
          if (nonMgr > 0) techSpecificVtcvs.push(vtcv);
        }
        // Also collect VTCVs covered by position-based managers NOT in UDM
        const posMgrsNotInUdm = await this.prisma.jobPosition.findMany({
          where: {
            departmentId: deptId,
            position: { isManagement: true },
            users: { some: { isActive: true, id: { notIn: [...mgrIds, approverId] } } },
          },
          select: { jobName: true },
          distinct: ['jobName'],
        });
        for (const pm of posMgrsNotInUdm) {
          if (pm.jobName && !techSpecificVtcvs.includes(pm.jobName)) {
            techSpecificVtcvs.push(pm.jobName);
          }
        }

        const base: any = {
          departmentId: deptId,
          currentLevel: configLevel,
          status: GatePassStatus.PENDING,
          NOT: { userId: approverId }, // never show own pass
          ...requesterCondition,
        };
        if (techSpecificVtcvs.length > 0 && !requesterCondition.userId && !requesterCondition.user) {
          base.user = { jobPosition: { jobName: { notIn: techSpecificVtcvs } } };
        }
        conditions.push(base);
      }
    }
    return conditions;
  }


  private async generatePassNumber(companyId?: string): Promise<string> {
    const year = new Date().getFullYear().toString().slice(-2);
    const prefix = `GP${year}`;

    // Find the highest existing passNumber for this year to avoid collisions
    // (count-based approach breaks when records are deleted or on concurrent inserts)
    const last = await this.prisma.gatePass.findFirst({
      where: { passNumber: { startsWith: prefix } },
      orderBy: { passNumber: 'desc' },
      select: { passNumber: true },
    });

    let next = 1;
    if (last?.passNumber) {
      const seq = parseInt(last.passNumber.slice(prefix.length), 10);
      if (!isNaN(seq)) next = seq + 1;
    }

    // Retry with incremented sequence on collision (P2002)
    return `${prefix}${String(next).padStart(4, '0')}`;
  }

  private async generatePassNumberSafe(companyId?: string): Promise<string> {
    // Retry up to 5 times on collision
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = await this.generatePassNumber(companyId);
      const exists = await this.prisma.gatePass.findUnique({
        where: { passNumber: candidate },
        select: { passNumber: true },
      });
      if (!exists) return candidate;
    }
    // Last resort: append random suffix to guarantee uniqueness
    const year = new Date().getFullYear().toString().slice(-2);
    return `GP${year}${Date.now().toString().slice(-6)}`;
  }

  // ── Lấy approver configs theo officeId hoặc departmentId ──────

  private async getApprovalConfigs(
    _userId: string,
    departmentId: string | null,
    officeId: string | null,
  ) {
    const overrideInclude = {
      overrideApprovers: { select: { userId: true } },
      requesterFilters: { select: { userId: true } },
    };

    // Merge dept-level and office-level configs.
    // Dept-level takes precedence per level (replaces office-level for the same level number).
    const deptConfigs = departmentId
      ? await this.prisma.gatePassApprovalConfig.findMany({
          where: { departmentId, isActive: true },
          orderBy: { level: 'asc' },
          include: {
            approver: { select: USER_SELECT },
            substitute: { select: USER_SELECT },
            department: { select: { id: true, name: true } },
            ...overrideInclude,
          },
        })
      : [];

    const officeConfigs = officeId
      ? await this.prisma.gatePassApprovalConfig.findMany({
          where: { officeId, isActive: true },
          orderBy: { level: 'asc' },
          include: {
            approver: { select: USER_SELECT },
            substitute: { select: USER_SELECT },
            office: { select: { id: true, name: true } },
            ...overrideInclude,
          },
        })
      : [];

    if (deptConfigs.length === 0 && officeConfigs.length === 0) {
      return { configs: [], configType: null };
    }

    // Build merged list: dept-level overrides office-level for the same level number
    const deptLevels = new Set(deptConfigs.map((c) => c.level));
    const merged = [
      ...deptConfigs,
      ...officeConfigs.filter((c) => !deptLevels.has(c.level)),
    ].sort((a, b) => a.level - b.level);

    // Normalise: add overrideApproverIds and requesterFilterIds as string[] for easy access
    const normalised = merged.map((c: any) => ({
      ...c,
      overrideApproverIds: (c.overrideApprovers ?? []).map((o: any) => o.userId),
      requesterFilterIds: (c.requesterFilters ?? []).map((f: any) => f.userId),
    }));

    const configType = deptConfigs.length > 0 ? 'department' : 'office';
    return { configs: normalised, configType: configType as 'department' | 'office' };
  }

  /**
   * Khi cùng một scope+level có nhiều config (mỗi config cho một VTCV hoặc danh sách người dùng khác nhau),
   * chọn config phù hợp nhất với người tạo đơn.
   * Ưu tiên: requesterFilterIds (chứa requesterId) > requesterJobName > null (áp dụng cho tất cả).
   */
  private pickConfigForRequester(configs: any[], level: number, requesterJobName?: string | null, requesterId?: string) {
    const atLevel = configs.filter((c) => c.level === level);
    if (atLevel.length === 0) return undefined;

    // Priority 1: specific requester filter containing this user
    if (requesterId) {
      const exact = atLevel.find(
        (c) => c.requesterFilterIds?.length > 0 && c.requesterFilterIds.includes(requesterId),
      );
      if (exact) return exact;
    }

    // Priority 2: VTCV filter (no requester filter) — supports both array and legacy single string
    if (requesterJobName) {
      const exact = atLevel.find((c) => {
        if (c.requesterFilterIds?.length > 0) return false;
        const names: string[] = c.requesterJobNames?.length > 0 ? c.requesterJobNames : (c.requesterJobName ? [c.requesterJobName] : []);
        return names.includes(requesterJobName);
      });
      if (exact) return exact;
    }

    // Priority 3: catch-all (no VTCV and no requester filter)
    return atLevel.find((c) => {
      const names: string[] = c.requesterJobNames?.length > 0 ? c.requesterJobNames : (c.requesterJobName ? [c.requesterJobName] : []);
      return names.length === 0 && !(c.requesterFilterIds?.length > 0);
    }) ?? atLevel[0];
  }

  // ── Tạo đơn xin giấy ra vào cổng ────────────────────────────

  async create(userId: string, dto: CreateGatePassDto) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true, companyId: true, firstName: true, lastName: true, employeeCode: true,
        officeId: true,
        jobPosition: { select: { jobName: true, department: { select: { id: true, name: true } } } },
        office: { select: { id: true, name: true } },
      },
    });

    const departmentId = user.jobPosition?.department?.id ?? null;
    const officeId = user.officeId ?? null;
    const passNumber = await this.generatePassNumberSafe(user.companyId);

    const isDraft = dto.draft === true;

    const gatePass = await this.prisma.gatePass.create({
      data: {
        passNumber,
        userId,
        departmentId,
        companyId: user.companyId,
        reasonType: dto.reasonType,
        reasonDetail: dto.reasonDetail,
        destination: dto.destination,
        startDateTime: new Date(dto.startDateTime),
        endDateTime: dto.endDateTime ? new Date(dto.endDateTime) : null,
        status: isDraft ? GatePassStatus.DRAFT : GatePassStatus.PENDING,
        currentLevel: isDraft ? null : 1,
      },
    });

    if (!isDraft) {
      const requesterJobName = user.jobPosition?.jobName ?? null;
      await this.notifyApprovers(gatePass.id, departmentId, officeId, 1, {
        type: 'GATE_PASS_PENDING_APPROVAL',
        title: 'Có giấy ra vào cổng mới cần duyệt',
        message: `${user.lastName} ${user.firstName} (${user.employeeCode}) vừa tạo giấy ra vào cổng`,
        data: { gatePassId: gatePass.id },
      }, requesterJobName, userId);
    }

    return this.findById(gatePass.id);
  }

  // ── Nộp nháp ─────────────────────────────────────────────────

  async submitDraft(id: string, userId: string) {
    const gatePass = await this.findById(id);
    if (gatePass.userId !== userId) throw new ForbiddenException('Không có quyền nộp đơn này');
    if (gatePass.status !== GatePassStatus.DRAFT) {
      throw new BadRequestException('Chỉ có thể nộp đơn ở trạng thái nháp');
    }

    await this.prisma.gatePass.update({
      where: { id },
      data: { status: GatePassStatus.PENDING, currentLevel: 1 },
    });

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        firstName: true, lastName: true, employeeCode: true, officeId: true,
        jobPosition: { select: { jobName: true, department: { select: { id: true } } } },
      },
    });
    const departmentId = user.jobPosition?.department?.id ?? null;
    const officeId = user.officeId ?? null;
    const requesterJobName = user.jobPosition?.jobName ?? null;

    await this.notifyApprovers(id, departmentId, officeId, 1, {
      type: 'GATE_PASS_PENDING_APPROVAL',
      title: 'Có giấy ra vào cổng mới cần duyệt',
      message: `${user.lastName} ${user.firstName} (${user.employeeCode}) vừa nộp giấy ra vào cổng`,
      data: { gatePassId: id },
    }, requesterJobName, userId);

    return this.findById(id);
  }

  // ── Huỷ đơn (chỉ khi chưa có ai duyệt) ─────────────────────

  async cancel(id: string, userId: string) {
    const gatePass = await this.findById(id);
    if (gatePass.userId !== userId) throw new ForbiddenException('Không có quyền huỷ đơn này');
    if (gatePass.status !== GatePassStatus.PENDING) {
      throw new BadRequestException('Chỉ có thể huỷ đơn khi còn chờ duyệt');
    }
    const actioned = (gatePass as any).approvals?.some(
      (a: any) => a.status === 'APPROVED' || a.status === 'REJECTED',
    );
    if (actioned) {
      throw new BadRequestException('Không thể huỷ đơn khi đã có người duyệt');
    }
    await this.prisma.gatePass.update({ where: { id }, data: { status: GatePassStatus.CANCELLED } });
    return this.findById(id);
  }

  // ── Danh sách đơn của tôi ────────────────────────────────────

  async getMyPasses(userId: string, query: { status?: string; page?: number; limit?: number }) {
    const { status, page = 1, limit = 20 } = query;
    const where: any = { userId };
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.gatePass.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: USER_SELECT },
          department: { select: { id: true, name: true } },
          approvals: {
            orderBy: { approvalLevel: 'asc' },
            include: { approver: { select: USER_SELECT } },
          },
        },
      }),
      this.prisma.gatePass.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  // ── Danh sách đơn chờ tôi duyệt ─────────────────────────────

  async getPendingMyApproval(approverId: string, query: { page?: number; limit?: number }) {
    const { page = 1, limit = 20 } = query;

    this.logger.debug(`[getPendingMyApproval] approverId=${approverId}`);

    // Case 1: User is SPECIFIC_USER approver/substitute in some config
    const specificConfigsRaw = await this.prisma.gatePassApprovalConfig.findMany({
      where: {
        isActive: true,
        approverType: 'SPECIFIC_USER',
        OR: [{ approverUserId: approverId }, { substituteUserId: approverId }],
      },
      include: { requesterFilters: { select: { userId: true } } },
    });
    const specificConfigs = specificConfigsRaw.map((c: any) => ({
      ...c,
      requesterFilterIds: (c.requesterFilters ?? []).map((f: any) => f.userId),
    }));

    this.logger.debug(`[getPendingMyApproval] specificConfigs=${specificConfigs.length}, ids=${specificConfigs.map(c => c.id).join(',')}`);

    // Case 2: DEPARTMENT_HEAD configs — resolve via UDM or position-based fallback
    const allDeptHeadConfigs = await this.prisma.gatePassApprovalConfig.findMany({
      where: { isActive: true, approverType: 'DEPARTMENT_HEAD' },
      include: {
        overrideApprovers: { select: { userId: true } },
        requesterFilters: { select: { userId: true } },
      },
    });
    // Normalise overrideApproverIds and requesterFilterIds
    const deptHeadCfgs = allDeptHeadConfigs.map((c: any) => ({
      ...c,
      overrideApproverIds: (c.overrideApprovers ?? []).map((o: any) => o.userId),
      requesterFilterIds: (c.requesterFilters ?? []).map((f: any) => f.userId),
    }));

    // Collect all dept IDs that appear in these configs (via office or direct dept)
    const candidateDeptIds = new Set<string>();
    for (const cfg of deptHeadCfgs) {
      if (cfg.officeId) {
        const depts = await this.prisma.department.findMany({
          where: { officeId: cfg.officeId },
          select: { id: true },
        });
        depts.forEach((d) => candidateDeptIds.add(d.id));
      } else if (cfg.departmentId) {
        candidateDeptIds.add(cfg.departmentId);
      }
    }

    const managedDeptIds = await this.getManagedDeptIds(approverId, [...candidateDeptIds]);

    this.logger.debug(`[getPendingMyApproval] candidateDeptIds=${[...candidateDeptIds].join(',')}, managedDeptIds=${managedDeptIds.join(',')}`);

    const conditions: any[] = [];

    // From specific configs — NEVER show the approver's own passes
    for (const cfg of specificConfigs) {
      // Build requester scope condition (requesterFilterIds > requesterJobName)
      const specRequesterCond: any = {};
      if (cfg.requesterFilterIds?.length > 0) {
        specRequesterCond.userId = { in: cfg.requesterFilterIds };
      }

      if (cfg.officeId) {
        // Find all dept IDs in this office to filter by departmentId (more reliable than user.officeId)
        const deptsInOffice = await this.prisma.department.findMany({
          where: { officeId: cfg.officeId },
          select: { id: true },
        });
        const allDeptIdsInOffice = deptsInOffice.map((d) => d.id);

        const deptsWithOwnConfig = await this.prisma.gatePassApprovalConfig.findMany({
          where: {
            department: { officeId: cfg.officeId },
            level: cfg.level,
            isActive: true,
          },
          select: { departmentId: true },
        });
        const overriddenDeptIds = new Set(deptsWithOwnConfig.map((d) => d.departmentId).filter(Boolean) as string[]);
        const scopeDeptIds = allDeptIdsInOffice.filter((id) => !overriddenDeptIds.has(id));

        if (scopeDeptIds.length === 0) continue;

        const specJobNames: string[] = cfg.requesterJobNames?.length > 0 ? cfg.requesterJobNames : (cfg.requesterJobName ? [cfg.requesterJobName] : []);

        const condition: any = {
          currentLevel: cfg.level,
          status: GatePassStatus.PENDING,
          NOT: { userId: approverId },
          ...specRequesterCond,
        };

        if (specRequesterCond.userId) {
          // requesterFilterIds takes priority — no further dept/user filter needed
        } else if (specJobNames.length > 0) {
          condition.departmentId = { in: scopeDeptIds };
          condition.user = { jobPosition: { jobName: specJobNames.length === 1 ? specJobNames[0] : { in: specJobNames } } };
        } else {
          condition.departmentId = { in: scopeDeptIds };
        }

        conditions.push(condition);
      } else if (cfg.departmentId) {
        conditions.push({
          departmentId: cfg.departmentId,
          currentLevel: cfg.level,
          status: GatePassStatus.PENDING,
          NOT: { userId: approverId },
          ...(cfg.requesterFilterIds?.length > 0
            ? { userId: { in: cfg.requesterFilterIds } }
            : (() => {
                const jns: string[] = cfg.requesterJobNames?.length > 0 ? cfg.requesterJobNames : (cfg.requesterJobName ? [cfg.requesterJobName] : []);
                return jns.length > 0 ? { user: { jobPosition: { jobName: jns.length === 1 ? jns[0] : { in: jns } } } } : {};
              })()),
        });
      }
    }

    // From department head configs — check both natural management and override list
    for (const cfg of deptHeadCfgs) {
      let scopeDeptIds: string[];

      if (cfg.officeId) {
        const deptsInOffice = await this.prisma.department.findMany({
          where: { officeId: cfg.officeId },
          select: { id: true },
        });
        const allInOffice = deptsInOffice.map((d) => d.id);
        // Exclude depts overridden by their own dept-level config
        const deptsWithOwnConfig = await this.prisma.gatePassApprovalConfig.findMany({
          where: {
            departmentId: { in: allInOffice },
            level: cfg.level,
            isActive: true,
          },
          select: { departmentId: true },
        });
        const overriddenDeptIds = new Set(deptsWithOwnConfig.map((d) => d.departmentId));
        scopeDeptIds = allInOffice.filter((id) => !overriddenDeptIds.has(id));
      } else if (cfg.departmentId) {
        scopeDeptIds = [cfg.departmentId];
      } else {
        continue;
      }

      if (scopeDeptIds.length === 0) continue;

      const hasOverride = cfg.overrideApproverIds.includes(approverId);
      const naturallyManagedInScope = scopeDeptIds.filter((id) => managedDeptIds.includes(id));
      if (!hasOverride && naturallyManagedInScope.length === 0) continue;

      const relevantDeptIds = hasOverride ? scopeDeptIds : naturallyManagedInScope;
      const vtcvConditions = await this.buildDeptHeadPendingConditions(
        approverId, relevantDeptIds, cfg.level, cfg.overrideApproverIds, cfg.requesterJobName, cfg.requesterFilterIds, cfg.requesterJobNames,
      );
      conditions.push(...vtcvConditions);
    }

    this.logger.debug(`[getPendingMyApproval] total conditions=${conditions.length}: ${JSON.stringify(conditions)}`);

    if (conditions.length === 0) return { data: [], total: 0, page, limit };

    const where = { OR: conditions };

    const [data, total] = await Promise.all([
      this.prisma.gatePass.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: USER_SELECT },
          department: { select: { id: true, name: true } },
          approvals: {
            orderBy: { approvalLevel: 'asc' },
            include: { approver: { select: USER_SELECT } },
          },
        },
      }),
      this.prisma.gatePass.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async getPendingMyApprovalCount(approverId: string): Promise<number> {
    const result = await this.getPendingMyApproval(approverId, { page: 1, limit: 1 });
    return result.total;
  }

  // ── Xem chi tiết ─────────────────────────────────────────────

  async findById(id: string) {
    const gatePass = await this.prisma.gatePass.findUnique({
      where: { id },
      include: {
        user: { select: USER_SELECT },
        department: { select: { id: true, name: true } },
        company: { select: { id: true, name: true } },
        approvals: {
          orderBy: { approvalLevel: 'asc' },
          include: { approver: { select: USER_SELECT } },
        },
      },
    });
    if (!gatePass) throw new NotFoundException('Không tìm thấy giấy ra vào cổng');
    return gatePass;
  }

  // ── Phê duyệt ────────────────────────────────────────────────

  async approve(gatePassId: string, approverId: string, dto: ApproveGatePassDto) {
    const gatePass = await this.findById(gatePassId);

    if (gatePass.status !== GatePassStatus.PENDING) {
      throw new BadRequestException('Giấy ra vào cổng không ở trạng thái chờ duyệt');
    }

    if (approverId === gatePass.userId) {
      throw new ForbiddenException('Không thể tự duyệt đơn của chính mình');
    }

    const officeId = await this.getUserOfficeId(gatePass.userId);
    const requesterJobName = (gatePass.user as any).jobPosition?.jobName ?? null;
    const canApprove = await this.verifyApprover(approverId, gatePass.departmentId, officeId, gatePass.currentLevel, requesterJobName, gatePass.userId);
    if (!canApprove) throw new ForbiddenException('Bạn không có quyền duyệt đơn này');

    await this.prisma.gatePassApproval.upsert({
      where: { gatePassId_approvalLevel: { gatePassId, approvalLevel: gatePass.currentLevel } },
      create: { gatePassId, approverId, approvalLevel: gatePass.currentLevel, status: GatePassApprovalStatus.APPROVED, approvedAt: new Date(), comment: dto.comment },
      update: { status: GatePassApprovalStatus.APPROVED, approvedAt: new Date(), approverId, comment: dto.comment },
    });

    // Check if there's a next level config (VTCV-aware)
    const { configs } = await this.getApprovalConfigs('', gatePass.departmentId, officeId);
    const nextConfig = this.pickConfigForRequester(configs, gatePass.currentLevel + 1, requesterJobName, gatePass.userId);

    if (nextConfig) {
      await this.prisma.gatePass.update({
        where: { id: gatePassId },
        data: { currentLevel: gatePass.currentLevel + 1 },
      });

      await this.notifyApprovers(gatePassId, gatePass.departmentId, officeId, nextConfig.level, {
        type: 'GATE_PASS_PENDING_APPROVAL',
        title: `Giấy ra vào cổng chờ duyệt cấp ${nextConfig.level}`,
        message: `Giấy ra vào cổng #${gatePass.passNumber} đã qua duyệt cấp ${gatePass.currentLevel}, chờ duyệt cấp ${nextConfig.level}`,
        data: { gatePassId },
      }, requesterJobName, gatePass.userId);
    } else {
      await this.prisma.gatePass.update({
        where: { id: gatePassId },
        data: { status: GatePassStatus.APPROVED },
      });

      this.wsGateway.sendNotification(gatePass.userId, {
        type: 'GATE_PASS_APPROVED',
        title: 'Giấy ra vào cổng đã được duyệt',
        message: `Giấy ra vào cổng #${gatePass.passNumber} đã được phê duyệt`,
        data: { gatePassId },
        timestamp: new Date(),
      });
    }

    return this.findById(gatePassId);
  }

  // ── Từ chối ──────────────────────────────────────────────────

  async reject(gatePassId: string, approverId: string, dto: RejectGatePassDto) {
    const gatePass = await this.findById(gatePassId);

    if (gatePass.status !== GatePassStatus.PENDING) {
      throw new BadRequestException('Giấy ra vào cổng không ở trạng thái chờ duyệt');
    }

    const officeId = await this.getUserOfficeId(gatePass.userId);
    const requesterJobName = (gatePass.user as any).jobPosition?.jobName ?? null;
    const canApprove = await this.verifyApprover(approverId, gatePass.departmentId, officeId, gatePass.currentLevel, requesterJobName, gatePass.userId);
    if (!canApprove) throw new ForbiddenException('Bạn không có quyền duyệt đơn này');

    await this.prisma.gatePassApproval.upsert({
      where: { gatePassId_approvalLevel: { gatePassId, approvalLevel: gatePass.currentLevel } },
      create: { gatePassId, approverId, approvalLevel: gatePass.currentLevel, status: GatePassApprovalStatus.REJECTED, rejectedAt: new Date(), comment: dto.comment },
      update: { status: GatePassApprovalStatus.REJECTED, rejectedAt: new Date(), approverId, comment: dto.comment },
    });

    await this.prisma.gatePass.update({
      where: { id: gatePassId },
      data: { status: GatePassStatus.REJECTED, rejectionReason: dto.rejectionReason },
    });

    this.wsGateway.sendNotification(gatePass.userId, {
      type: 'GATE_PASS_REJECTED',
      title: 'Giấy ra vào cổng bị từ chối',
      message: `Giấy ra vào cổng #${gatePass.passNumber} đã bị từ chối: ${dto.rejectionReason}`,
      data: { gatePassId },
      timestamp: new Date(),
    });

    return this.findById(gatePassId);
  }

  // ── Admin: xem tất cả ────────────────────────────────────────

  async getAll(query: { companyId?: string; status?: string; page?: number; limit?: number }) {
    const { companyId, status, page = 1, limit = 20 } = query;
    const where: any = {};
    if (companyId) where.companyId = companyId;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.gatePass.findMany({
        where, orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit, take: limit,
        include: {
          user: { select: USER_SELECT },
          department: { select: { id: true, name: true } },
          approvals: { orderBy: { approvalLevel: 'asc' }, include: { approver: { select: USER_SELECT } } },
        },
      }),
      this.prisma.gatePass.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  // ── Xoá đơn (chỉ khi còn PENDING và là chủ đơn) ────────────

  async update(id: string, userId: string, dto: CreateGatePassDto) {
    const gatePass = await this.findById(id);
    if (gatePass.userId !== userId) throw new ForbiddenException('Không có quyền chỉnh sửa đơn này');
    if (gatePass.status !== GatePassStatus.PENDING) {
      throw new BadRequestException('Chỉ có thể chỉnh sửa đơn khi còn chờ duyệt');
    }
    // Disallow edit if any approval has already been acted on (approved or rejected)
    const actioned = (gatePass as any).approvals?.some(
      (a: any) => a.status === 'APPROVED' || a.status === 'REJECTED',
    );
    if (actioned) {
      throw new BadRequestException('Không thể chỉnh sửa đơn khi đã có người duyệt');
    }

    await this.prisma.gatePass.update({
      where: { id },
      data: {
        reasonType: dto.reasonType,
        reasonDetail: dto.reasonDetail ?? null,
        destination: dto.destination ?? null,
        startDateTime: new Date(dto.startDateTime),
        endDateTime: dto.endDateTime ? new Date(dto.endDateTime) : null,
      },
    });
    return this.findById(id);
  }

  async delete(id: string, userId: string) {
    const gatePass = await this.findById(id);
    if (gatePass.userId !== userId) throw new ForbiddenException('Không có quyền xoá đơn này');
    const deletable = [GatePassStatus.DRAFT, GatePassStatus.CANCELLED] as string[];
    if (!deletable.includes(gatePass.status as string)) {
      throw new BadRequestException('Chỉ có thể xoá đơn nháp hoặc đã huỷ');
    }
    await this.prisma.gatePass.delete({ where: { id } });
    return { message: 'Đã xoá giấy ra vào cổng' };
  }

  // ── Helpers ──────────────────────────────────────────────────

  private async getUserOfficeId(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { officeId: true },
    });
    return user?.officeId ?? null;
  }

  private async verifyApprover(
    approverId: string,
    departmentId: string | null,
    officeId: string | null,
    level: number,
    requesterJobName?: string | null,
    requesterId?: string,
  ): Promise<boolean> {
    const { configs } = await this.getApprovalConfigs('', departmentId, officeId);
    const config = this.pickConfigForRequester(configs, level, requesterJobName, requesterId);
    if (!config) return false;

    // If config has requesterFilterIds and requester is not in the list, deny
    if (config.requesterFilterIds?.length > 0 && requesterId && !config.requesterFilterIds.includes(requesterId)) {
      return false;
    }

    if (config.approverType === 'DEPARTMENT_HEAD' && departmentId) {
      if (config.overrideApproverIds?.length > 0) {
        return config.overrideApproverIds.includes(approverId);
      }
      return this.isDeptHead(approverId, departmentId, requesterJobName);
    }

    return config.approverUserId === approverId || config.substituteUserId === approverId;
  }

  private async notifyApprovers(
    gatePassId: string,
    departmentId: string | null,
    officeId: string | null,
    level: number,
    notification: any,
    requesterJobName?: string | null,
    requesterId?: string,
  ) {
    const { configs } = await this.getApprovalConfigs('', departmentId, officeId);
    const config = this.pickConfigForRequester(configs, level, requesterJobName, requesterId);
    if (!config) return;

    let approverIds: string[] = [];

    if (config.approverType === 'DEPARTMENT_HEAD' && departmentId) {
      if (config.overrideApproverIds?.length > 0) {
        // Use override list directly
        approverIds = [...config.overrideApproverIds];
      } else {
        // Auto-detect: UDM managers + position-based managers for requester's VTCV
        const managers = await this.getDeptManagers(departmentId);
        approverIds = managers.map((m) => m.userId);
        // Also include position-based managers for the requester's specific VTCV (not in UDM)
        if (requesterJobName) {
          const mgrIds = managers.map((m) => m.userId);
          const posMgrs = await this.prisma.user.findMany({
            where: {
              isActive: true,
              id: { notIn: mgrIds },
              jobPosition: { departmentId, jobName: requesterJobName, position: { isManagement: true } },
            },
            select: { id: true },
          });
          posMgrs.forEach((u) => { if (!approverIds.includes(u.id)) approverIds.push(u.id); });
        }
      }
      if (config.substituteUserId) approverIds.push(config.substituteUserId);
    } else if (config.approverUserId) {
      approverIds = [config.approverUserId];
      if (config.substituteUserId) approverIds.push(config.substituteUserId);
    }

    if (approverIds.length > 0) {
      await this.wsGateway.sendNotificationToUsers(approverIds, {
        ...notification,
        timestamp: new Date(),
      });
    }
  }

  // ── Approval Config CRUD ─────────────────────────────────────

  async getConfigs(companyId?: string) {
    const configs = await this.prisma.gatePassApprovalConfig.findMany({
      where: companyId
        ? { OR: [{ companyId }, { companyId: null }] }
        : undefined,
      orderBy: [{ officeId: 'asc' }, { departmentId: 'asc' }, { level: 'asc' }],
      include: {
        office: { select: { id: true, name: true } },
        department: { select: { id: true, name: true, officeId: true } },
        approver: { select: USER_SELECT },
        substitute: { select: USER_SELECT },
        overrideApprovers: { include: { user: { select: CANDIDATE_SELECT } } },
        requesterFilters: { include: { user: { select: CANDIDATE_SELECT } } },
      },
    });
    return configs.map((c) => ({
      ...c,
      overrideApproverIds: (c.overrideApprovers ?? []).map((o: any) => o.userId),
      requesterFilterIds: (c.requesterFilters ?? []).map((f: any) => f.userId),
    }));
  }

  async createConfig(dto: CreateApprovalConfigDto) {
    if (!dto.officeId && !dto.departmentId) {
      throw new BadRequestException('Phải có officeId hoặc departmentId');
    }
    if (dto.approverType === 'SPECIFIC_USER' && !dto.approverUserId) {
      throw new BadRequestException('Người duyệt cụ thể (approverUserId) là bắt buộc');
    }

    const existing = await this.prisma.gatePassApprovalConfig.findFirst({
      where: {
        ...(dto.officeId ? { officeId: dto.officeId } : {}),
        ...(dto.departmentId ? { departmentId: dto.departmentId } : {}),
        level: dto.level,
        requesterJobName: dto.requesterJobName ?? null,
        requesterJobNames: { equals: dto.requesterJobNames ?? [] },
      },
    });

    const configId = existing?.id ?? undefined;

    const upsertData: any = {
      approverType: dto.approverType as any,
      approverUserId: dto.approverType === 'SPECIFIC_USER' ? dto.approverUserId : null,
      substituteUserId: dto.substituteUserId ?? null,
      requesterJobName: dto.requesterJobName ?? null,
      requesterJobNames: dto.requesterJobNames ?? [],
      isActive: true,
      companyId: dto.companyId,
    };

    const configInclude = {
      office: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      approver: { select: USER_SELECT },
      substitute: { select: USER_SELECT },
      overrideApprovers: { include: { user: { select: CANDIDATE_SELECT } } },
      requesterFilters: { include: { user: { select: CANDIDATE_SELECT } } },
    };

    let savedConfig: any;
    if (existing) {
      savedConfig = await this.prisma.gatePassApprovalConfig.update({
        where: { id: existing.id },
        data: upsertData,
        include: configInclude,
      });
    } else {
      savedConfig = await this.prisma.gatePassApprovalConfig.create({
        data: {
          officeId: dto.officeId,
          departmentId: dto.departmentId,
          companyId: dto.companyId,
          level: dto.level,
          ...upsertData,
        },
        include: configInclude,
      });
    }

    const needsSync = dto.overrideApproverIds !== undefined || dto.requesterFilterIds !== undefined;
    if (needsSync) {
      if (dto.overrideApproverIds !== undefined) await this.syncOverrideApprovers(savedConfig.id, dto.overrideApproverIds ?? []);
      if (dto.requesterFilterIds !== undefined) await this.syncRequesterFilters(savedConfig.id, dto.requesterFilterIds ?? []);
      return this.prisma.gatePassApprovalConfig.findUnique({ where: { id: savedConfig.id }, include: configInclude });
    }
    return savedConfig;
  }

  async updateConfig(id: string, dto: UpdateApprovalConfigDto) {
    const configInclude = {
      office: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      approver: { select: USER_SELECT },
      substitute: { select: USER_SELECT },
      overrideApprovers: { include: { user: { select: CANDIDATE_SELECT } } },
      requesterFilters: { include: { user: { select: CANDIDATE_SELECT } } },
    };

    const updated = await this.prisma.gatePassApprovalConfig.update({
      where: { id },
      data: {
        ...(dto.approverType !== undefined ? { approverType: dto.approverType as any } : {}),
        ...(dto.approverType === 'SPECIFIC_USER' && dto.approverUserId !== undefined
          ? { approverUserId: dto.approverUserId }
          : dto.approverType === 'DEPARTMENT_HEAD'
            ? { approverUserId: null }
            : {}),
        ...(dto.substituteUserId !== undefined ? { substituteUserId: dto.substituteUserId } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...('requesterJobName' in dto ? { requesterJobName: dto.requesterJobName } : {}),
        ...('requesterJobNames' in dto ? { requesterJobNames: dto.requesterJobNames } : {}),
      },
      include: configInclude,
    });

    const needsSync = dto.overrideApproverIds !== undefined || dto.requesterFilterIds !== undefined;
    if (needsSync) {
      if (dto.overrideApproverIds !== undefined) await this.syncOverrideApprovers(id, dto.overrideApproverIds ?? []);
      if (dto.requesterFilterIds !== undefined) await this.syncRequesterFilters(id, dto.requesterFilterIds ?? []);
      return this.prisma.gatePassApprovalConfig.findUnique({ where: { id }, include: configInclude });
    }
    return updated;
  }

  /** Returns the approver(s) who would approve a gate pass for the given user.
   *  Used by the frontend to show "Your approver" info when creating a pass. */
  async getMyApprover(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        officeId: true,
        jobPosition: { select: { jobName: true, departmentId: true } },
      },
    });
    if (!user) return [];

    const departmentId = user.jobPosition?.departmentId ?? null;
    const officeId = user.officeId ?? null;
    const requesterJobName = user.jobPosition?.jobName ?? null;

    if (!departmentId && !officeId) return [];

    const { configs } = await this.getApprovalConfigs('', departmentId, officeId);
    const level1Config = this.pickConfigForRequester(configs, 1, requesterJobName, userId);
    if (!level1Config) return [];

    if (level1Config.approverType === 'DEPARTMENT_HEAD' && departmentId) {
      if (level1Config.overrideApproverIds?.length > 0) {
        const users = await this.prisma.user.findMany({
          where: { id: { in: level1Config.overrideApproverIds }, isActive: true },
          select: CANDIDATE_SELECT,
        });
        return users;
      }
      const managers = await this.getDeptManagers(departmentId);
      let approverIds = managers.map((m) => m.userId);
      if (requesterJobName) {
        const mgrIds = managers.map((m) => m.userId);
        const posMgrs = await this.prisma.user.findMany({
          where: {
            isActive: true,
            id: { notIn: mgrIds },
            jobPosition: { departmentId, jobName: requesterJobName, position: { isManagement: true } },
          },
          select: { id: true },
        });
        posMgrs.forEach((u) => { if (!approverIds.includes(u.id)) approverIds.push(u.id); });
      }
      approverIds = approverIds.filter((id) => id !== userId);
      if (approverIds.length === 0) return [];
      return this.prisma.user.findMany({
        where: { id: { in: approverIds }, isActive: true },
        select: CANDIDATE_SELECT,
      });
    }

    if (level1Config.approverUserId) {
      const approver = await this.prisma.user.findUnique({
        where: { id: level1Config.approverUserId },
        select: CANDIDATE_SELECT,
      });
      return approver ? [approver] : [];
    }

    return [];
  }

  private async syncOverrideApprovers(configId: string, userIds: string[]) {
    await this.prisma.gatePassConfigApproverOverride.deleteMany({ where: { configId } });
    if (userIds.length > 0) {
      await this.prisma.gatePassConfigApproverOverride.createMany({
        data: userIds.map((userId) => ({ configId, userId })),
        skipDuplicates: true,
      });
    }
  }

  private async syncRequesterFilters(configId: string, userIds: string[]) {
    await this.prisma.gatePassConfigRequesterFilter.deleteMany({ where: { configId } });
    if (userIds.length > 0) {
      await this.prisma.gatePassConfigRequesterFilter.createMany({
        data: userIds.map((userId) => ({ configId, userId })),
        skipDuplicates: true,
      });
    }
  }

  async deleteConfig(id: string) {
    await this.prisma.gatePassApprovalConfig.delete({ where: { id } });
    return { message: 'Đã xoá cấu hình phê duyệt' };
  }

  async getWorkflowPreview(companyId?: string) {
    const configs = await this.prisma.gatePassApprovalConfig.findMany({
      where: companyId
        ? { isActive: true, OR: [{ companyId }, { companyId: null }] }
        : { isActive: true },
      orderBy: [{ officeId: 'asc' }, { departmentId: 'asc' }, { level: 'asc' }],
      include: {
        office: { select: { id: true, name: true } },
        department: { select: { id: true, name: true, officeId: true } },
        approver: { select: USER_SELECT },
        substitute: { select: USER_SELECT },
      },
    });

    // Group by office or department
    const grouped: Record<string, any> = {};
    for (const c of configs) {
      const key = c.officeId ? `office:${c.officeId}` : `dept:${c.departmentId}`;
      if (!grouped[key]) {
        grouped[key] = {
          office: c.office ?? null,
          department: c.department ?? null,
          levels: [],
        };
      }
      grouped[key].levels.push({
        level: c.level,
        approverType: c.approverType,
        approver: c.approver,
        substitute: c.substitute,
      });
    }

    return Object.values(grouped);
  }

  /** Returns management users (isManagement=true) scoped to an office or department.
   /**  When includeAll=true, returns all active users in scope except NV/CN level positions
   *  (only those eligible to approve, i.e. position name not in NV/CN).
   *  When allUsers=true, returns ALL active users regardless of position (for requester filter). */
  async getApproverCandidates(officeId?: string, departmentId?: string, includeAll?: boolean, allUsers?: boolean, allPositions?: boolean, jobName?: string) {
    if (!officeId && !departmentId) return [];

    const NV_CN_NAMES = ['NV', 'CN'];
    let positionFilter: any;
    if (allPositions) {
      positionFilter = undefined; // no restriction
    } else if (allUsers) {
      positionFilter = { name: { in: NV_CN_NAMES } };
    } else if (includeAll) {
      positionFilter = { name: { notIn: NV_CN_NAMES } };
    } else {
      positionFilter = { isManagement: true };
    }

    const jobPositionWhere: any = departmentId
      ? { departmentId, ...(positionFilter ? { position: positionFilter } : {}) }
      : { department: { officeId }, ...(positionFilter ? { position: positionFilter } : {}) };

    if (jobName) {
      jobPositionWhere.jobName = jobName;
    }

    const users = await this.prisma.user.findMany({
      where: { isActive: true, jobPosition: jobPositionWhere },
      select: CANDIDATE_SELECT,
      orderBy: [
        { jobPosition: { position: { level: 'asc' } } },
        { lastName: 'asc' },
      ],
    });

    return users;
  }

  /** Returns sorted distinct VTCV (jobName) values for a given office or department.
   *  Used by the admin config UI for the VTCV filter dropdown. */
  async getDistinctJobNames(officeId?: string, departmentId?: string): Promise<string[]> {
    if (!officeId && !departmentId) return [];

    const where = departmentId
      ? { departmentId }
      : { department: { officeId } };

    const rows = await this.prisma.jobPosition.findMany({
      where,
      select: { jobName: true },
      distinct: ['jobName'],
      orderBy: { jobName: 'asc' },
    });

    return rows.map((r) => r.jobName).filter(Boolean) as string[];
  }

  /**
   * Preview which user(s) would be the auto-resolved dept head for a given dept + optional VTCV.
   * Used in the admin config UI to show "Người duyệt sẽ là: ..." when DEPARTMENT_HEAD is selected.
   */
  async getDeptHeadPreview(
    departmentId?: string,
    jobName?: string,
  ): Promise<typeof CANDIDATE_SELECT extends object ? any[] : never> {
    if (!departmentId) return [];

    // If VTCV filter is specified, skip depts that have no employees with that VTCV at all.
    // This prevents "general managers" (TGĐ, P.TGĐ, etc.) from leaking into results
    // when querying across all depts of an office.
    if (jobName) {
      const hasVtcvMembers = await this.prisma.user.count({
        where: { isActive: true, jobPosition: { departmentId, jobName } },
      });
      if (hasVtcvMembers === 0) return [];
    }

    const managers = await this.getDeptManagers(departmentId);
    if (managers.length === 0) return [];

    const mgrIds = managers.map((m) => m.userId);

    let resolvedIds: string[];

    if (jobName) {
      // Find managers eligible for this specific VTCV
      const eligible: string[] = [];
      for (const mgr of managers) {
        const ok = await this.isDeptMgrEligibleForVtcv(mgr.userId, mgr.jobName, departmentId, jobName, mgrIds);
        if (ok) eligible.push(mgr.userId);
      }
      // Also include position-based managers (not in UDM) with matching VTCV
      const posMgrs = await this.prisma.user.findMany({
        where: {
          isActive: true,
          id: { notIn: mgrIds },
          jobPosition: { departmentId, jobName, position: { isManagement: true } },
        },
        select: { id: true },
      });
      posMgrs.forEach((u) => { if (!eligible.includes(u.id)) eligible.push(u.id); });
      resolvedIds = eligible;
    } else {
      resolvedIds = mgrIds;
    }

    if (resolvedIds.length === 0) return [];

    return this.prisma.user.findMany({
      where: { id: { in: resolvedIds }, isActive: true },
      select: CANDIDATE_SELECT,
      orderBy: [
        { jobPosition: { position: { level: 'asc' } } },
        { lastName: 'asc' },
      ],
    });
  }
}
