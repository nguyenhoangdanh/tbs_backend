import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/common/prisma.service';
import { CreateLeaveFlowDto } from '../dto/leave-flow/create-leave-flow.dto';

@Injectable()
export class LeaveFlowService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateLeaveFlowDto & { companyId: string }) {
    const { levels, companyId, name, description, leaveTypeId, officeId, departmentId, priority, isDefault } = dto;
    const requesterJobNames: string[] = (dto as any).requesterJobNames ?? [];
    const requesterFilterIds: string[] = (dto as any).requesterFilterIds ?? [];

    // Auto-detect officeId: if flow name contains VPĐH/VPDh/VPDH and no officeId given,
    // automatically scope it to the VPĐH TH office to prevent it from matching factory users.
    const resolvedOfficeId = officeId ?? await this.detectVpdhOfficeId(name, companyId);

    const flow = await this.prisma.leaveApprovalFlow.create({
      data: {
        companyId,
        name,
        description: description ?? null,
        leaveTypeId: leaveTypeId ?? null,
        officeId: resolvedOfficeId ?? null,
        departmentId: departmentId ?? null,
        requesterJobNames,
        priority: priority ?? 0,
        isDefault: isDefault ?? false,
        levels: {
          create: levels.map((l, idx) => ({
            level: (l as any).level ?? (l as any).levelNumber ?? (idx + 1),
            approverMode: l.approverMode as any,
            specificUserId: (l as any).specificUserId ?? (l as any).approverId ?? null,
            roleDefinitionId: (l as any).roleDefinitionId ?? (l as any).roleId ?? null,
            targetDepartmentId: l.targetDepartmentId ?? null,
            substitute1Id: l.substitute1Id ?? null,
            substitute2Id: l.substitute2Id ?? null,
            timeoutHours: l.timeoutHours ?? null,
            timeoutAction: (l.timeoutAction as any) ?? 'NOTIFY_ONLY',
            canViewAllRequests: l.canViewAllRequests ?? false,
          })),
        },
      },
      include: {
        levels: { orderBy: { level: 'asc' } },
        requesterFilters: { select: { userId: true } },
      },
    });

    if (requesterFilterIds.length > 0) {
      await this.syncRequesterFilters(flow.id, requesterFilterIds);
    }

    // Retroactively attach flowId to matching PENDING requests that have no flow yet
    await this.reattachPendingRequests(flow);

    return { ...flow, requesterFilterIds: requesterFilterIds };
  }

  async findAll(companyId: string) {
    const flows = await this.prisma.leaveApprovalFlow.findMany({
      where: { companyId, isActive: true },
      include: {
        levels: {
          where: { isActive: true },
          orderBy: { level: 'asc' },
          include: {
            specificUser: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
            substitute1: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
            substitute2: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
            roleDefinition: { select: { id: true, code: true, name: true } },
            targetDepartment: { select: { id: true, name: true } },
          },
        },
        leaveType: { select: { id: true, code: true, name: true } },
        office: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        requesterFilters: {
          select: {
            userId: true,
            user: { select: { id: true, firstName: true, lastName: true, employeeCode: true, jobPosition: { select: { jobName: true, position: { select: { name: true } } } } } },
          },
        },
      },
      orderBy: { priority: 'desc' },
    });
    return flows.map((f) => ({
      ...f,
      requesterFilterIds: f.requesterFilters.map((r) => r.userId),
    }));
  }

  async previewApprovers(
    companyId: string,
    approverMode: string,
    roleDefinitionId?: string,
    targetDepartmentId?: string,
    officeId?: string,
  ) {
    if (approverMode === 'SPECIFIC_USER') return [];

    if (approverMode === 'DEPARTMENT_MANAGERS' && targetDepartmentId) {
      const rows = await this.prisma.userDepartmentManagement.findMany({
        where: { departmentId: targetDepartmentId, isActive: true },
        select: { user: { select: { id: true, firstName: true, lastName: true, employeeCode: true } } },
      });
      return rows.map(r => r.user).filter(Boolean);
    }

    if (!roleDefinitionId) return [];

    // Gather ALL userIds that have the role (no companyId filter on role — we filter on user below)
    const roleRows = await this.prisma.userRole.findMany({
      where: { roleDefinitionId, isActive: true },
      select: { userId: true },
    });
    const userIds = roleRows.map(r => r.userId);
    if (!userIds.length) return [];

    // Base user filter — NOT filtering by companyId here because SUPERADMIN may belong
    // to parent company while employees are in child companies. Dept/role filters are sufficient.
    const baseWhere: any = { id: { in: userIds }, isActive: true };

    // Dept/office scoping
    let deptWhere: any = undefined;
    if (approverMode === 'ROLE_IN_DEPARTMENT' && targetDepartmentId) {
      deptWhere = {
        OR: [
          { jobPosition: { departmentId: targetDepartmentId } },
          { managedDepartments: { some: { departmentId: targetDepartmentId, isActive: true } } },
        ],
      };
    } else if (approverMode === 'ROLE_IN_OFFICE' && officeId) {
      deptWhere = { officeId };
    } else if (approverMode === 'ROLE_IN_DEPARTMENT' && !targetDepartmentId && officeId) {
      // No specific dept selected → show all role holders within the scoped office as preview
      deptWhere = { officeId };
    }

    // Try with dept filter first
    if (deptWhere) {
      const withDept = await this.prisma.user.findMany({
        where: { ...baseWhere, ...deptWhere },
        select: { id: true, firstName: true, lastName: true, employeeCode: true },
        take: 20,
      });
      if (withDept.length > 0) return withDept;

      // Fallback: also try matching by department NAME across all depts in the company
      // (handles case where user selected QTNNL from a different office)
      if (targetDepartmentId) {
        const targetDept = await this.prisma.department.findUnique({
          where: { id: targetDepartmentId },
          select: { name: true },
        });
        if (targetDept) {
          const sameName = await this.prisma.department.findMany({
            where: { name: targetDept.name },
            select: { id: true },
          });
          const sameNameIds = sameName.map(d => d.id);
          if (sameNameIds.length > 1) {
            const withNameMatch = await this.prisma.user.findMany({
              where: {
                ...baseWhere,
                OR: [
                  { jobPosition: { departmentId: { in: sameNameIds } } },
                  { managedDepartments: { some: { departmentId: { in: sameNameIds }, isActive: true } } },
                ],
              },
              select: { id: true, firstName: true, lastName: true, employeeCode: true },
              take: 20,
            });
            if (withNameMatch.length > 0) return withNameMatch;
          }
        }
      }

      // Final fallback: return all users with the role scoped by office if available
      const fallbackWhere = officeId ? { ...baseWhere, officeId } : baseWhere;
      return this.prisma.user.findMany({
        where: fallbackWhere,
        select: { id: true, firstName: true, lastName: true, employeeCode: true },
        take: 20,
      });
    }

    const noScopeWhere = officeId ? { ...baseWhere, officeId } : baseWhere;
    return this.prisma.user.findMany({
      where: noScopeWhere,
      select: { id: true, firstName: true, lastName: true, employeeCode: true },
      take: 20,
    });
  }

  async findOne(id: string) {
    const flow = await this.prisma.leaveApprovalFlow.findUnique({
      where: { id },
      include: {
        levels: {
          where: { isActive: true },
          orderBy: { level: 'asc' },
          include: {
            specificUser: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
            substitute1: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
            substitute2: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
            roleDefinition: { select: { id: true, code: true, name: true } },
            targetDepartment: { select: { id: true, name: true } },
          },
        },
        requesterFilters: {
          select: {
            userId: true,
            user: { select: { id: true, firstName: true, lastName: true, employeeCode: true, jobPosition: { select: { jobName: true, position: { select: { name: true } } } } } },
          },
        },
      },
    });
    if (!flow) throw new NotFoundException('Flow duyệt không tồn tại');
    return { ...flow, requesterFilterIds: flow.requesterFilters.map((r) => r.userId) };
  }

  async update(id: string, dto: Partial<CreateLeaveFlowDto>) {
    const { levels, name, ...flowData } = dto;
    const requesterJobNames: string[] | undefined = (dto as any).requesterJobNames;
    const requesterFilterIds: string[] | undefined = (dto as any).requesterFilterIds;

    // Extract scalar FK fields and convert to Prisma relation syntax
    const officeId: string | undefined | null = (flowData as any).officeId;
    const departmentId: string | undefined | null = (flowData as any).departmentId;
    const leaveTypeId: string | undefined | null = (flowData as any).leaveTypeId;
    // Remove raw FK fields — Prisma requires relation objects
    delete (flowData as any).officeId;
    delete (flowData as any).departmentId;
    delete (flowData as any).leaveTypeId;
    delete (flowData as any).requesterFilterIds;

    await this.findOne(id);

    // Fetch companyId for auto-detection
    const flowMeta = await this.prisma.leaveApprovalFlow.findUnique({ where: { id }, select: { companyId: true } });

    // Auto-detect officeId when name indicates VPĐH flow and no officeId provided
    let resolvedOfficeId = officeId;
    if (name && resolvedOfficeId === undefined && flowMeta) {
      const autoOfficeId = await this.detectVpdhOfficeId(name, flowMeta.companyId);
      if (autoOfficeId) resolvedOfficeId = autoOfficeId;
    }

    if (levels) {
      // Xóa levels cũ và tạo lại
      await this.prisma.leaveApprovalFlowLevel.deleteMany({ where: { flowId: id } });
      await this.prisma.leaveApprovalFlowLevel.createMany({
        data: levels.map((l, idx) => ({
          flowId: id,
          level: (l as any).level ?? (l as any).levelNumber ?? (idx + 1),
          approverMode: l.approverMode as any,
          specificUserId: (l as any).specificUserId ?? (l as any).approverId ?? null,
          roleDefinitionId: (l as any).roleDefinitionId ?? (l as any).roleId ?? null,
          targetDepartmentId: l.targetDepartmentId ?? null,
          substitute1Id: l.substitute1Id ?? null,
          substitute2Id: l.substitute2Id ?? null,
          timeoutHours: l.timeoutHours ?? null,
          timeoutAction: (l.timeoutAction as any) ?? 'NOTIFY_ONLY',
          canViewAllRequests: l.canViewAllRequests ?? false,
        })),
      });
    }

    if (requesterFilterIds !== undefined) {
      await this.syncRequesterFilters(id, requesterFilterIds);
    }

    // Build Prisma-compatible update payload using relation objects
    const updatePayload: any = { ...flowData };
    if (name) updatePayload.name = name;
    if (requesterJobNames !== undefined) updatePayload.requesterJobNames = requesterJobNames;

    // Use Prisma relation syntax for FK fields
    if (resolvedOfficeId !== undefined) {
      updatePayload.office = resolvedOfficeId ? { connect: { id: resolvedOfficeId } } : { disconnect: true };
    }
    if (departmentId !== undefined) {
      updatePayload.department = departmentId ? { connect: { id: departmentId } } : { disconnect: true };
    }
    if (leaveTypeId !== undefined) {
      updatePayload.leaveType = leaveTypeId ? { connect: { id: leaveTypeId } } : { disconnect: true };
    }

    const updated = await this.prisma.leaveApprovalFlow.update({
      where: { id },
      data: updatePayload,
      include: {
        levels: { orderBy: { level: 'asc' } },
        requesterFilters: { select: { userId: true } },
      },
    });

    await this.reattachPendingRequests(updated);
    return { ...updated, requesterFilterIds: updated.requesterFilters.map((r: any) => r.userId) };
  }

  private async syncRequesterFilters(flowId: string, userIds: string[]) {
    await this.prisma.leaveFlowRequesterFilter.deleteMany({ where: { flowId } });
    if (userIds.length > 0) {
      await this.prisma.leaveFlowRequesterFilter.createMany({
        data: userIds.map((userId) => ({ id: require('crypto').randomUUID(), flowId, userId })),
        skipDuplicates: true,
      });
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.leaveApprovalFlow.update({ where: { id }, data: { isActive: false } });
  }

  /**
   * Auto-detect VPĐH TH officeId when a flow name indicates it belongs to VPĐH.
   * This prevents VPĐH flows from accidentally scoping to all users (officeId=null).
   */
  private async detectVpdhOfficeId(name: string, companyId: string): Promise<string | null> {
    const normalized = name.trim().toUpperCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/Đ/g, 'D');
    // If name starts with VPDH or contains VPDH TH → auto-scope to VPĐH TH office
    if (normalized.startsWith('VPDH') || normalized.includes('VAN PHONG DH')) {
      const office = await this.prisma.office.findFirst({
        where: { name: { contains: 'VPĐH TH' }, company: { id: companyId } },
        select: { id: true },
      });
      return office?.id ?? null;
    }
    return null;
  }

  async reattachAllPendingRequests() {
    const flows = await this.prisma.leaveApprovalFlow.findMany({
      where: { isActive: true },
      select: { id: true, companyId: true, leaveTypeId: true, officeId: true, departmentId: true },
    });
    let updated = 0;
    for (const flow of flows) {
      const before = await this.prisma.leaveRequest.count({ where: { flowId: flow.id } });
      await this.reattachPendingRequests(flow);
      const after = await this.prisma.leaveRequest.count({ where: { flowId: flow.id } });
      updated += after - before;
    }
    return { flows: flows.length, requestsUpdated: updated };
  }

  /**
   * Migration: Fix flow scoping issues.
   * 1. Set VPDh flow's officeId to VPĐH TH
   * 2. Change NM flow level 2 from ROLE_IN_DEPARTMENT → ROLE_IN_OFFICE
   * 3. Reassign all level-1 PENDING requests to the correct flow based on user's actual office
   *    (drops currentLevel back to 1 so the correct approvers see them)
   */
  async fixFlowScoping() {
    const log: string[] = [];

    // --- Step 1: Set VPĐH flow officeId (search by name containing 'VPĐH' or 'VPDh') ---
    const vpdhOffice = await this.prisma.office.findFirst({
      where: { name: { contains: 'VPĐH TH' } },
      select: { id: true, name: true },
    });
    const vpdhFlow = await this.prisma.leaveApprovalFlow.findFirst({
      where: { name: { contains: 'VPĐ' } },
      select: { id: true, name: true, officeId: true },
    });
    if (vpdhOffice && vpdhFlow) {
      if (vpdhFlow.officeId !== vpdhOffice.id) {
        await this.prisma.leaveApprovalFlow.update({
          where: { id: vpdhFlow.id },
          data: { officeId: vpdhOffice.id },
        });
        log.push(`✅ Set VPĐH flow (${vpdhFlow.name}) officeId → ${vpdhOffice.name}`);
      } else {
        log.push(`ℹ️  VPĐH flow already has correct officeId`);
      }
    } else {
      log.push(`⚠️  Could not find VPĐH flow or VPĐH TH office`);
    }

    // --- Step 2: NM flow level 2 → DEPARTMENT_MANAGERS ---
    const nmFlow = await this.prisma.leaveApprovalFlow.findFirst({
      where: { name: { contains: 'NM' }, officeId: null },
      include: { levels: { where: { level: 2 } } },
    });
    if (nmFlow && nmFlow.levels[0] && nmFlow.levels[0].approverMode !== 'DEPARTMENT_MANAGERS') {
      await this.prisma.leaveApprovalFlowLevel.update({
        where: { id: nmFlow.levels[0].id },
        data: { approverMode: 'DEPARTMENT_MANAGERS', roleDefinitionId: null },
      });
      log.push(`✅ Changed NM flow level 2 → DEPARTMENT_MANAGERS`);
    } else {
      log.push(`ℹ️  NM flow level 2 already correct (${nmFlow?.levels[0]?.approverMode ?? 'not found'})`);
    }

    // --- Step 3: Reassign PENDING requests in wrong flow (no prior approvals = safe to restart) ---
    const allPending = await this.prisma.leaveRequest.findMany({
      where: { status: 'PENDING' },
      select: {
        id: true,
        flowId: true,
        userId: true,
        currentLevel: true,
        user: {
          select: {
            id: true,
            officeId: true,
            jobPosition: { select: { departmentId: true } },
            roles: { select: { roleDefinitionId: true } },
          },
        },
        _count: { select: { approvals: true } },
      },
    });

    // Pre-load flow levels for fast lookup
    const [nmFlowFull, vpdhFlowFull] = await Promise.all([
      nmFlow ? this.prisma.leaveApprovalFlow.findUnique({
        where: { id: nmFlow.id },
        include: { levels: { where: { isActive: true }, orderBy: { level: 'asc' } } },
      }) : null,
      vpdhFlow ? this.prisma.leaveApprovalFlow.findUnique({
        where: { id: vpdhFlow.id },
        include: { levels: { where: { isActive: true }, orderBy: { level: 'asc' } } },
      }) : null,
    ]);

    let fixed = 0;
    for (const req of allPending) {
      if (!vpdhOffice || !vpdhFlow || !nmFlow) break;
      const userOfficeId = req.user.officeId;
      const shouldUseVpdh = userOfficeId === vpdhOffice.id;
      const correctFlowId = shouldUseVpdh ? vpdhFlow.id : nmFlow.id;
      if (req.flowId === correctFlowId) continue;

      // Only reassign requests that have no prior approval actions (safe to restart)
      if (req._count.approvals > 0) {
        log.push(`⚠️  Skipped request ${req.id} — already has ${req._count.approvals} approval(s), cannot safely reassign`);
        continue;
      }

      const targetFlow = shouldUseVpdh ? vpdhFlowFull : nmFlowFull;
      const startingLevel = targetFlow
        ? await this.computeStartingLevelInline(targetFlow.levels, req.user)
        : 1;

      await this.prisma.leaveRequest.update({
        where: { id: req.id },
        data: { flowId: correctFlowId, currentLevel: startingLevel },
      });
      fixed++;
    }
    log.push(`✅ Reassigned ${fixed} PENDING requests (no prior approvals) to correct flow`);

    return { success: true, log };
  }

  /**
   * Inline version of computeStartingLevel — skips levels where requester is the eligible approver
   * or no one can approve.
   */
  private async computeStartingLevelInline(
    levels: any[],
    user: { id: string; officeId: string | null; jobPosition: { departmentId: string } | null; roles: { roleDefinitionId: string }[] },
  ): Promise<number> {
    const userRoleIds = user.roles.map(r => r.roleDefinitionId);
    const userDeptId = user.jobPosition?.departmentId ?? null;
    const userOfficeId = user.officeId ?? null;

    for (const lvl of levels) {
      let requesterIsApprover = false;
      switch (lvl.approverMode) {
        case 'SPECIFIC_USER':
          requesterIsApprover = lvl.specificUserId === user.id;
          break;
        case 'ROLE_IN_COMPANY':
          requesterIsApprover = userRoleIds.includes(lvl.roleDefinitionId);
          break;
        case 'ROLE_IN_OFFICE': {
          if (userRoleIds.includes(lvl.roleDefinitionId)) {
            const approver = await this.prisma.user.findUnique({ where: { id: user.id }, select: { officeId: true } });
            requesterIsApprover = approver?.officeId === userOfficeId;
          }
          break;
        }
        case 'ROLE_IN_DEPARTMENT': {
          if (userRoleIds.includes(lvl.roleDefinitionId)) {
            const deptId = lvl.targetDepartmentId ?? userDeptId;
            if (deptId && userDeptId === deptId) requesterIsApprover = true;
          }
          break;
        }
        case 'DEPARTMENT_MANAGERS': {
          const deptId = lvl.targetDepartmentId ?? userDeptId;
          if (deptId) {
            const isMgr = await this.prisma.userDepartmentManagement.findFirst({
              where: { userId: user.id, departmentId: deptId, isActive: true },
            });
            requesterIsApprover = !!isMgr;
          }
          break;
        }
      }
      if (!requesterIsApprover) return lvl.level;
    }
    return levels[levels.length - 1]?.level ?? 1;
  }

  // ── Retroactively assign flowId to PENDING requests that have no flow ──
  private async getCompanyDescendants(companyId: string): Promise<string[]> {
    // Return companyId + all child/descendant company IDs so a holding-level flow
    // can be reattached to requests from child companies
    const ids = new Set<string>([companyId]);
    const queue = [companyId];
    for (let depth = 0; depth < 6 && queue.length; depth++) {
      const children = await this.prisma.company.findMany({
        where: { parentCompanyId: { in: queue } },
        select: { id: true },
      });
      queue.length = 0;
      for (const c of children) {
        if (!ids.has(c.id)) { ids.add(c.id); queue.push(c.id); }
      }
    }
    return [...ids];
  }

  private async reattachPendingRequests(flow: { id: string; companyId: string; leaveTypeId: string | null; officeId: string | null; departmentId: string | null }) {
    // Include all descendant companies so holding-level flows match child company requests
    const companyIds = await this.getCompanyDescendants(flow.companyId);

    const where: any = {
      companyId: { in: companyIds },
      status: 'PENDING',
      flowId: null,
    };
    if (flow.leaveTypeId) where.leaveTypeId = flow.leaveTypeId;

    // Fetch candidates then filter by office/department
    const candidates = await this.prisma.leaveRequest.findMany({
      where,
      select: {
        id: true,
        user: {
          select: {
            officeId: true,
            jobPosition: { select: { departmentId: true } },
          },
        },
      },
    });

    const idsToUpdate: string[] = [];
    for (const req of candidates) {
      const officeMatch = !flow.officeId || req.user.officeId === flow.officeId;
      const deptMatch = !flow.departmentId || req.user.jobPosition?.departmentId === flow.departmentId;
      if (officeMatch && deptMatch) idsToUpdate.push(req.id);
    }

    if (idsToUpdate.length > 0) {
      await this.prisma.leaveRequest.updateMany({
        where: { id: { in: idsToUpdate } },
        data: { flowId: flow.id },
      });
    }
  }
}
