import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/common/prisma.service';
import { CreateVisibilityRuleDto } from '../dto/leave-visibility/create-visibility-rule.dto';

@Injectable()
export class LeaveVisibilityService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateVisibilityRuleDto) {
    return this.prisma.leaveVisibilityRule.create({ data: dto as any });
  }

  async findAll(companyId: string) {
    return this.prisma.leaveVisibilityRule.findMany({
      where: { companyId, isActive: true },
      include: {
        viewerRole: { select: { id: true, code: true, name: true } },
        viewerUser: { select: { id: true, firstName: true, lastName: true } },
        leaveType: { select: { id: true, code: true, name: true } },
        office: { select: { id: true, name: true } },
      },
      orderBy: { priority: 'desc' },
    });
  }

  async findOne(id: string) {
    const rule = await this.prisma.leaveVisibilityRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('Quy tắc visibility không tồn tại');
    return rule;
  }

  async update(id: string, dto: Partial<CreateVisibilityRuleDto>) {
    await this.findOne(id);
    return this.prisma.leaveVisibilityRule.update({ where: { id }, data: dto as any });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.leaveVisibilityRule.update({ where: { id }, data: { isActive: false } });
  }

  /**
   * Kiểm tra xem một viewer có quyền xem đơn của targetUser không
   * Dựa vào LeaveVisibilityRule và scope
   */
  async canViewRequest(
    viewerId: string,
    targetUserId: string,
    companyId: string,
    leaveTypeId?: string,
  ): Promise<boolean> {
    // Luôn có thể xem đơn của chính mình
    if (viewerId === targetUserId) return true;

    const viewer = await this.prisma.user.findUniqueOrThrow({
      where: { id: viewerId },
      select: {
        id: true, officeId: true,
        roles: { select: { roleDefinitionId: true } },
        jobPosition: { select: { departmentId: true } },
        group: { select: { id: true } },
      },
    });

    const target = await this.prisma.user.findUniqueOrThrow({
      where: { id: targetUserId },
      select: {
        id: true, officeId: true,
        jobPosition: { select: { departmentId: true } },
        groupId: true,
      },
    });

    const roleIds = viewer.roles.map((r) => r.roleDefinitionId);

    // Lấy tất cả rules applicable cho viewer
    const rules = await this.prisma.leaveVisibilityRule.findMany({
      where: {
        companyId,
        isActive: true,
        OR: [
          { viewerUserId: viewerId },
          { viewerRoleId: { in: roleIds } },
          { viewerRoleId: null, viewerUserId: null }, // áp dụng cho tất cả
        ],
        AND: [
          { OR: [{ leaveTypeId: leaveTypeId ?? undefined }, { leaveTypeId: null }] },
          { OR: [{ officeId: viewer.officeId }, { officeId: null }] },
        ],
      },
      orderBy: { priority: 'desc' },
    });

    if (!rules.length) return false;

    // Kiểm tra rule có scope bao phủ target không
    for (const rule of rules) {
      switch (rule.scope) {
        case 'TEAM':
          if (viewer.group?.id && viewer.group.id === target.groupId) return true;
          break;
        case 'DEPARTMENT':
          if (viewer.jobPosition?.departmentId === target.jobPosition?.departmentId) return true;
          break;
        case 'OFFICE':
          if (viewer.officeId === target.officeId) return true;
          break;
        case 'COMPANY':
          return true;
      }
    }

    return false;
  }
}
