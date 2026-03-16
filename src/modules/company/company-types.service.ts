import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CreateCompanyTypeDto, UpdateCompanyTypeDto } from './dto/company-type.dto';

@Injectable()
export class CompanyTypesService {
  constructor(private prisma: PrismaService) {}

  findAll(onlyActive = false) {
    return this.prisma.companyType.findMany({
      where: onlyActive ? { isActive: true } : undefined,
      include: { _count: { select: { companies: true } } },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const ct = await this.prisma.companyType.findUnique({
      where: { id },
      include: { _count: { select: { companies: true } } },
    });
    if (!ct) throw new NotFoundException('Company type not found');
    return ct;
  }

  async create(dto: CreateCompanyTypeDto) {
    const [codeDup, nameDup] = await Promise.all([
      this.prisma.companyType.findUnique({ where: { code: dto.code } }),
      this.prisma.companyType.findUnique({ where: { name: dto.name } }),
    ]);
    if (codeDup) throw new ConflictException(`Code '${dto.code}' already exists`);
    if (nameDup) throw new ConflictException(`Name '${dto.name}' already exists`);
    return this.prisma.companyType.create({ data: dto });
  }

  async update(id: string, dto: UpdateCompanyTypeDto) {
    await this.findOne(id);
    if (dto.code) {
      const dup = await this.prisma.companyType.findFirst({
        where: { code: dto.code, NOT: { id } },
      });
      if (dup) throw new ConflictException(`Code '${dto.code}' already exists`);
    }
    if (dto.name) {
      const dup = await this.prisma.companyType.findFirst({
        where: { name: dto.name, NOT: { id } },
      });
      if (dup) throw new ConflictException(`Name '${dto.name}' already exists`);
    }
    return this.prisma.companyType.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const ct = await this.prisma.companyType.findUnique({
      where: { id },
      include: { _count: { select: { companies: true } } },
    });
    if (!ct) throw new NotFoundException('Company type not found');
    if (ct._count.companies > 0) {
      throw new ConflictException('Cannot delete company type with existing companies');
    }
    return this.prisma.companyType.delete({ where: { id } });
  }
}
