import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';

@Injectable()
export class PositionsService {
  constructor(private prisma: PrismaService) {}

  async create(createPositionDto: CreatePositionDto) {
    return this.prisma.position.create({
      data: createPositionDto,
      include: {
        _count: {
          select: { jobPositions: true },
        },
      },
    });
  }

  async findAll() {
    return this.prisma.position.findMany({
      include: {
        _count: {
          select: { jobPositions: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const position = await this.prisma.position.findUnique({
      where: { id },
      include: {
        jobPositions: {
          include: {
            department: {
              include: {
                office: true,
              },
            },
            users: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    if (!position) {
      throw new NotFoundException('Position not found');
    }

    return position;
  }

  async update(id: string, updatePositionDto: UpdatePositionDto) {
    const position = await this.prisma.position.findUnique({
      where: { id },
      include: {
        _count: {
          select: { jobPositions: true },
        },
      },
    });

    if (!position) {
      throw new NotFoundException('Position not found');
    }

    return this.prisma.position.update({
      where: { id },
      data: updatePositionDto,
      include: {
        _count: {
          select: { jobPositions: true },
        },
      },
    });
  }

  async remove(id: string) {
    const position = await this.prisma.position.findUnique({
      where: { id },
      include: {
        _count: {
          select: { jobPositions: true },
        },
      },
    });

    if (!position) {
      throw new NotFoundException('Position not found');
    }

    if (position._count.jobPositions > 0) {
      throw new ConflictException(
        'Cannot delete position with existing job positions',
      );
    }

    return this.prisma.position.delete({
      where: { id },
    });
  }
}
