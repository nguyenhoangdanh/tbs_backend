import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/common/prisma.service';
import { CreateLeaveFlowDto } from '../dto/leave-flow/create-leave-flow.dto';

@Injectable()
export class LeaveFlowService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateLeaveFlowDto & { companyId: string }) {
    const { levels, companyId, name, description, leaveTypeId, officeId, departmentId, priority, isDefault } = dto;

    return this.prisma.leaveApprovalFlow.create({
      data: {
        companyId,
        name,
        description: description ?? null,
        leaveTypeId: leaveTypeId ?? null,
        officeId: officeId ?? null,
        departmentId: departmentId ?? null,
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
            notifyByEmail: l.notifyByEmail ?? false,
            canViewAllRequests: l.canViewAllRequests ?? false,
          })),
        },
      },
      include: { levels: { orderBy: { level: 'asc' } } },
    });
  }

  async findAll(companyId: string) {
    return this.prisma.leaveApprovalFlow.findMany({
      where: { companyId, isActive: true },
      include: {
        levels: { where: { isActive: true }, orderBy: { level: 'asc' } },
        leaveType: { select: { id: true, code: true, name: true } },
        office: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
      orderBy: { priority: 'desc' },
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
            substitute1: { select: { id: true, firstName: true, lastName: true } },
            substitute2: { select: { id: true, firstName: true, lastName: true } },
            roleDefinition: { select: { id: true, code: true, name: true } },
            targetDepartment: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!flow) throw new NotFoundException('Flow duyệt không tồn tại');
    return flow;
  }

  async update(id: string, dto: Partial<CreateLeaveFlowDto>) {
    const { levels, ...flowData } = dto;
    const flow = await this.findOne(id);

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
          notifyByEmail: l.notifyByEmail ?? false,
          canViewAllRequests: l.canViewAllRequests ?? false,
        })),
      });
    }

    return this.prisma.leaveApprovalFlow.update({
      where: { id },
      data: flowData as any,
      include: { levels: { orderBy: { level: 'asc' } } },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.leaveApprovalFlow.update({ where: { id }, data: { isActive: false } });
  }
}
