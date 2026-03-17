import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompanyService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateCompanyDto) {
    const { sectorIds, ...rest } = dto;

    const [codeDup, nameDup] = await Promise.all([
      this.prisma.company.findUnique({ where: { code: rest.code } }),
      this.prisma.company.findUnique({ where: { name: rest.name } }),
    ]);
    if (codeDup) throw new ConflictException(`Company code '${rest.code}' already exists`);
    if (nameDup) throw new ConflictException(`Company name '${rest.name}' already exists`);

    if (rest.taxCode) {
      const taxDup = await this.prisma.company.findUnique({ where: { taxCode: rest.taxCode } });
      if (taxDup) throw new ConflictException(`Tax code '${rest.taxCode}' already in use`);
    }

    const companyType = await this.prisma.companyType.findUnique({ where: { id: rest.typeId } });
    if (!companyType) throw new NotFoundException(`CompanyType '${rest.typeId}' not found`);

    if (rest.parentCompanyId) {
      const parent = await this.prisma.company.findUnique({
        where: { id: rest.parentCompanyId },
        include: { companyType: true },
      });
      if (!parent) throw new NotFoundException('Parent company not found');
      if (parent.companyType.level >= companyType.level) {
        throw new BadRequestException(
          `Parent type '${parent.companyType.name}' (level ${parent.companyType.level}) must be higher than '${companyType.name}' (level ${companyType.level})`,
        );
      }
    }

    return this.prisma.company.create({
      data: {
        ...rest,
        sectors: sectorIds?.length ? { connect: sectorIds.map((id) => ({ id })) } : undefined,
      },
      include: this._include(),
    });
  }

  async findAll(query: {
    search?: string;
    typeId?: string;
    sectorId?: string;
    isActive?: boolean;
    parentCompanyId?: string;
  } = {}) {
    const { search, typeId, sectorId, isActive, parentCompanyId } = query;

    return this.prisma.company.findMany({
      where: {
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { code: { contains: search, mode: 'insensitive' } },
          ],
        }),
        ...(typeId && { typeId }),
        ...(sectorId && { sectors: { some: { id: sectorId } } }),
        ...(isActive !== undefined && { isActive }),
        ...(parentCompanyId !== undefined && { parentCompanyId: parentCompanyId || null }),
      },
      include: this._include(),
      orderBy: [{ companyType: { level: 'asc' } }, { name: 'asc' }],
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

  async update(id: string, dto: UpdateCompanyDto) {
    const { sectorIds, ...rest } = dto;
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: { companyType: true },
    });
    if (!company) throw new NotFoundException('Company not found');

    if (rest.code && rest.code !== company.code) {
      const dup = await this.prisma.company.findUnique({ where: { code: rest.code } });
      if (dup) throw new ConflictException(`Company code '${rest.code}' already exists`);
    }
    if (rest.name && rest.name !== company.name) {
      const dup = await this.prisma.company.findUnique({ where: { name: rest.name } });
      if (dup) throw new ConflictException(`Company name '${rest.name}' already exists`);
    }
    if (rest.taxCode && rest.taxCode !== company.taxCode) {
      const dup = await this.prisma.company.findUnique({ where: { taxCode: rest.taxCode } });
      if (dup) throw new ConflictException(`Tax code '${rest.taxCode}' already in use`);
    }

    let newTypeLevel = company.companyType.level;
    if (rest.typeId && rest.typeId !== company.typeId) {
      const ct = await this.prisma.companyType.findUnique({ where: { id: rest.typeId } });
      if (!ct) throw new NotFoundException(`CompanyType '${rest.typeId}' not found`);
      newTypeLevel = ct.level;
    }

    if (rest.parentCompanyId && rest.parentCompanyId !== company.parentCompanyId) {
      if (rest.parentCompanyId === id) {
        throw new BadRequestException('A company cannot be its own parent');
      }
      const parent = await this.prisma.company.findUnique({
        where: { id: rest.parentCompanyId },
        include: { companyType: true },
      });
      if (!parent) throw new NotFoundException('Parent company not found');
      if (parent.companyType.level >= newTypeLevel) {
        throw new BadRequestException(
          `Parent type '${parent.companyType.name}' must be higher level than child`,
        );
      }
    }

    return this.prisma.company.update({
      where: { id },
      data: {
        ...rest,
        sectors: sectorIds !== undefined
          ? { set: sectorIds.map((sid) => ({ id: sid })) }
          : undefined,
      },
      include: this._include(),
    });
  }

  async remove(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: { _count: { select: { offices: true, users: true, children: true } } },
    });
    if (!company) throw new NotFoundException('Company not found');
    if (company._count.children > 0) throw new ConflictException('Cannot delete company with child companies');
    if (company._count.offices > 0) throw new ConflictException('Cannot delete company with existing offices');
    if (company._count.users > 0) throw new ConflictException('Cannot delete company with existing users');
    return this.prisma.company.delete({ where: { id } });
  }

  private _include() {
    return {
      companyType: true,
      parent: { select: { id: true, name: true, code: true } },
      region: { select: { id: true, name: true, code: true } },
      sectors: { select: { id: true, code: true, name: true } },
      _count: { select: { offices: true, users: true, children: true } },
    } as const;
  }
}
