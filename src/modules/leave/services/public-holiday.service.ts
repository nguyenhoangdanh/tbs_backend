import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/common/prisma.service';
import { CreatePublicHolidayDto } from '../dto/public-holiday/create-public-holiday.dto';

@Injectable()
export class PublicHolidayService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePublicHolidayDto) {
    const { isRecurring: _, ...data } = dto;
    return this.prisma.publicHoliday.create({
      data: { ...data, date: new Date(dto.date) },
    });
  }

  async findAll(year?: number, companyId?: string) {
    const startOfYear = year ? new Date(year, 0, 1) : undefined;
    const endOfYear = year ? new Date(year, 11, 31) : undefined;

    return this.prisma.publicHoliday.findMany({
      where: {
        isActive: true,
        OR: [{ companyId: null }, ...(companyId ? [{ companyId }] : [])],
        ...(year ? { date: { gte: startOfYear, lte: endOfYear } } : {}),
      },
      orderBy: { date: 'asc' },
    });
  }

  async findOne(id: string) {
    const holiday = await this.prisma.publicHoliday.findUnique({ where: { id } });
    if (!holiday) throw new NotFoundException('Ngày nghỉ lễ không tồn tại');
    return holiday;
  }

  async update(id: string, dto: Partial<CreatePublicHolidayDto>) {
    await this.findOne(id);
    const { isRecurring: _, ...data } = dto;
    return this.prisma.publicHoliday.update({
      where: { id },
      data: { ...data, ...(data.date ? { date: new Date(data.date) } : {}) },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.publicHoliday.update({ where: { id }, data: { isActive: false } });
  }
}
