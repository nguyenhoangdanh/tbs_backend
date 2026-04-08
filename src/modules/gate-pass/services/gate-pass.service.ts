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

    const result: string[] = [];
    for (const deptId of deptIds) {
      if (udmDeptIds.has(deptId)) {
        result.push(deptId);
        continue;
      }
      // Position-based fallback: user must be in same dept, have isManagement=true,
      // and be the highest-ranked (lowest level) management user for their VTCV in this dept.
      if (!approverIsManagement || !approverJobName) continue;

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
    if (!managerIds.includes(userId)) return false;
    if (!requesterJobName) return true;

    const thisManager = managers.find((m) => m.userId === userId);
    const managerJobName = thisManager?.jobName ?? null;
    return this.isDeptMgrEligibleForVtcv(userId, managerJobName, departmentId, requesterJobName, managerIds);
  }

  /**
   * VTCV-aware eligibility check (same logic as leave system):
   * - Same VTCV as requester → always eligible
   * - General manager (no non-manager workers share their VTCV) → eligible for all groups
   *   not covered by a tech-specific TP
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
    const managers = await this.getDeptManagers(deptId);
    const techTpForRequester = managers.find((m) => m.jobName === requesterJobName);
    if (techTpForRequester) {
      const nonMgrWithVtcv = await this.prisma.user.count({
        where: { isActive: true, jobPosition: { departmentId: deptId, jobName: requesterJobName }, id: { notIn: mgrIds } },
      });
      if (nonMgrWithVtcv > 0) return false;
    }
    return true;
  }

  /**
   * Build Prisma filter conditions for pending gate passes this dept head should see.
   * VTCV-aware: tech-specific TPs see only their VTCV; general managers see all others.
   */
  private async buildDeptHeadPendingConditions(
    approverId: string,
    managedDeptIds: string[],
    configLevel: number,
  ): Promise<any[]> {
    if (managedDeptIds.length === 0) return [];

    const approverUser = await this.prisma.user.findUnique({
      where: { id: approverId },
      select: { jobPosition: { select: { jobName: true } } },
    });
    const approverJobName = approverUser?.jobPosition?.jobName ?? null;

    const conditions: any[] = [];

    for (const deptId of managedDeptIds) {
      const managers = await this.getDeptManagers(deptId);
      const mgrIds = managers.map((m) => m.userId);

      const isGeneralMgr = !approverJobName || (await this.prisma.user.count({
        where: { isActive: true, jobPosition: { departmentId: deptId, jobName: approverJobName }, id: { notIn: mgrIds } },
      })) === 0;

      if (!isGeneralMgr) {
        conditions.push({
          departmentId: deptId,
          currentLevel: configLevel,
          status: GatePassStatus.PENDING,
          user: { jobPosition: { jobName: approverJobName } },
        });
      } else {
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
        const base: any = { departmentId: deptId, currentLevel: configLevel, status: GatePassStatus.PENDING };
        if (techSpecificVtcvs.length > 0) {
          base.user = { jobPosition: { jobName: { notIn: techSpecificVtcvs } } };
        }
        conditions.push(base);
      }
    }
    return conditions;
  }


  private async generatePassNumber(companyId?: string): Promise<string> {
    const year = new Date().getFullYear().toString().slice(-2);
    const count = await this.prisma.gatePass.count({
      where: { createdAt: { gte: new Date(new Date().getFullYear(), 0, 1) } },
    });
    return `GP${year}${String(count + 1).padStart(4, '0')}`;
  }

  // ── Lấy approver configs theo officeId hoặc departmentId ──────

  private async getApprovalConfigs(
    _userId: string,
    departmentId: string | null,
    officeId: string | null,
  ) {
    // Department-level config takes precedence (more specific overrides general)
    if (departmentId) {
      const deptConfigs = await this.prisma.gatePassApprovalConfig.findMany({
        where: { departmentId, isActive: true },
        orderBy: { level: 'asc' },
        include: {
          approver: { select: USER_SELECT },
          substitute: { select: USER_SELECT },
          department: { select: { id: true, name: true } },
        },
      });
      if (deptConfigs.length > 0) return { configs: deptConfigs, configType: 'department' as const };
    }

    // Fall back to office-level config
    if (officeId) {
      const officeConfigs = await this.prisma.gatePassApprovalConfig.findMany({
        where: { officeId, isActive: true },
        orderBy: { level: 'asc' },
        include: {
          approver: { select: USER_SELECT },
          substitute: { select: USER_SELECT },
          office: { select: { id: true, name: true } },
        },
      });
      return { configs: officeConfigs, configType: 'office' as const };
    }

    return { configs: [], configType: null };
  }

  /**
   * Khi cùng một scope+level có nhiều config (mỗi config cho một VTCV khác nhau),
   * chọn config phù hợp với VTCV của người tạo đơn.
   * Ưu tiên: exact match > null (áp dụng cho tất cả).
   */
  private pickConfigForRequester(configs: any[], level: number, requesterJobName?: string | null) {
    const atLevel = configs.filter((c) => c.level === level);
    if (atLevel.length === 0) return undefined;
    if (requesterJobName) {
      const exact = atLevel.find((c) => c.requesterJobName === requesterJobName);
      if (exact) return exact;
    }
    return atLevel.find((c) => !c.requesterJobName) ?? atLevel[0];
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
    const passNumber = await this.generatePassNumber(user.companyId);

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
        status: GatePassStatus.PENDING,
        currentLevel: 1,
      },
    });

    const requesterJobName = user.jobPosition?.jobName ?? null;

    await this.notifyApprovers(gatePass.id, departmentId, officeId, 1, {
      type: 'GATE_PASS_PENDING_APPROVAL',
      title: 'Có giấy ra vào cổng mới cần duyệt',
      message: `${user.lastName} ${user.firstName} (${user.employeeCode}) vừa tạo giấy ra vào cổng`,
      data: { gatePassId: gatePass.id },
    }, requesterJobName);

    return this.findById(gatePass.id);
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

    // Case 1: User is SPECIFIC_USER approver/substitute in some config
    const specificConfigs = await this.prisma.gatePassApprovalConfig.findMany({
      where: {
        isActive: true,
        approverType: 'SPECIFIC_USER',
        OR: [{ approverUserId: approverId }, { substituteUserId: approverId }],
      },
    });

    // Case 2: DEPARTMENT_HEAD configs — resolve via UDM or position-based fallback
    const allDeptHeadConfigs = await this.prisma.gatePassApprovalConfig.findMany({
      where: { isActive: true, approverType: 'DEPARTMENT_HEAD' },
    });

    // Collect all dept IDs that appear in these configs (via office or direct dept)
    const candidateDeptIds = new Set<string>();
    for (const cfg of allDeptHeadConfigs) {
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

    const conditions: any[] = [];

    // From specific configs
    for (const cfg of specificConfigs) {
      if (cfg.officeId) {
        // Exclude depts that have their own dept-level config at this level (dept overrides office)
        const deptsWithOwnConfig = await this.prisma.gatePassApprovalConfig.findMany({
          where: {
            department: { officeId: cfg.officeId },
            level: cfg.level,
            isActive: true,
          },
          select: { departmentId: true },
        });
        const overriddenDeptIds = deptsWithOwnConfig.map((d) => d.departmentId).filter(Boolean) as string[];

        const userFilter = cfg.requesterJobName
          ? { officeId: cfg.officeId, jobPosition: { jobName: cfg.requesterJobName } }
          : { officeId: cfg.officeId };

        conditions.push({
          currentLevel: cfg.level,
          status: GatePassStatus.PENDING,
          user: userFilter,
          ...(overriddenDeptIds.length > 0 ? { NOT: { departmentId: { in: overriddenDeptIds } } } : {}),
        });
      } else if (cfg.departmentId) {
        conditions.push({
          departmentId: cfg.departmentId,
          currentLevel: cfg.level,
          status: GatePassStatus.PENDING,
          ...(cfg.requesterJobName
            ? { user: { jobPosition: { jobName: cfg.requesterJobName } } }
            : {}),
        });
      }
    }

    // From department head configs
    if (managedDeptIds.length > 0) {
      for (const cfg of allDeptHeadConfigs) {
        let relevantDeptIds: string[];

        if (cfg.officeId) {
          const deptsInOffice = await this.prisma.department.findMany({
            where: { officeId: cfg.officeId, id: { in: managedDeptIds } },
            select: { id: true },
          });
          // Exclude depts that have their own dept-level config at this level
          // (dept-level config takes priority over office-level, per getApprovalConfigs)
          const deptsWithOwnConfig = await this.prisma.gatePassApprovalConfig.findMany({
            where: {
              departmentId: { in: deptsInOffice.map((d) => d.id) },
              level: cfg.level,
              isActive: true,
            },
            select: { departmentId: true },
          });
          const overriddenDeptIds = new Set(deptsWithOwnConfig.map((d) => d.departmentId));
          relevantDeptIds = deptsInOffice.map((d) => d.id).filter((id) => !overriddenDeptIds.has(id));
        } else if (cfg.departmentId && managedDeptIds.includes(cfg.departmentId)) {
          relevantDeptIds = [cfg.departmentId];
        } else {
          relevantDeptIds = [];
        }

        if (relevantDeptIds.length === 0) continue;

        const vtcvConditions = await this.buildDeptHeadPendingConditions(approverId, relevantDeptIds, cfg.level);
        conditions.push(...vtcvConditions);
      }
    }

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

    const officeId = await this.getUserOfficeId(gatePass.userId);
    const requesterJobName = (gatePass.user as any).jobPosition?.jobName ?? null;
    const canApprove = await this.verifyApprover(approverId, gatePass.departmentId, officeId, gatePass.currentLevel, requesterJobName);
    if (!canApprove) throw new ForbiddenException('Bạn không có quyền duyệt đơn này');

    await this.prisma.gatePassApproval.upsert({
      where: { gatePassId_approvalLevel: { gatePassId, approvalLevel: gatePass.currentLevel } },
      create: { gatePassId, approverId, approvalLevel: gatePass.currentLevel, status: GatePassApprovalStatus.APPROVED, approvedAt: new Date(), comment: dto.comment },
      update: { status: GatePassApprovalStatus.APPROVED, approvedAt: new Date(), approverId, comment: dto.comment },
    });

    // Check if there's a next level config (VTCV-aware)
    const { configs } = await this.getApprovalConfigs('', gatePass.departmentId, officeId);
    const nextConfig = this.pickConfigForRequester(configs, gatePass.currentLevel + 1, requesterJobName);

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
      }, requesterJobName);
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
    const canApprove = await this.verifyApprover(approverId, gatePass.departmentId, officeId, gatePass.currentLevel, requesterJobName);
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

  async delete(id: string, userId: string) {
    const gatePass = await this.findById(id);
    if (gatePass.userId !== userId) throw new ForbiddenException('Không có quyền xoá đơn này');
    if (gatePass.status !== GatePassStatus.PENDING) {
      throw new BadRequestException('Chỉ có thể xoá đơn khi còn chờ duyệt');
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
  ): Promise<boolean> {
    const { configs } = await this.getApprovalConfigs('', departmentId, officeId);
    const config = this.pickConfigForRequester(configs, level, requesterJobName);
    if (!config) return false;

    if (config.approverType === 'DEPARTMENT_HEAD' && departmentId) {
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
  ) {
    const { configs } = await this.getApprovalConfigs('', departmentId, officeId);
    const config = this.pickConfigForRequester(configs, level, requesterJobName);
    if (!config) return;

    let approverIds: string[] = [];

    if (config.approverType === 'DEPARTMENT_HEAD' && departmentId) {
      const managers = await this.getDeptManagers(departmentId);
      approverIds = managers.map((m) => m.userId);
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
    return this.prisma.gatePassApprovalConfig.findMany({
      where: companyId
        ? { OR: [{ companyId }, { companyId: null }] }
        : undefined,
      orderBy: [{ officeId: 'asc' }, { departmentId: 'asc' }, { level: 'asc' }],
      include: {
        office: { select: { id: true, name: true } },
        department: { select: { id: true, name: true, officeId: true } },
        approver: { select: USER_SELECT },
        substitute: { select: USER_SELECT },
      },
    });
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
      },
    });

    if (existing) {
      return this.prisma.gatePassApprovalConfig.update({
        where: { id: existing.id },
        data: {
          approverType: dto.approverType as any,
          approverUserId: dto.approverType === 'SPECIFIC_USER' ? dto.approverUserId : null,
          substituteUserId: dto.substituteUserId ?? null,
          requesterJobName: dto.requesterJobName ?? null,
          isActive: true,
          companyId: dto.companyId,
        },
        include: {
          office: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
          approver: { select: USER_SELECT },
          substitute: { select: USER_SELECT },
        },
      });
    }

    return this.prisma.gatePassApprovalConfig.create({
      data: {
        officeId: dto.officeId,
        departmentId: dto.departmentId,
        companyId: dto.companyId,
        level: dto.level,
        approverType: dto.approverType as any,
        approverUserId: dto.approverType === 'SPECIFIC_USER' ? dto.approverUserId : null,
        substituteUserId: dto.substituteUserId ?? null,
        requesterJobName: dto.requesterJobName ?? null,
      },
      include: {
        office: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        approver: { select: USER_SELECT },
        substitute: { select: USER_SELECT },
      },
    });
  }

  async updateConfig(id: string, dto: UpdateApprovalConfigDto) {
    if (dto.approverType === 'SPECIFIC_USER' && dto.approverUserId === undefined) {
      // Don't wipe approverUserId if not provided
    }
    return this.prisma.gatePassApprovalConfig.update({
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
      },
      include: {
        office: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        approver: { select: USER_SELECT },
        substitute: { select: USER_SELECT },
      },
    });
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
   *  Used by the admin UI to show approver candidates when configuring approval levels. */
  async getApproverCandidates(officeId?: string, departmentId?: string) {
    if (!officeId && !departmentId) return [];

    const jobPositionWhere = departmentId
      ? { departmentId, position: { isManagement: true } }
      : { department: { officeId }, position: { isManagement: true } };

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
}
