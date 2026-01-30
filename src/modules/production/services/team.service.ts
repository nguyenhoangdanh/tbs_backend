import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import { CreateTeamDto } from '../dto/team/create-team.dto';
import { UpdateTeamDto } from '../dto/team/update-team.dto';
import { TransferTeamDto } from '../dto/team/transfer-team.dto';

@Injectable()
export class TeamService {
  constructor(private prisma: PrismaService) {}

  async create(createTeamDto: CreateTeamDto) {
    const { code, departmentId } = createTeamDto;

    // Check if team code already exists in this department
    const existingTeam = await this.prisma.team.findUnique({
      where: {
        code_departmentId: { code, departmentId },
      },
    });

    if (existingTeam) {
      throw new ConflictException('Team with this code already exists in department');
    }

    // Validate department exists
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    return this.prisma.team.create({
      data: createTeamDto,
      include: {
        department: {
          select: {
            name: true,
            office: { select: { name: true, type: true } },
          },
        },
        _count: {
          select: { groups: true },
        },
      },
    });
  }

  async findAll(options: { departmentId?: string; includeGroups?: boolean } = {}) {
    const where: any = {};

    if (options.departmentId) {
      where.departmentId = options.departmentId;
    }

    return this.prisma.team.findMany({
      where,
      include: {
        department: {
          select: {
            id: true,
            name: true,
            office: { select: { id: true, name: true, type: true } },
          },
        },
        groups: options.includeGroups
          ? {
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
            }
          : false,
        _count: {
          select: { groups: true },
        },
      },
      orderBy: [
        { department: { office: { name: 'asc' } } },
        { department: { name: 'asc' } },
        { code: 'asc' },
      ],
    });
  }

  async findOne(id: string) {
    const team = await this.prisma.team.findUnique({
      where: { id },
      include: {
        department: {
          include: {
            office: true,
          },
        },
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
            members: {
              where: { isActive: true },
              select: {
                id: true,
                employeeCode: true,
                firstName: true,
                lastName: true,
                // role removed
              },
              orderBy: { employeeCode: 'asc' },
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
        department: {
          select: {
            name: true,
            office: { select: { name: true } },
          },
        },
      },
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    const groups = await this.prisma.group.findMany({
      where: {
        teamId: id,
        isActive: true,
      },
      include: {
        leader: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            // role removed
          },
        },
        members: options.includeMembers
          ? {
              where: { isActive: true },
              select: {
                id: true,
                employeeCode: true,
                firstName: true,
                lastName: true,
                // role removed
              },
              orderBy: { employeeCode: 'asc' },
            }
          : false,
        _count: {
          select: { members: true },
        },
      },
      orderBy: { code: 'asc' },
    });

    return { team, groups };
  }

  async update(id: string, updateTeamDto: UpdateTeamDto) {
    const team = await this.prisma.team.findUnique({
      where: { id },
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    // If updating code, check for conflicts in the same department
    if (updateTeamDto.code && updateTeamDto.code !== team.code) {
      const existingTeam = await this.prisma.team.findUnique({
        where: {
          code_departmentId: {
            code: updateTeamDto.code,
            departmentId: team.departmentId,
          },
        },
      });

      if (existingTeam) {
        throw new ConflictException(
          'Team with this code already exists in department',
        );
      }
    }

    return this.prisma.team.update({
      where: { id },
      data: updateTeamDto,
      include: {
        department: {
          select: {
            name: true,
            office: { select: { name: true, type: true } },
          },
        },
        _count: {
          select: { groups: true },
        },
      },
    });
  }

  async remove(id: string) {
    const team = await this.prisma.team.findUnique({
      where: { id },
      include: {
        _count: {
          select: { groups: true },
        },
      },
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    if (team._count.groups > 0) {
      throw new ConflictException('Cannot delete team with existing groups');
    }

    return this.prisma.team.delete({
      where: { id },
    });
  }

  /**
   * Transfer team to another department (line)
   */
  async transferTeam(teamId: string, transferDto: TransferTeamDto) {
    const { targetDepartmentId, newCode } = transferDto;

    // Validate team exists
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: {
        department: {
          select: {
            id: true,
            name: true,
            office: { select: { id: true, name: true, type: true } },
          },
        },
        _count: { select: { groups: true } },
      },
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    // Validate target department exists
    const targetDepartment = await this.prisma.department.findUnique({
      where: { id: targetDepartmentId },
      select: {
        id: true,
        name: true,
        office: { select: { id: true, name: true, type: true } },
      },
    });

    if (!targetDepartment) {
      throw new NotFoundException('Target department not found');
    }

    // Check if already in target department
    if (team.departmentId === targetDepartmentId && !newCode) {
      throw new ConflictException('Team is already in target department');
    }

    // Determine final code
    const finalCode = newCode || team.code;

    // Check code conflict in target department
    const existingTeam = await this.prisma.team.findUnique({
      where: {
        code_departmentId: { code: finalCode, departmentId: targetDepartmentId },
      },
    });

    if (existingTeam && existingTeam.id !== teamId) {
      throw new ConflictException(
        `Team with code '${finalCode}' already exists in target department`,
      );
    }

    // Perform transfer
    const transferredTeam = await this.prisma.team.update({
      where: { id: teamId },
      data: {
        departmentId: targetDepartmentId,
        code: finalCode,
      },
      include: {
        department: {
          select: {
            name: true,
            office: { select: { name: true, type: true } },
          },
        },
        groups: {
          where: { isActive: true },
          include: { _count: { select: { members: true } } },
          orderBy: { code: 'asc' },
        },
        _count: { select: { groups: true } },
      },
    });

    return {
      team: transferredTeam,
      transfer: {
        from: {
          departmentId: team.departmentId,
          departmentName: team.department.name,
          officeName: team.department.office.name,
        },
        to: {
          departmentId: targetDepartment.id,
          departmentName: targetDepartment.name,
          officeName: targetDepartment.office.name,
        },
        groupsAffected: team._count.groups,
      },
    };
  }
}
