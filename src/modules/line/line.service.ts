import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CreateLineDto } from './dto/create-line.dto';
import { UpdateLineDto } from './dto/update-line.dto';

@Injectable()
export class LineService {
  constructor(private prisma: PrismaService) {}

  async create(createLineDto: CreateLineDto) {
    const { code, factoryId } = createLineDto;

    // Check if line code already exists in this factory
    const existingLine = await this.prisma.line.findUnique({
      where: {
        code_factoryId: { code, factoryId }
      }
    });

    if (existingLine) {
      throw new ConflictException('Line with this code already exists in factory');
    }

    // Validate factory exists
    const factory = await this.prisma.factory.findUnique({
      where: { id: factoryId }
    });

    if (!factory) {
      throw new NotFoundException('Factory not found');
    }

    return this.prisma.line.create({
      data: createLineDto,
      include: {
        factory: { select: { name: true, code: true } },
        _count: {
          select: { teams: true }
        }
      }
    });
  }

  async findAll(options: { factoryId?: string; includeTeams?: boolean } = {}) {
    // const where: any = { isActive: true };
    const where: any = {};

    if (options.factoryId) {
      where.factoryId = options.factoryId;
    }

    return this.prisma.line.findMany({
      where,
      include: {
        factory: { select: { name: true, code: true } },
        teams: options.includeTeams ? {
          where: { isActive: true },
          include: {
            _count: {
              select: { groups: true }
            }
          },
          orderBy: { code: 'asc' }
        } : false,
        _count: {
          select: { teams: true }
        }
      },
      orderBy: [
        { factory: { code: 'asc' } },
        { code: 'asc' }
      ]
    });
  }

  async findOne(id: string) {
    const line = await this.prisma.line.findUnique({
      where: { id },
      include: {
        factory: true,
        teams: {
          where: { isActive: true },
          include: {
            groups: {
              where: { isActive: true },
              include: {
                leader: {
                  select: {
                    id: true,
                    employeeCode: true,
                    firstName: true,
                    lastName: true
                  }
                },
                _count: {
                  select: { members: true }
                }
              },
              orderBy: { code: 'asc' }
            },
            _count: {
              select: { groups: true }
            }
          },
          orderBy: { code: 'asc' }
        },
        _count: {
          select: { teams: true }
        }
      }
    });

    if (!line) {
      throw new NotFoundException('Line not found');
    }

    return line;
  }

  async getLineTeams(id: string, options: { includeGroups?: boolean } = {}) {
    const line = await this.prisma.line.findUnique({
      where: { id },
      select: { id: true, name: true, code: true }
    });

    if (!line) {
      throw new NotFoundException('Line not found');
    }

    const teams = await this.prisma.team.findMany({
      where: {
        lineId: id,
        isActive: true
      },
      include: {
        groups: options.includeGroups ? {
          where: { isActive: true },
          include: {
            leader: {
              select: {
                id: true,
                employeeCode: true,
                firstName: true,
                lastName: true
              }
            },
            _count: {
              select: { members: true }
            }
          },
          orderBy: { code: 'asc' }
        } : false,
        _count: {
          select: { groups: true }
        }
      },
      orderBy: { code: 'asc' }
    });

    return { line, teams };
  }

  async update(id: string, updateLineDto: UpdateLineDto) {
    const line = await this.prisma.line.findUnique({
      where: { id }
    });

    if (!line) {
      throw new NotFoundException('Line not found');
    }

    // If updating code, check for conflicts in the same factory
    if (updateLineDto.code && updateLineDto.code !== line.code) {
      const existingLine = await this.prisma.line.findUnique({
        where: {
          code_factoryId: {
            code: updateLineDto.code,
            factoryId: line.factoryId
          }
        }
      });

      if (existingLine) {
        throw new ConflictException('Line with this code already exists in factory');
      }
    }

    return this.prisma.line.update({
      where: { id },
      data: updateLineDto,
      include: {
        factory: { select: { name: true, code: true } },
        _count: {
          select: { teams: true }
        }
      }
    });
  }

  async remove(id: string) {
    const line = await this.prisma.line.findUnique({
      where: { id },
      include: {
        _count: {
          select: { teams: true }
        }
      }
    });

    if (!line) {
      throw new NotFoundException('Line not found');
    }

    if (line._count.teams > 0) {
      throw new ConflictException('Cannot delete line with existing teams');
    }

    return this.prisma.line.delete({
      where: { id }
    });
  }
}
