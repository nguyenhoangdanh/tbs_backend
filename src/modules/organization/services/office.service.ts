import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import { CreateOfficeDto } from '../dto/office/create-office.dto';
import { UpdateOfficeDto } from '../dto/office/update-office.dto';

@Injectable()
export class OfficeService {
  constructor(private prisma: PrismaService) {}

  async create(createOfficeDto: CreateOfficeDto) {
    return this.prisma.office.create({
      data: createOfficeDto,
      include: {
        _count: {
          select: {
            departments: true,
            users: true,
          },
        },
      },
    });
  }

  async findAll() {
    return this.prisma.office.findMany({
      include: {
        _count: {
          select: {
            departments: true,
            users: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const office = await this.prisma.office.findUnique({
      where: { id },
      include: {
        departments: {
          include: {
            _count: {
              select: { jobPositions: true },
            },
          },
          orderBy: { name: 'asc' },
        },
        _count: {
          select: {
            departments: true,
            users: true,
          },
        },
      },
    });

    if (!office) {
      throw new NotFoundException('Office not found');
    }

    return office;
  }

  async getDepartments(id: string) {
    const office = await this.prisma.office.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    if (!office) {
      throw new NotFoundException('Office not found');
    }

    const departments = await this.prisma.department.findMany({
      where: { officeId: id },
      include: {
        jobPositions: {
          where: { isActive: true },
          include: {
            position: { select: { name: true, level: true } },
            _count: { select: { users: true } },
          },
          orderBy: { position: { level: 'asc' } },
        },
        _count: {
          select: { jobPositions: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return { office, departments };
  }

  async update(id: string, updateOfficeDto: UpdateOfficeDto) {
    const office = await this.prisma.office.findUnique({
      where: { id },
    });

    if (!office) {
      throw new NotFoundException('Office not found');
    }

    return this.prisma.office.update({
      where: { id },
      data: updateOfficeDto,
      include: {
        _count: {
          select: {
            departments: true,
            users: true,
          },
        },
      },
    });
  }

  async remove(id: string) {
    const office = await this.prisma.office.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            departments: true,
            users: true,
          },
        },
      },
    });

    if (!office) {
      throw new NotFoundException('Office not found');
    }

    if (office._count.users > 0 || office._count.departments > 0) {
      throw new ConflictException(
        'Cannot delete office with existing users or departments',
      );
    }

    return this.prisma.office.delete({
      where: { id },
    });
  }
}
