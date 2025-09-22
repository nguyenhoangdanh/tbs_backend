import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { Role } from '@prisma/client';
import { UpdateGroupDto } from './dto/update-group.dto';

@Injectable()
export class GroupService {
  constructor(private prisma: PrismaService) {}

  async create(createGroupDto: CreateGroupDto) {
    const { code, teamId } = createGroupDto;

    // Check if group code already exists in this team
    const existingGroup = await this.prisma.group.findUnique({
      where: {
        code_teamId: { code, teamId }
      }
    });

    if (existingGroup) {
      throw new ConflictException('Group with this code already exists in team');
    }

    // Validate team exists
    const team = await this.prisma.team.findUnique({
      where: { id: teamId }
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    return this.prisma.group.create({
      data: createGroupDto,
      include: {
        team: {
          select: {
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
        },
        leader: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            role: true
          }
        },
        _count: {
          select: { members: true }
        }
      }
    });
  }

  async findAll(options: { teamId?: string; includeMembers?: boolean } = {}) {
    // const where: any = { isActive: true };
    const where: any = { };

    if (options.teamId) {
      where.teamId = options.teamId;
    }

    return this.prisma.group.findMany({
      where,
      include: {
        team: {
          select: {
            id: true,
            name: true,
            code: true,
            line: {
              select: {
                id: true,
                name: true,
                code: true,
                factory: {
                  select: {
                    id: true,
                    name: true,
                    code: true
                  }
                }
              }
            }
          }
        },
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
      orderBy: [
        { team: { line: { factory: { code: 'asc' } } } },
        { team: { line: { code: 'asc' } } },
        { team: { code: 'asc' } },
        { code: 'asc' }
      ]
    });
  }

  async findOne(id: string) {
    const group = await this.prisma.group.findUnique({
      where: { id },
      include: {
        team: {
          include: {
            line: {
              include: { factory: true }
            }
          }
        },
        leader: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            role: true,
            phone: true,
            email: true
          }
        },
        members: {
          where: { isActive: true },
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            role: true,
            phone: true,
            email: true
          },
          orderBy: { employeeCode: 'asc' }
        },
        _count: {
          select: {
            members: true,
            worksheets: true
          }
        }
      }
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    return group;
  }

  async update(id: string, updateGroupDto: UpdateGroupDto) {
    const group = await this.prisma.group.findUnique({
      where: { id }
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    // If updating code, check for conflicts in the same team
    if (updateGroupDto.code && updateGroupDto.code !== group.code) {
      const existingGroup = await this.prisma.group.findUnique({
        where: {
          code_teamId: {
            code: updateGroupDto.code,
            teamId: group.teamId
          }
        }
      });

      if (existingGroup) {
        throw new ConflictException('Group with this code already exists in team');
      }
    }

    return this.prisma.group.update({
      where: { id },
      data: updateGroupDto,
      include: {
        team: {
          select: {
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
        },
        leader: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            role: true
          }
        },
        _count: {
          select: { members: true }
        }
      }
    });
  }

  async assignLeader(groupId: string, leaderId: string) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId }
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    // Validate leader exists and has appropriate role
    const leader = await this.prisma.user.findUnique({
      where: { id: leaderId }
    });

    if (!leader) {
      throw new NotFoundException('User not found');
    }

    if (!leader.isActive) {
      throw new BadRequestException('User is not active');
    }

    // Check if user is already a leader of another group
    const existingLeadership = await this.prisma.group.findFirst({
      where: {
        leaderId: leaderId,
        isActive: true,
        id: { not: groupId }
      }
    });

    if (existingLeadership) {
      throw new ConflictException('User is already a leader of another group');
    }

    return this.prisma.group.update({
      where: { id: groupId },
      data: { leaderId },
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
        _count: {
          select: { members: true }
        }
      }
    });
  }

  async addMember(groupId: string, userId: string) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId }
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.isActive) {
      throw new BadRequestException('User is not active');
    }

    // Check if user is already in a group
    if (user.groupId) {
      // throw new ConflictException('User is already a member of another group');
      // Vietnamese: Người dùng đã là thành viên của một nhóm khác
      throw new ConflictException('Người dùng đã là thành viên của một nhóm khác');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { groupId },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        role: true
      }
    });
  }

  async removeMember(groupId: string, userId: string) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId }
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.groupId !== groupId) {
      throw new BadRequestException('User is not a member of this group');
    }

    // Don't allow removing group leader
    if (group.leaderId === userId) {
      throw new BadRequestException('Cannot remove group leader. Assign new leader first');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { groupId: null },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        role: true
      }
    });
  }

  async remove(id: string) {
    const group = await this.prisma.group.findUnique({
      where: { id },
      include: {
        _count: {
          select: { members: true }
        }
      }
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    if (group._count.members > 0) {
      throw new ConflictException('Cannot delete group with existing members');
    }

    return this.prisma.group.delete({
      where: { id }
    });
  }
}
