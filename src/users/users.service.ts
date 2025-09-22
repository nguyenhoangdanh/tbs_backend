import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CloudflareR2Service } from '../common/r2.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { Role } from '@prisma/client';

// Define interface for uploaded file
interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private r2Service: CloudflareR2Service, // Replace FirebaseService
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: {
              include: {
                office: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { password, ...userWithoutPassword } = user;
    const isManager = user.jobPosition.position.name === "NV" && user.jobPosition.position.level === 7 ? false : true;
    return { ...userWithoutPassword, isManager };
  }

  async updateProfile(
    userId: string,
    updateProfileDto: UpdateProfileDto,
    currentUserRole?: Role,
  ) {
    const {
      employeeCode,
      jobPositionId,
      officeId,
      phone,
      email,
      role,
      ...otherData
    } = updateProfileDto;

    // Get current user to check permissions
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { jobPosition: { include: { department: true } } },
    });

    if (!currentUser) {
      throw new NotFoundException('User not found');
    }

    const isSuperAdmin = currentUserRole === Role.SUPERADMIN;

    // User can change their own info, but some fields require admin privileges
    if (employeeCode && employeeCode !== currentUser.employeeCode) {
      // Check if new employee code is already taken
      const existingUser = await this.prisma.user.findUnique({
        where: { employeeCode },
      });
      if (existingUser && existingUser.id !== userId) {
        throw new BadRequestException('Employee code is already in use');
      }
    }

    // Role change authorization - only superadmin can change roles
    if (role && role !== currentUser.role) {
      if (!isSuperAdmin) {
        throw new ForbiddenException('Only superadmin can change user roles');
      }
    }

    // Office change validation - users can change their office
    if (officeId && officeId !== currentUser.officeId) {
      const office = await this.prisma.office.findUnique({
        where: { id: officeId },
      });
      if (!office) {
        throw new BadRequestException('Office not found');
      }
    }


    // Validate job position if provided
    if (jobPositionId && jobPositionId !== currentUser.jobPositionId) {
      const jobPosition = await this.prisma.jobPosition.findUnique({
        where: { id: jobPositionId },
        include: { department: true },
      });
      if (!jobPosition) {
        throw new BadRequestException('Job position not found');
      }

      // For regular users, ensure job position belongs to their selected office
      const targetOfficeId = officeId || currentUser.officeId;
      if (jobPosition.department.officeId !== targetOfficeId) {
        throw new BadRequestException(
          'Job position must belong to the selected office',
        );
      }
    }

    // Check if email is already used by another user
    if (email && email !== currentUser.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email },
      });
      if (existingUser && existingUser.id !== userId) {
        throw new BadRequestException('Email is already in use');
      }
    }

    // Check if phone is already used by another user
    // if (phone && phone !== currentUser.phone) {
    //   const existingUser = await this.prisma.user.findUnique({
    //     where: { phone },
    //   });
    //   if (existingUser && existingUser.id !== userId) {
    //     throw new BadRequestException('Phone number is already in use');
    //   }
    // }

    // Build update data - users can update all their fields
    const updateData: any = {
      ...otherData,
    };

    // Add conditional fields
    if (employeeCode !== undefined) updateData.employeeCode = employeeCode;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (jobPositionId !== undefined) updateData.jobPositionId = jobPositionId;
    if (officeId !== undefined) updateData.officeId = officeId;
    if (role !== undefined) updateData.role = role;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: {
              include: {
                office: true,
              },
            },
          },
        },
      },
    });

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  // Admin methods for managing other users
  async updateUserByAdmin(
    adminUserId: string,
    targetUserId: string,
    updateProfileDto: UpdateProfileDto,
    adminRole: Role,
  ) {
    // Get admin user info
    const adminUser = await this.prisma.user.findUnique({
      where: { id: adminUserId },
      include: { office: true },
    });

    if (!adminUser) {
      throw new NotFoundException('Admin user not found');
    }

    // Get target user
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: { office: true },
    });

    if (!targetUser) {
      throw new NotFoundException('Target user not found');
    }

    // Superadmin can modify anyone
    if (adminRole !== Role.SUPERADMIN && adminRole !== Role.ADMIN) {
      throw new ForbiddenException('Insufficient permissions');
    }

    // Authorization: Admin can only modify users in their office
    if (
      adminRole === Role.ADMIN &&
      targetUser.officeId !== adminUser.officeId
    ) {
      throw new ForbiddenException(
        'Admin can only modify users in their office',
      );
    }

    // Use the same update logic with admin permissions
    return this.updateProfile(targetUserId, updateProfileDto, adminRole);
  }

  // Add new method for superadmin to get all users for management
  async getAllUsersForManagement() {
    return this.prisma.user.findMany({
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: true,
          },
        },
      },
      orderBy: [
        { office: { name: 'asc' } },
        { jobPosition: { department: { name: 'asc' } } },
        { lastName: 'asc' },
        { firstName: 'asc' },
      ],
    });
  }

  async getUsersByOffice(officeId: string) {
    return this.prisma.user.findMany({
      where: {
        officeId,
        isActive: true,
      },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: true,
          },
        },
      },
      orderBy: [
        { jobPosition: { department: { name: 'asc' } } },
        { lastName: 'asc' },
        { firstName: 'asc' },
      ],
    });
  }

  async getUsersByDepartment(departmentId: string) {
    return this.prisma.user.findMany({
      where: {
        jobPosition: {
          departmentId,
        },
        isActive: true,
      },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: true,
          },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async getAllUsers() {
    return this.prisma.user.findMany({
      where: { isActive: true },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: true,
          },
        },
      },
      orderBy: [
        { office: { name: 'asc' } },
        { jobPosition: { department: { name: 'asc' } } },
        { lastName: 'asc' },
        { firstName: 'asc' },
      ],
    });
  }

  async getUsersWithRankingData(filters: any) {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: {
              include: {
                office: true,
              },
            },
          },
        },
        reports: {
          where: filters.reportFilters || {},
          include: {
            tasks: {
              select: {
                isCompleted: true,
              },
            },
          },
        },
      },
      orderBy: [
        { office: { name: 'asc' } },
        { jobPosition: { department: { name: 'asc' } } },
        { lastName: 'asc' },
        { firstName: 'asc' },
      ],
    });

    // Calculate ranking for each user
    return users.map(user => {
      const totalTasks = user.reports.reduce((sum, report) => sum + report.tasks.length, 0);
      const completedTasks = user.reports.reduce(
        (sum, report) => sum + report.tasks.filter(task => task.isCompleted).length, 
        0
      );
      
      const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      const ranking = this.calculateEmployeeRanking(completionRate);
      
      const { reports, ...userWithoutReports } = user;
      
      return {
        ...userWithoutReports,
        performance: {
          totalReports: user.reports.length,
          totalTasks,
          completedTasks,
          completionRate,
          ranking,
          rankingLabel: this.getRankingLabel(ranking),
        },
      };
    });
  }

  // Helper methods for ranking calculations - Updated thresholds
  private calculateEmployeeRanking(completionRate: number): string {
    // if (completionRate >= 100) return 'EXCELLENT';
    // if (completionRate >= 95) return 'GOOD';
    // if (completionRate >= 90) return 'AVERAGE';
    // if (completionRate >= 85) return 'POOR';
    // return 'FAIL';
    if (completionRate > 90) return 'EXCELLENT';
    if (completionRate >= 80) return 'GOOD';
    if (completionRate >= 70) return 'AVERAGE';
    return 'POOR';
  }

  private getRankingLabel(ranking: string): string {
    const labels = {
      'EXCELLENT': 'Xuất sắc',
      'GOOD': 'Tốt',
      'AVERAGE': 'Trung bình',
      'POOR': 'Yếu',
      // 'FAIL': 'Kém'
    };
    return labels[ranking] || 'Chưa xếp loại';
  }

  async uploadAvatar(userId: string, file: UploadedFile) {
    try {
      // Validate file
      if (!this.r2Service.isValidImageFile(file)) {
        throw new BadRequestException('Invalid image file. Only JPEG, PNG, WEBP files under 5MB are allowed.');
      }

      // Get current user
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { 
          id: true, 
          employeeCode: true, 
          avatar: true, 
          firstName: true, 
          lastName: true 
        },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Delete old avatar if exists
      if (user.avatar) {
        await this.r2Service.deleteAvatar(user.avatar);
      }

      // Upload new avatar to R2
      const avatarUrl = await this.r2Service.uploadAvatar(
        file,
        user.id,
        user.employeeCode
      );

      // Update user record
      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: { avatar: avatarUrl },
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          avatar: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      this.logger.log(`Avatar uploaded successfully for user ${userId}`);

      return {
        message: 'Avatar uploaded successfully',
        user: {
          ...updatedUser,
          createdAt: updatedUser.createdAt.toISOString(),
          updatedAt: updatedUser.updatedAt.toISOString(),
        },
        avatarUrl,
      };
    } catch (error) {
      this.logger.error(`Avatar upload failed for user ${userId}:`, error);
      
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Failed to upload avatar');
    }
  }

  async deleteAvatar(userId: string) {
    try {
      // Get current user
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, avatar: true, firstName: true, lastName: true },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      if (!user.avatar) {
        throw new BadRequestException('User has no avatar to delete');
      }

      // Delete from R2
      await this.r2Service.deleteAvatar(user.avatar);

      // Update user record
      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: { avatar: null },
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          avatar: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      this.logger.log(`Avatar deleted successfully for user ${userId}`);

      return {
        message: 'Avatar deleted successfully',
        user: {
          ...updatedUser,
          createdAt: updatedUser.createdAt.toISOString(),
          updatedAt: updatedUser.updatedAt.toISOString(),
        },
      };
    } catch (error) {
      this.logger.error(`Avatar deletion failed for user ${userId}:`, error);
      
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Failed to delete avatar');
    }
  }

  async searchByEmployeeCode(employeeCode: string) {
    const user = await this.prisma.user.findUnique({
      where: { 
        employeeCode,
        isActive: true,
        // role: Role.USER  || Role.WORKER
      },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: {
              include: {
                office: true,
              },
            },
          },
        },
        // ✅ FIX: Use correct relation name from schema
        group: {
          include: {
            team: {
              include: {
                line: {
                  include: {
                    factory: true
                  }
                }
              }
            }
          }
        },
        // ✅ FIX: Use correct relation name from schema  
        ledGroups: {
          include: {
            team: {
              include: {
                line: {
                  include: {
                    factory: true
                  }
                }
              }
            }
          }
        }
      },
    });

    if (!user) {
      throw new NotFoundException(`User with employee code ${employeeCode} not found or not eligible`);
    }

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async getGroupMembers(groupId: string) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        leader: {
          include: {
            office: true,
            jobPosition: {
              include: {
                position: true,
                department: true,
              },
            },
          },
        },
        members: {
          include: {
            office: true,
            jobPosition: {
              include: {
                position: true,
                department: true,
              },
            },
          },
          orderBy: [
            { lastName: 'asc' },
            { firstName: 'asc' }
          ]
        }
      }
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    // Filter out password from all members
    const membersWithoutPassword = group.members.map(member => {
      const { password, ...memberWithoutPassword } = member;
      return memberWithoutPassword;
    });

    let leaderWithoutPassword = null;
    if (group.leader) {
      const { password, ...leader } = group.leader;
      leaderWithoutPassword = leader;
    }

    return {
      group: {
        id: group.id,
        name: group.name,
        code: group.code,
      },
      leader: leaderWithoutPassword,
      members: membersWithoutPassword,
      totalMembers: group.members.length
    };
  }

  async getAvailableLeaders(groupId: string) {
    // Get current group members (they are eligible to be leaders)
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          where: {
            role: Role.USER || Role.MEDICAL_STAFF,
            isActive: true
          },
          include: {
            office: true,
            jobPosition: {
              include: {
                position: true,
                department: true,
              },
            },
          },
          orderBy: [
            { lastName: 'asc' },
            { firstName: 'asc' }
          ]
        },
        leader: true
      }
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    // Filter out password from all members and add current leader status
    const availableLeaders = group.members.map(member => {
      const { password, ...memberWithoutPassword } = member;
      return {
        ...memberWithoutPassword,
        isCurrentLeader: group.leaderId === member.id
      };
    });

    return {
      group: {
        id: group.id,
        name: group.name,
        code: group.code,
      },
      currentLeader: group.leader ? {
        id: group.leader.id,
        employeeCode: group.leader.employeeCode,
        firstName: group.leader.firstName,
        lastName: group.leader.lastName,
      } : null,
      availableLeaders,
      totalAvailable: availableLeaders.length
    };
  }
}
