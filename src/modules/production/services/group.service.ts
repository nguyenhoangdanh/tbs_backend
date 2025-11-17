import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import { CreateGroupDto } from '../dto/group/create-group.dto';
import { UpdateGroupDto } from '../dto/group/update-group.dto';

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
      where: { id: groupId },
      include: {
        team: {
          include: {
            line: {
              include: { factory: true }
            }
          }
        }
      }
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
      throw new ConflictException('Người dùng đã là thành viên của một nhóm khác');
    }

    // ⭐ ADD: Auto-create worksheets for recent dates (last 7 days)
    const today = new Date();
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Find existing worksheets in this group from the last 7 days
    const recentWorksheets = await this.prisma.workSheet.findMany({
      where: {
        groupId,
        date: {
          gte: sevenDaysAgo,
          lte: today
        }
      },
      distinct: ['date', 'shiftType', 'productId', 'processId'],
      select: {
        date: true,
        shiftType: true,
        productId: true,
        processId: true,
        plannedOutput: true,
        factoryId: true
      },
      orderBy: { date: 'desc' }
    });

    // Group worksheets by date
    const worksheetsByDate = new Map<string, typeof recentWorksheets[0]>();
    recentWorksheets.forEach(ws => {
      const dateKey = ws.date.toISOString().split('T')[0];
      if (!worksheetsByDate.has(dateKey)) {
        worksheetsByDate.set(dateKey, ws);
      }
    });

    // Add user to group and create missing worksheets
    return this.prisma.$transaction(async (tx) => {
      // Update user's groupId
      const updatedUser = await tx.user.update({
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

      // ⭐ Create missing worksheets for this user
      const createdWorksheets = [];
      
      for (const [dateStr, templateWorksheet] of worksheetsByDate) {
        // Check if worksheet already exists for this user on this date
        const existingWorksheet = await tx.workSheet.findFirst({
          where: {
            workerId: userId,
            date: templateWorksheet.date
          }
        });

        if (!existingWorksheet) {
          // Create worksheet for this user
          const newWorksheet = await tx.workSheet.create({
            data: {
              date: templateWorksheet.date,
              workerId: userId,
              groupId,
              factoryId: templateWorksheet.factoryId,
              productId: templateWorksheet.productId,
              processId: templateWorksheet.processId,
              shiftType: templateWorksheet.shiftType,
              plannedOutput: templateWorksheet.plannedOutput,
              createdById: userId, // Use the new user as creator
              status: 'ACTIVE'
            }
          });

          // Create records for each work hour
          const workHours = this.getWorkHoursForShift(templateWorksheet.shiftType);
          
          for (const { hour, startTime, endTime } of workHours) {
            await tx.workSheetRecord.create({
              data: {
                worksheetId: newWorksheet.id,
                workHour: hour,
                startTime: this.createDateTimeFromTimeString(templateWorksheet.date, startTime),
                endTime: this.createDateTimeFromTimeString(templateWorksheet.date, endTime),
                plannedOutput: templateWorksheet.plannedOutput,
                status: 'PENDING'
              }
            });
          }

          createdWorksheets.push({
            date: dateStr,
            shiftType: templateWorksheet.shiftType
          });
        }
      }

      console.log(`✅ Added member ${updatedUser.employeeCode} to group ${groupId}`);
      console.log(`📝 Auto-created ${createdWorksheets.length} worksheets for recent dates`);

      return {
        user: updatedUser,
        autoCreatedWorksheets: createdWorksheets
      };
    });
  }

  // Helper methods for worksheet creation
  private getWorkHoursForShift(shiftType: string) {
    const baseHours = [
      { hour: 1, startTime: '07:30', endTime: '08:30' },
      { hour: 2, startTime: '08:30', endTime: '09:30' },
      { hour: 3, startTime: '09:30', endTime: '10:30' },
      { hour: 4, startTime: '10:30', endTime: '11:30' },
      { hour: 5, startTime: '12:30', endTime: '13:30' },
      { hour: 6, startTime: '13:30', endTime: '14:30' },
      { hour: 7, startTime: '14:30', endTime: '15:30' },
      { hour: 8, startTime: '15:30', endTime: '16:30' }
    ];

    switch (shiftType) {
      case 'EXTENDED_9_5H':
        return [
          ...baseHours,
          { hour: 9, startTime: '16:30', endTime: '18:00' }
        ];
      case 'OVERTIME_11H':
        return [
          ...baseHours,
          { hour: 9, startTime: '17:00', endTime: '18:00' },
          { hour: 10, startTime: '18:00', endTime: '19:00' },
          { hour: 11, startTime: '19:00', endTime: '20:00' }
        ];
      default:
        return baseHours;
    }
  }

  private createDateTimeFromTimeString(date: Date, timeString: string): Date {
    const [hours, minutes] = timeString.split(':').map(Number);
    
    if (isNaN(hours) || isNaN(minutes)) {
      throw new BadRequestException(`Invalid time string: ${timeString}`);
    }
    
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    
    return new Date(Date.UTC(year, month, day, hours, minutes, 0, 0));
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
