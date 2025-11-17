import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import { CreatePositionDto } from '../dto/position/create-position.dto';
import { UpdatePositionDto } from '../dto/position/update-position.dto';

@Injectable()
export class PositionService {
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
      orderBy: [
        { level: 'asc' },
        { priority: 'asc' },
        { name: 'asc' },
      ],
    });
  }

  async findOne(id: string) {
    const position = await this.prisma.position.findUnique({
      where: { id },
      include: {
        jobPositions: {
          where: { isActive: true },
          include: {
            department: {
              include: { office: { select: { name: true } } },
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
            _count: { select: { users: true } },
          },
          orderBy: { department: { name: 'asc' } },
        },
        _count: {
          select: { jobPositions: true },
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
