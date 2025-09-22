import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateOfficeDto } from './dto/create-office.dto';
import { UpdateOfficeDto } from './dto/update-office.dto';

@Injectable()
export class OfficesService {
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
        },
        users: {
          include: {
            jobPosition: {
              include: {
                position: true,
                department: true,
              },
            },
          },
        },
      },
    });

    if (!office) {
      throw new NotFoundException('Office not found');
    }

    return office;
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
