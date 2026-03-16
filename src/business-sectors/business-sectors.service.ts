import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateBusinessSectorDto, UpdateBusinessSectorDto } from './dto/business-sector.dto';

@Injectable()
export class BusinessSectorsService {
  constructor(private prisma: PrismaService) {}

  findAll(onlyActive = false) {
    return this.prisma.businessSector.findMany({
      where: onlyActive ? { isActive: true } : undefined,
      include: { _count: { select: { companies: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const s = await this.prisma.businessSector.findUnique({
      where: { id },
      include: { _count: { select: { companies: true } } },
    });
    if (!s) throw new NotFoundException('Business sector not found');
    return s;
  }

  async create(dto: CreateBusinessSectorDto) {
    const [codeDup, nameDup] = await Promise.all([
      this.prisma.businessSector.findUnique({ where: { code: dto.code } }),
      this.prisma.businessSector.findUnique({ where: { name: dto.name } }),
    ]);
    if (codeDup) throw new ConflictException(`Code '${dto.code}' already exists`);
    if (nameDup) throw new ConflictException(`Name '${dto.name}' already exists`);
    return this.prisma.businessSector.create({ data: dto });
  }

  async update(id: string, dto: UpdateBusinessSectorDto) {
    await this.findOne(id);
    if (dto.code) {
      const dup = await this.prisma.businessSector.findFirst({ where: { code: dto.code, NOT: { id } } });
      if (dup) throw new ConflictException(`Code '${dto.code}' already exists`);
    }
    if (dto.name) {
      const dup = await this.prisma.businessSector.findFirst({ where: { name: dto.name, NOT: { id } } });
      if (dup) throw new ConflictException(`Name '${dto.name}' already exists`);
    }
    return this.prisma.businessSector.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const s = await this.prisma.businessSector.findUnique({
      where: { id },
      include: { _count: { select: { companies: true } } },
    });
    if (!s) throw new NotFoundException('Business sector not found');
    if (s._count.companies > 0) {
      throw new ConflictException('Cannot delete sector with existing companies');
    }
    return this.prisma.businessSector.delete({ where: { id } });
  }
}
