import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/common/prisma.service';
import { CreateLeaveTypeDto } from '../dto/leave-type/create-leave-type.dto';
import { UpdateLeaveTypeDto } from '../dto/leave-type/update-leave-type.dto';

@Injectable()
export class LeaveTypeService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /leave-types/categories — danh mục cha */
  async findCategories(companyId?: string) {
    return (this.prisma as any).leaveTypeCategory.findMany({
      where: {
        isActive: true,
        OR: [{ companyId: null }, ...(companyId ? [{ companyId }] : [])],
      },
      include: {
        leaveTypes: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, code: true, name: true, nameVi: true, isAccruable: true, allowHalfDay: true, requiresDocument: true, maxDaysPerYear: true },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /** GET /leave-types — mã phép con (leaf codes) with category info */
  async findAll(companyId?: string) {
    return this.prisma.leaveType.findMany({
      where: {
        isActive: true,
        OR: [{ companyId: null }, ...(companyId ? [{ companyId }] : [])],
      },
      include: {
        category: { select: { id: true, code: true, name: true, leaveCategory: true, colorCode: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findOne(id: string) {
    const type = await this.prisma.leaveType.findUnique({
      where: { id },
      include: {
        category: true,
      },
    });
    if (!type) throw new NotFoundException('Loại phép không tồn tại');
    return type;
  }

  async create(dto: CreateLeaveTypeDto) {
    return this.prisma.leaveType.create({ data: { ...dto } as any });
  }

  async update(id: string, dto: UpdateLeaveTypeDto) {
    await this.findOne(id);
    return this.prisma.leaveType.update({ where: { id }, data: dto as any });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.leaveType.update({ where: { id }, data: { isActive: false } });
  }
}
