import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CreateRegionDto, UpdateRegionDto } from './dto/region.dto';

@Injectable()
export class RegionsService {
  constructor(private prisma: PrismaService) {}

  findAll(onlyActive = false) {
    return this.prisma.region.findMany({
      where: onlyActive ? { isActive: true } : undefined,
      include: { _count: { select: { companies: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const r = await this.prisma.region.findUnique({
      where: { id },
      include: { _count: { select: { companies: true } } },
    });
    if (!r) throw new NotFoundException('Region not found');
    return r;
  }

  async create(dto: CreateRegionDto) {
    const [codeDup, nameDup] = await Promise.all([
      this.prisma.region.findUnique({ where: { code: dto.code } }),
      this.prisma.region.findUnique({ where: { name: dto.name } }),
    ]);
    if (codeDup) throw new ConflictException(`Code '${dto.code}' already exists`);
    if (nameDup) throw new ConflictException(`Name '${dto.name}' already exists`);
    return this.prisma.region.create({ data: dto });
  }

  async update(id: string, dto: UpdateRegionDto) {
    await this.findOne(id);
    if (dto.code) {
      const dup = await this.prisma.region.findFirst({ where: { code: dto.code, NOT: { id } } });
      if (dup) throw new ConflictException(`Code '${dto.code}' already exists`);
    }
    if (dto.name) {
      const dup = await this.prisma.region.findFirst({ where: { name: dto.name, NOT: { id } } });
      if (dup) throw new ConflictException(`Name '${dto.name}' already exists`);
    }
    return this.prisma.region.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const r = await this.prisma.region.findUnique({
      where: { id },
      include: { _count: { select: { companies: true } } },
    });
    if (!r) throw new NotFoundException('Region not found');
    if (r._count.companies > 0) {
      throw new ConflictException('Cannot delete region with existing companies');
    }
    return this.prisma.region.delete({ where: { id } });
  }
}
