import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';

@Injectable()
export class TeamService {
  constructor(private prisma: PrismaService) {}

  async create(createTeamDto: CreateTeamDto) {
    const { code, lineId } = createTeamDto;

    // Check if team code already exists in this line
    const existingTeam = await this.prisma.team.findUnique({
      where: {
        code_lineId: { code, lineId }
      }
    });

    if (existingTeam) {
      throw new ConflictException('Team with this code already exists in line');
    }

    // Validate line exists
    const line = await this.prisma.line.findUnique({
      where: { id: lineId }
    });

    if (!line) {
      throw new NotFoundException('Line not found');
    }

    return this.prisma.team.create({
      data: createTeamDto,
      include: {
        line: {
          select: {
            name: true,
            code: true,
            factory: { select: { name: true, code: true } }
          }
        },
        _count: {
          select: { groups: true }
        }
      }
    });
  }

  async findAll(options: { lineId?: string; includeGroups?: boolean } = {}) {
    // const where: any = { isActive: true };
    const where: any = { };

    if (options.lineId) {
      where.lineId = options.lineId;
    }

    return this.prisma.team.findMany({
      where,
      include: {
        line: {
          select: {
            id: true,
            name: true,
            code: true,
            factory: { select: { id: true, name: true, code: true } }
          }
        },
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
      orderBy: [
        { line: { factory: { code: 'asc' } } },
        { line: { code: 'asc' } },
        { code: 'asc' }
      ]
    });
  }

  async findOne(id: string) {
    const team = await this.prisma.team.findUnique({
      where: { id },
      include: {
        line: {
          include: {
            factory: true
          }
        },
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
            members: {
              where: { isActive: true },
              select: {
                id: true,
                employeeCode: true,
                firstName: true,
                lastName: true,
                role: true
              },
              orderBy: { employeeCode: 'asc' }
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
      }
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    return team;
  }

  async getTeamGroups(id: string, options: { includeMembers?: boolean } = {}) {
    const team = await this.prisma.team.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        code: true,
        line: {
          select: {
            name: true,
            code: true,
            factory: { select: { name: true, code: true } }
          }
        }
      }
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    const groups = await this.prisma.group.findMany({
      where: {
        teamId: id,
        isActive: true
      },
      include: {
        leader: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            role: true
          }
        },
        members: options.includeMembers ? {
          where: { isActive: true },
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            role: true
          },
          orderBy: { employeeCode: 'asc' }
        } : false,
        _count: {
          select: { members: true }
        }
      },
      orderBy: { code: 'asc' }
    });

    return { team, groups };
  }

  async update(id: string, updateTeamDto: UpdateTeamDto) {
    const team = await this.prisma.team.findUnique({
      where: { id }
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    // If updating code, check for conflicts in the same line
    if (updateTeamDto.code && updateTeamDto.code !== team.code) {
      const existingTeam = await this.prisma.team.findUnique({
        where: {
          code_lineId: {
            code: updateTeamDto.code,
            lineId: team.lineId
          }
        }
      });

      if (existingTeam) {
        throw new ConflictException('Team with this code already exists in line');
      }
    }

    return this.prisma.team.update({
      where: { id },
      data: updateTeamDto,
      include: {
        line: {
          select: {
            name: true,
            code: true,
            factory: { select: { name: true, code: true } }
          }
        },
        _count: {
          select: { groups: true }
        }
      }
    });
  }

  async remove(id: string) {
    const team = await this.prisma.team.findUnique({
      where: { id },
      include: {
        _count: {
          select: { groups: true }
        }
      }
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    if (team._count.groups > 0) {
      throw new ConflictException('Cannot delete team with existing groups');
    }

    return this.prisma.team.delete({
      where: { id }
    });
  }
}
