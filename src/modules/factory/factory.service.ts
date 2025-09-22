import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CreateFactoryDto } from './dto/create-factory.dto';
import { UpdateFactoryDto } from './dto/update-factory.dto';

@Injectable()
export class FactoryService {
  constructor(private prisma: PrismaService) {}

  async create(createFactoryDto: CreateFactoryDto) {
    const { code, name, officeId } = createFactoryDto;

    // Check if factory code already exists
    const existingFactory = await this.prisma.factory.findUnique({
      where: { code },
    });

    if (existingFactory) {
      throw new ConflictException('Factory with this code already exists');
    }

    // Validate office exists
    const office = await this.prisma.office.findUnique({
      where: { id: officeId },
    });

    if (!office) {
      throw new NotFoundException('Office not found');
    }

    return this.prisma.factory.create({
      data: createFactoryDto,
      include: {
        office: true,
        _count: {
          select: {
            lines: true,
            worksheets: true,
          },
        },
      },
    });
  }

  async findAll(options: { includeLines?: boolean } = {}) {
    return this.prisma.factory.findMany({
      // where: { isActive: true },
      include: {
        office: {
          select: { id: true, name: true, type: true },
        },
        lines: options.includeLines ? {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            code: true,
            description: true,
            _count: {
              select: { teams: true },
            },
          },
        } : false,
        _count: {
          select: {
            lines: true,
            worksheets: true,
          },
        },
      },
      orderBy: { code: 'asc' },
    });
  }

  async findOne(id: string) {
    const factory = await this.prisma.factory.findUnique({
      where: { id },
      include: {
        office: true,
        lines: {
          where: { isActive: true },
          include: {
            _count: {
              select: { teams: true },
            },
          },
          orderBy: { code: 'asc' },
        },
        _count: {
          select: {
            lines: true,
            worksheets: true,
          },
        },
      },
    });

    if (!factory) {
      throw new NotFoundException('Factory not found');
    }

    return factory;
  }

  async getFactoryStructure(id: string) {
    const factory = await this.prisma.factory.findUnique({
      where: { id },
      include: {
        office: {
          select: { id: true, name: true, type: true },
        },
        lines: {
          where: { isActive: true },
          include: {
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
                        lastName: true,
                      },
                    },
                    _count: {
                      select: { members: true },
                    },
                  },
                  orderBy: { code: 'asc' },
                },
                _count: {
                  select: { groups: true },
                },
              },
              orderBy: { code: 'asc' },
            },
            _count: {
              select: { teams: true },
            },
          },
          orderBy: { code: 'asc' },
        },
      },
    });

    if (!factory) {
      throw new NotFoundException('Factory not found');
    }

    return factory;
  }

  async getFactoryLines(id: string, options: { includeTeams?: boolean } = {}) {
    const factory = await this.prisma.factory.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    if (!factory) {
      throw new NotFoundException('Factory not found');
    }

    const lines = await this.prisma.line.findMany({
      where: {
        factoryId: id,
        isActive: true,
      },
      include: {
        teams: options.includeTeams ? {
          where: { isActive: true },
          include: {
            _count: {
              select: { groups: true },
            },
          },
          orderBy: { code: 'asc' },
        } : false,
        _count: {
          select: { teams: true },
        },
      },
      orderBy: { code: 'asc' },
    });

    return {
      factory,
      lines,
    };
  }

  async update(id: string, updateFactoryDto: UpdateFactoryDto) {
    const factory = await this.prisma.factory.findUnique({
      where: { id },
    });

    if (!factory) {
      throw new NotFoundException('Factory not found');
    }

    // If updating office, validate it exists
    if (updateFactoryDto.officeId) {
      const office = await this.prisma.office.findUnique({
        where: { id: updateFactoryDto.officeId },
      });

      if (!office) {
        throw new NotFoundException('Office not found');
      }
    }

    // If updating code, check for conflicts
    if (updateFactoryDto.code && updateFactoryDto.code !== factory.code) {
      const existingFactory = await this.prisma.factory.findUnique({
        where: { code: updateFactoryDto.code },
      });

      if (existingFactory) {
        throw new ConflictException('Factory with this code already exists');
      }
    }

    return this.prisma.factory.update({
      where: { id },
      data: updateFactoryDto,
      include: {
        office: true,
        _count: {
          select: {
            lines: true,
            worksheets: true,
          },
        },
      },
    });
  }

  async remove(id: string) {
    const factory = await this.prisma.factory.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            lines: true,
            worksheets: true,
          },
        },
      },
    });

    if (!factory) {
      throw new NotFoundException('Factory not found');
    }

    if (factory._count.lines > 0 || factory._count.worksheets > 0) {
      throw new ConflictException(
        'Cannot delete factory with existing lines or worksheets'
      );
    }

    return this.prisma.factory.delete({
      where: { id },
    });
  }
}
