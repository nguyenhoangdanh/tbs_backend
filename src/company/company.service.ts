import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompanyService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateCompanyDto) {
    const existing = await this.prisma.company.findFirst({
      where: { OR: [{ code: dto.code }, { name: dto.name }] },
    });
    if (existing) {
      throw new ConflictException(
        existing.code === dto.code
          ? `Company code '${dto.code}' already exists`
          : `Company name '${dto.name}' already exists`,
      );
    }

    if (dto.taxCode) {
      const taxDup = await this.prisma.company.findUnique({
        where: { taxCode: dto.taxCode },
      });
      if (taxDup) throw new ConflictException(`Tax code '${dto.taxCode}' already in use`);
    }

    if (dto.parentCompanyId) {
      const parent = await this.prisma.company.findUnique({
        where: { id: dto.parentCompanyId },
      });
      if (!parent) throw new NotFoundException('Parent company not found');
    }

    return this.prisma.company.create({
      data: dto,
      include: this._include(),
    });
  }

  async findAll(query: {
    search?: string;
    type?: string;
    sector?: string;
    isActive?: boolean;
    parentCompanyId?: string;
  } = {}) {
    const { search, type, sector, isActive, parentCompanyId } = query;

    return this.prisma.company.findMany({
      where: {
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { code: { contains: search, mode: 'insensitive' } },
          ],
        }),
        ...(type && { type: type as any }),
        ...(sector && { sector: sector as any }),
        ...(isActive !== undefined && { isActive }),
        ...(parentCompanyId !== undefined && { parentCompanyId: parentCompanyId || null }),
      },
      include: this._include(),
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        ...this._include(),
        children: {
          include: this._include(),
          orderBy: { name: 'asc' },
        },
        offices: {
          include: { _count: { select: { users: true, departments: true } } },
          orderBy: { name: 'asc' },
        },
      },
    });

    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  async findTree() {
    // Return all companies structured as tree (top-level only, children nested)
    const roots = await this.prisma.company.findMany({
      where: { parentCompanyId: null },
      include: {
        ...this._include(),
        children: {
          include: {
            ...this._include(),
            children: {
              include: this._include(),
              orderBy: { name: 'asc' },
            },
          },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    return roots;
  }

  async findRegions() {
    return this.prisma.region.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async update(id: string, dto: UpdateCompanyDto) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundException('Company not found');

    if (dto.code && dto.code !== company.code) {
      const dup = await this.prisma.company.findFirst({ where: { code: dto.code } });
      if (dup) throw new ConflictException(`Company code '${dto.code}' already exists`);
    }

    if (dto.name && dto.name !== company.name) {
      const dup = await this.prisma.company.findFirst({ where: { name: dto.name } });
      if (dup) throw new ConflictException(`Company name '${dto.name}' already exists`);
    }

    if (dto.taxCode && dto.taxCode !== company.taxCode) {
      const dup = await this.prisma.company.findUnique({ where: { taxCode: dto.taxCode } });
      if (dup) throw new ConflictException(`Tax code '${dto.taxCode}' already in use`);
    }

    if (dto.parentCompanyId && dto.parentCompanyId !== company.parentCompanyId) {
      if (dto.parentCompanyId === id) {
        throw new BadRequestException('A company cannot be its own parent');
      }
      const parent = await this.prisma.company.findUnique({ where: { id: dto.parentCompanyId } });
      if (!parent) throw new NotFoundException('Parent company not found');
    }

    return this.prisma.company.update({
      where: { id },
      data: dto,
      include: this._include(),
    });
  }

  async remove(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        _count: {
          select: { offices: true, users: true, children: true },
        },
      },
    });

    if (!company) throw new NotFoundException('Company not found');

    if (company._count.children > 0) {
      throw new ConflictException('Cannot delete company with child companies');
    }
    if (company._count.offices > 0) {
      throw new ConflictException('Cannot delete company with existing offices');
    }
    if (company._count.users > 0) {
      throw new ConflictException('Cannot delete company with existing users');
    }

    return this.prisma.company.delete({ where: { id } });
  }

  private _include() {
    return {
      parent: { select: { id: true, name: true, code: true } },
      region: { select: { id: true, name: true, code: true } },
      _count: {
        select: { offices: true, users: true, children: true },
      },
    } as const;
  }
}
