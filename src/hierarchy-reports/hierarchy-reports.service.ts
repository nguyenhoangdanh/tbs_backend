import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Role } from '@prisma/client';
import { getCurrentWorkWeek } from '../common/utils/week-utils';
import { off } from 'node:process';

interface HierarchyFilters {
  weekNumber?: number;
  year?: number;
  month?: number;
  officeId?: string;
  departmentId?: string;
  page?: number;
  limit?: number;
  status?: 'not_submitted' | 'incomplete' | 'completed' | 'all';
  weeks?: number;
}

@Injectable()
export class HierarchyReportsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Management hierarchy view - Group by Position (chức vụ quản lý)
   */
  private async getManagementHierarchyView(userId: string, userRole: Role, weekNumber: number, year: number, filters: HierarchyFilters = {}) {
    // Get management positions - CHỈ dựa trên isManagement và tên chức danh
    const positions = await this.prisma.position.findMany({
      where: {
        isReportable: true,
        // Kết hợp nhiều điều kiện để xác định management positions
        OR: [
          { isManagement: true }, // Đã được set rõ ràng
          // Hoặc dựa trên tên chức danh
          { 
            name: {
              contains: 'giám đốc',
              mode: 'insensitive'
            }
          },
          { 
            name: {
              contains: 'trưởng',
              mode: 'insensitive'
            }
          },
          { 
            name: {
              contains: 'phó',
              mode: 'insensitive'
            }
          },
          { 
            name: {
              contains: 'manager',
              mode: 'insensitive'
            }
          },
          { 
            name: {
              contains: 'leader',
              mode: 'insensitive'
            }
          },
          { 
            name: {
              contains: 'supervisor',
              mode: 'insensitive'
            }
          }
        ],
        jobPositions: {
          some: {
            users: {
              some: { 
                isActive: true,
                role: { not: Role.WORKER },
                ...(await this.buildUserAccessFilter(userId, userRole))
              }
            }
          }
        }
      },
      include: {
        jobPositions: {
          where: {
            isActive: true,
            users: {
              some: { 
                isActive: true,
                role: { not: Role.WORKER },
                ...(await this.buildUserAccessFilter(userId, userRole))
              }
            }
          },
          include: {
            users: {
              where: { 
                isActive: true,
                ...(await this.buildUserAccessFilter(userId, userRole))
              },
              include: {
                office: true,
                jobPosition: {
                  include: {
                    department: {
                      include: {
                        office: true
                      }
                    },
                    position: {
                      select: {
                        id: true,
                        name: true,
                        description: true,
                        isManagement: true
                      }
                    }
                  }
                },
                reports: {
                  where: { weekNumber, year },
                  include: {
                    tasks: {
                      include: {
                        evaluations: {
                          include: {
                            evaluator: {
                              select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                employeeCode: true,
                                jobPosition: {
                                  include: {
                                    position: true,
                                    department: true
                                  }
                                }
                              }
                            }
                          },
                          orderBy: {
                            createdAt: 'desc'
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      orderBy: [
        { level: 'asc' }, // Level vẫn dùng để sắp xếp
        { name: 'asc' }
      ]
    });


    const positionStats = positions.map(position => {
      const allUsers = position.jobPositions.flatMap(jp => jp.users);
      const stats = this.calculatePositionStats(allUsers, weekNumber, year);
      
      
      return {
        position: {
          id: position.id,
          name: position.name,
          level: position.level,
          description: position.description,
          isManagement: position.isManagement || position.level <= 5 // Fallback logic
        },
        stats,
        userCount: allUsers.length,
        departmentBreakdown: this.calculateDepartmentBreakdown(allUsers),
        users: allUsers.map(user => this.mapUserToPositionUser(user))
      };
    });

    const summary = this.calculateManagementSummary(positionStats);

    return {
      weekNumber,
      year,
      viewType: 'management' as const,
      groupBy: 'position' as const,
      positions: positionStats,
      summary
    };
  }

  /**
   * Staff hierarchy view - Group by JobPosition (vị trí công việc nhân viên)
   */
  private async getStaffHierarchyView(userId: string, userRole: Role, weekNumber: number, year: number, filters: HierarchyFilters = {}) {
    // Get staff job positions - Loại trừ management positions
    const jobPositions = await this.prisma.jobPosition.findMany({
      where: {
        isActive: true,
        position: { 
          // CHỈ lấy positions KHÔNG phải management
          AND: [
            { isManagement: false },
            // VÀ không chứa các từ khóa quản lý
            { 
              name: {
                notIn: ['TGĐ', 'Tổng Giám Đốc', 'Giám Đốc', 'Phó Giám Đốc'],
                mode: 'insensitive'
              }
            },
            {
              NOT: {
                OR: [
                  { name: { contains: 'trưởng', mode: 'insensitive' } },
                  { name: { contains: 'phó', mode: 'insensitive' } },
                  { name: { contains: 'manager', mode: 'insensitive' } },
                  { name: { contains: 'leader', mode: 'insensitive' } },
                  { name: { contains: 'supervisor', mode: 'insensitive' } }
                ]
              }
            }
          ]
        },
        users: {
          some: { 
            isActive: true,
            role: { not: Role.WORKER },
            ...(await this.buildUserAccessFilter(userId, userRole))
          }
        }
      },
      include: {
        position: true,
        department: {
          include: {
            office: true
          }
        },
        users: {
          where: { 
            isActive: true,
            // Apply role-based access filter
            ...(await this.buildUserAccessFilter(userId, userRole))
          },
          include: {
            office: true,
            jobPosition: {
              include: {
                department: {
                  include: {
                    office: true
                  }
                },
                position: {
                  select: {
                    id: true,
                    name: true,
                    description: true,
                    isManagement: true
                  }
                }
              }
            },
            reports: {
              where: { weekNumber, year },
              include: {
                tasks: true
              }
            }
          }
        }
      },
      orderBy: [
        { department: { name: 'asc' } },
        { jobName: 'asc' }
      ]
    });

    // Group jobPositions by jobName (consolidate across offices)
    const jobNameGroups = new Map();
    
    jobPositions.forEach(jobPosition => {
      const jobName = jobPosition.jobName;
      
      if (!jobNameGroups.has(jobName)) {
        jobNameGroups.set(jobName, {
          jobName,
          position: jobPosition.position,
          users: [],
          departments: new Set(),
          offices: new Set()
        });
      }
      
      const group = jobNameGroups.get(jobName);
      
      // Add users to the group
      group.users.push(...jobPosition.users);
      
      // Track departments and offices for this job name
      group.departments.add(jobPosition.department.name);
      group.offices.add(jobPosition.department.office.name);
    });

    // Convert grouped data to stats format
    const jobPositionStats = Array.from(jobNameGroups.values()).map(group => {
      const stats = this.calculateJobPositionStats(group.users, weekNumber, year);
      
      return {
        jobPosition: {
          id: `grouped_${group.jobName.replace(/\s+/g, '_')}`, // Generate unique ID for grouped data
          jobName: group.jobName,
          code: null, // No single code for grouped data
          description: `${group.jobName} - Across ${group.offices.size} offices`,
          position: group.position,
          departments: Array.from(group.departments),
          offices: Array.from(group.offices),
          isGrouped: true // Flag to indicate this is grouped data
        },
        stats,
        userCount: group.users.length,
        users: group.users.map(user => this.mapUserToPositionUser(user))
      };
    });

    // Sort by jobName
    jobPositionStats.sort((a, b) => a.jobPosition.jobName.localeCompare(b.jobPosition.jobName));

    const summary = this.calculateStaffSummary(jobPositionStats);

    return {
      weekNumber,
      year,
      viewType: 'staff' as const,
      groupBy: 'jobName' as const, // Changed from 'jobPosition' to 'jobName'
      jobPositions: jobPositionStats,
      summary
    };
  }

  /**
   * Mixed hierarchy view - Trả về cả positions và jobPositions
   */
  private async getMixedHierarchyView(userId: string, userRole: Role, weekNumber: number, year: number, filters: HierarchyFilters = {}) {
    // Get both management positions and staff job positions
    const [managementView, staffView] = await Promise.all([
      this.getManagementHierarchyView(userId, userRole, weekNumber, year, filters),
      this.getStaffHierarchyView(userId, userRole, weekNumber, year, filters)
    ]);

    // Combine summaries
    const combinedSummary = {
      totalPositions: managementView.positions.length,
      totalJobPositions: staffView.jobPositions.length,
      totalUsers: managementView.summary.totalUsers + staffView.summary.totalUsers,
      totalUsersWithReports: managementView.summary.totalUsersWithReports + staffView.summary.totalUsersWithReports,
      averageSubmissionRate: Math.round(
        ((managementView.summary.averageSubmissionRate + staffView.summary.averageSubmissionRate) / 2)
      ),
      averageCompletionRate: Math.round(
        ((managementView.summary.averageCompletionRate + staffView.summary.averageCompletionRate) / 2)
      ),
      managementSummary: managementView.summary,
      staffSummary: staffView.summary
    };

    return {
      weekNumber,
      year,
      viewType: 'mixed' as const,
      groupBy: 'mixed' as const,
      positions: managementView.positions, // Chức vụ quản lý
      jobPositions: staffView.jobPositions, // Vị trí công việc
      summary: combinedSummary
    };
  }

  // Updated buildUserAccessFilter to support recursive subordinate access
  /**
 * ENHANCED: Build user access filter with department management support
 */
private async buildUserAccessFilter(userId: string, userRole: Role) {
  if (userRole === Role.SUPERADMIN || userRole === Role.ADMIN) {
    return {};
  }
  
  if (userRole === Role.USER || userRole === Role.MEDICAL_STAFF) {
    const user = await this.prisma.user.findUnique({
      where: { 
        id: userId,
        isActive: true,
        role: { not: Role.WORKER },
      },
      include: {
        jobPosition: {
          include: {
            position: true,
            department: true
          }
        },
        managedDepartments: {
          where: { isActive: true },
          include: {
            department: true
          }
        }
      }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const position = user.jobPosition?.position;
    const userLevel = position?.level || 999;
    const userDepartmentId = user.jobPosition?.departmentId;
    const managedDepartmentIds = user.managedDepartments.map(md => md.departmentId);

    // Build access conditions
    const accessConditions = [];

    // 1. Direct department management (UserDepartmentManagement)
    if (managedDepartmentIds.length > 0) {
      accessConditions.push({
        jobPosition: {
          departmentId: { in: managedDepartmentIds }
        }
      });
    }

    // 2. Hierarchical management within same department
    if (userDepartmentId && position?.canViewHierarchy) {
      accessConditions.push({
        AND: [
          { jobPosition: { departmentId: userDepartmentId } },
          { jobPosition: { position: { level: { gt: userLevel } } } }
        ]
      });
    }

    // 3. Same department colleagues (for non-management)
    if (!position?.canViewHierarchy) {
      accessConditions.push({
        AND: [
          { jobPosition: { departmentId: userDepartmentId } },
          { jobPosition: { position: { isManagement: false } } }
        ]
      });
    }

    if (accessConditions.length > 0) {
      return { OR: accessConditions };
    } else {
      return { id: 'no-access' };
    }
  }
  
  return {};
}

/**
 * ENHANCED: Get subordinates with department management support
 */
private async getSubordinates(manager: any, userRole: Role) {
  if (userRole === Role.ADMIN || userRole === Role.SUPERADMIN) {
    return await this.prisma.user.findMany({
      where: {
        isActive: true,
        id: { not: manager.id },
        role: { not: Role.WORKER }
      },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: { include: { office: true } }
          }
        }
      },
      orderBy: [
        { jobPosition: { position: { level: 'asc' } } },
        { jobPosition: { department: { name: 'asc' } } },
        { lastName: 'asc' }, { firstName: 'asc' }
      ]
    });
  }

  if (userRole === Role.USER || userRole === Role.MEDICAL_STAFF) {
    // Get manager's information with managed departments
    const managerWithDepartments = await this.prisma.user.findUnique({
      where: { 
        id: manager.id,
        isActive: true,
        role: { not: Role.WORKER },
      },
      include: {
        jobPosition: {
          include: {
            position: true,
            department: true,
            office: true
          }
        },
        managedDepartments: {
          where: { isActive: true },
          select: { departmentId: true }
        }
      }
    });

    if (!managerWithDepartments) {
      return [];
    }

    const position = managerWithDepartments.jobPosition?.position;
    const managerLevel = position?.level || 999;
    const managerDepartmentId = managerWithDepartments.jobPosition?.departmentId;
    const managedDepartmentIds = managerWithDepartments.managedDepartments.map(md => md.departmentId);
    const managerOfficeId = managerWithDepartments.jobPosition?.officeId;

    // Build subordinates query conditions
    const subordinateConditions = [];

    // 1. Users in directly managed departments
    if (managedDepartmentIds.length > 0) {
      subordinateConditions.push({
        // users:{
        //   some: { 
        //     isActive: true,
        //     role: { not: Role.WORKER },
        //   },
        // },
        // position: {
        //    isManagement: false,
        //    level: { gt: 5 } // Non-management only
        // },
        jobPosition: {
          departmentId: { in: managedDepartmentIds }
        }
      });
    }

    // Check office constraint
    // const managerOfficeId = managerWithDepartments.jobPosition?.officeId;
    // if (!managerOfficeId) {
    //   return [];
    // }
    // // Always include users in the same office
    // subordinateConditions.push({
    //   officeId: managerOfficeId
    // });

    // 2. Hierarchical subordinates in same department
    if (managerDepartmentId && position?.canViewHierarchy) {
      const targetLevels = this.getTargetLevelsForManager(managerLevel);

      if (targetLevels.length > 0) {
        subordinateConditions.push({
          AND: [
            { jobPosition: { departmentId: managerDepartmentId } },
            { jobPosition: { position: { level: { in: targetLevels } } } }
          ]
        });
      }
    }

    // 3. Same department colleagues (for non-management)
    if (!position?.canViewHierarchy && managerDepartmentId) {
      subordinateConditions.push({
        AND: [
          { jobPosition: { departmentId: managerDepartmentId } },
          { jobPosition: { position: { isManagement: false } } }
        ]
      });
    }

    if (subordinateConditions.length === 0) {
      return [];
    }

    return await this.prisma.user.findMany({
      where: {
        isActive: true,
        id: { not: manager.id },
        role: { not: Role.WORKER },
        officeId: managerWithDepartments.officeId, // Same office constraint
        OR: subordinateConditions
      },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: { include: { office: true } }
          }
        }
      },
      orderBy: [
        { jobPosition: { position: { level: 'asc' } } },
        { jobPosition: { department: { name: 'asc' } } },
        { lastName: 'asc' }, { firstName: 'asc' }
      ]
    });
  }

  return [];
}

  /**
   * Get hierarchy view based on user role and permissions
   */
  async getMyHierarchyView(userId: string, userRole: Role, filters: HierarchyFilters = {}) {
    const { weekNumber, year } = this.getWeekFilters(filters);


    const user = await this.prisma.user.findUnique({
      where: { 
        id: userId,
        isActive: true,
        role: { not: Role.WORKER },
      },
      include: {
        office: true,
        jobPosition: {
          include: {
            department: true,
            position: true
          }
        }
      }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }


    // Xác định quyền xem dựa trên role và position
    const isAdminRole = userRole === Role.SUPERADMIN || userRole === Role.ADMIN;
    const userCanViewHierarchy = user.jobPosition?.position?.canViewHierarchy === true;

    // Check if there are management positions and job positions accessible to user
    const [managementPositionCount, jobPositionCount] = await Promise.all([
      this.prisma.position.count({
        where: {
          isReportable: true,
          OR: [
            { isManagement: true },
            { name: { contains: 'giám đốc', mode: 'insensitive' } },
            { name: { contains: 'trưởng', mode: 'insensitive' } },
            { name: { contains: 'phó', mode: 'insensitive' } },
            { name: { contains: 'manager', mode: 'insensitive' } },
            { name: { contains: 'leader', mode: 'insensitive' } }
          ],
          jobPositions: {
            some: {
              users: {
                some: { 
                  isActive: true,
                  role: { not: Role.WORKER },
                  ...(await this.buildUserAccessFilter(userId, userRole))
                }
              }
            }
          }
        }
      }),
      this.prisma.jobPosition.count({
        where: {
          isActive: true,
          position: { 
            AND: [
              { isManagement: false },
              {
                NOT: {
                  OR: [
                    { name: { contains: 'trưởng', mode: 'insensitive' } },
                    { name: { contains: 'phó', mode: 'insensitive' } },
                    { name: { contains: 'manager', mode: 'insensitive' } },
                    { name: { contains: 'leader', mode: 'insensitive' } }
                  ]
                }
              }
            ]
          },
          users: {
            some: { 
              isActive: true,
              ...(await this.buildUserAccessFilter(userId, userRole))
            }
          }
        }
      })
    ]);


    // Logic quyết định view type
    if (isAdminRole) {
      if (managementPositionCount > 0 && jobPositionCount > 0) {
        return this.getMixedHierarchyView(userId, userRole, weekNumber, year, filters);
      } else if (managementPositionCount > 0) {
        return this.getManagementHierarchyView(userId, userRole, weekNumber, year, filters);
      } else if (jobPositionCount > 0) {
        return this.getStaffHierarchyView(userId, userRole, weekNumber, year, filters);
      }
    } else if (userRole === Role.USER || userRole === Role.MEDICAL_STAFF) {
      if (userCanViewHierarchy) {
        if (managementPositionCount > 0 && jobPositionCount > 0) {
          return this.getMixedHierarchyView(userId, userRole, weekNumber, year, filters);
        } else if (managementPositionCount > 0) {
          return this.getManagementHierarchyView(userId, userRole, weekNumber, year, filters);
        } else if (jobPositionCount > 0) {
          return this.getStaffHierarchyView(userId, userRole, weekNumber, year, filters);
        }
      } else {
        if (jobPositionCount > 0) {
          return this.getStaffHierarchyView(userId, userRole, weekNumber, year, filters);
        }
      }
    }

    // Return empty response if no accessible data
    return this.getEmptyHierarchyResponse(weekNumber, year);
  }

  private calculatePositionStats(users: any[], weekNumber: number, year: number) {
    const totalUsers = users.length;
    const usersWithReports = users.filter(u => u.reports && u.reports.length > 0).length;
    const usersWithCompletedReports = users.filter(u => 
      u.reports && u.reports.length > 0 && u.reports[0].isCompleted
    ).length;

    let totalTasks = 0;
    let completedTasks = 0;
    const completionRates: number[] = [];

    users.forEach(user => {
      if (user.reports && user.reports.length > 0) {
        const report = user.reports[0];
        const userTotalTasks = report.tasks ? report.tasks.length : 0;
        const userCompletedTasks = report.tasks ? report.tasks.filter((t: any) => t.isCompleted).length : 0;
        
        totalTasks += userTotalTasks;
        completedTasks += userCompletedTasks;
        
        const rate = userTotalTasks > 0 ? (userCompletedTasks / userTotalTasks) * 100 : 0;
        completionRates.push(rate);
      } else {
        completionRates.push(0);
      }
    });

    const averageCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const submissionRate = totalUsers > 0 ? Math.round((usersWithReports / totalUsers) * 100) : 0;

    return {
      totalUsers,
      usersWithReports,
      usersWithCompletedReports,
      usersWithoutReports: totalUsers - usersWithReports,
      submissionRate,
      totalTasks,
      completedTasks,
      averageCompletionRate,
      positionRanking: this.calculateRanking(averageCompletionRate),
      rankingDistribution: this.calculateRankingDistribution(completionRates)
    };
  }

  private calculateJobPositionStats(users: any[], weekNumber: number, year: number) {
    const totalUsers = users.length;
    
    if (totalUsers === 0) {
      return {
        totalUsers: 0,
        usersWithReports: 0,
        usersWithCompletedReports: 0,
        usersWithoutReports: 0,
        submissionRate: 0,
        totalTasks: 0,
        completedTasks: 0,
        averageCompletionRate: 0,
        positionRanking: 'POOR',
        rankingDistribution: this.getEmptyRankingDistribution()
      };
    }

    const usersWithReports = users.filter(u => u.reports && u.reports.length > 0).length;
    const usersWithCompletedReports = users.filter(u => 
      u.reports && u.reports.length > 0 && u.reports[0].isCompleted
    ).length;

    let totalTasks = 0;
    let completedTasks = 0;
    const completionRates: number[] = [];

    users.forEach(user => {
      if (user.reports && user.reports.length > 0) {
        const report = user.reports[0];
        const userTotalTasks = report.tasks ? report.tasks.length : 0;
        const userCompletedTasks = report.tasks ? report.tasks.filter((t: any) => t.isCompleted).length : 0;
        
        totalTasks += userTotalTasks;
        completedTasks += userCompletedTasks;
        
        const rate = userTotalTasks > 0 ? (userCompletedTasks / userTotalTasks) * 100 : 0;
        completionRates.push(rate);
      } else {
        completionRates.push(0);
      }
    });

    const averageCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const submissionRate = totalUsers > 0 ? Math.round((usersWithReports / totalUsers) * 100) : 0;

    return {
      totalUsers,
      usersWithReports,
      usersWithCompletedReports,
      usersWithoutReports: totalUsers - usersWithReports,
      submissionRate,
      totalTasks,
      completedTasks,
      averageCompletionRate,
      positionRanking: this.calculateRanking(averageCompletionRate),
      rankingDistribution: this.calculateRankingDistribution(completionRates)
    };
  }

  private getEmptyRankingDistribution() {
    return {
      excellent: { count: 0, percentage: 0 },
      good: { count: 0, percentage: 0 },
      average: { count: 0, percentage: 0 },
      belowAverage: { count: 0, percentage: 0 },
      poor: { count: 0, percentage: 0 }
    };
  }

  private calculateDepartmentBreakdown(users: any[]) {
    const departmentMap = new Map();
    
    users.forEach(user => {
      const deptId = user.jobPosition?.department?.id;
      const deptName = user.jobPosition?.department?.name;
      
      if (deptId && deptName) {
        if (!departmentMap.has(deptId)) {
          departmentMap.set(deptId, {
            id: deptId,
            name: deptName,
            userCount: 0,
            usersWithReports: 0
          });
        }
        
        const dept = departmentMap.get(deptId);
        dept.userCount++;
        
        if (user.reports && user.reports.length > 0) {
          dept.usersWithReports++;
        }
      }
    });
    
    return Array.from(departmentMap.values());
  }

  private calculateRanking(completionRate: number): string {
    if (completionRate > 90) return 'EXCELLENT';
    if (completionRate >= 80) return 'GOOD';
    if (completionRate >= 70) return 'AVERAGE';
    return 'POOR';
    // if (completionRate >= 60) return 'POOR';
    // return 'FAIL';
  }

  private calculateRankingDistribution(completionRates: number[]) {
    const distribution = {
      excellent: 0,
      good: 0,
      average: 0,
      poor: 0,
      // fail: 0
    };

    completionRates.forEach(rate => {
      const ranking = this.calculateRanking(rate);
      switch (ranking) {
        case 'EXCELLENT':
          distribution.excellent++;
          break;
        case 'GOOD':
          distribution.good++;
          break;
        case 'AVERAGE':
          distribution.average++;
          break;
        case 'POOR':
          distribution.poor++;
          break;
        // case 'FAIL':
        //   distribution.fail++;
          break;
      }
    });

    const total = completionRates.length;
    return {
      excellent: { count: distribution.excellent, percentage: total > 0 ? Math.round((distribution.excellent / total) * 100) : 0 },
      good: { count: distribution.good, percentage: total > 0 ? Math.round((distribution.good / total) * 100) : 0 },
      average: { count: distribution.average, percentage: total > 0 ? Math.round((distribution.average / total) * 100) : 0 },
      poor: { count: distribution.poor, percentage: total > 0 ? Math.round((distribution.poor / total) * 100) : 0 },
      // fail: { count: distribution.fail, percentage: total > 0 ? Math.round((distribution.fail / total) * 100) : 0 }
    };
  }

  private calculateManagementSummary(positionStats: any[]) {
    const totalUsers = positionStats.reduce((sum, pos) => sum + pos.stats.totalUsers, 0);
    const totalUsersWithReports = positionStats.reduce((sum, pos) => sum + pos.stats.usersWithReports, 0);
    const averageCompletionRate = positionStats.length > 0
      ? Math.round(positionStats.reduce((sum, pos) => sum + pos.stats.averageCompletionRate, 0) / positionStats.length)
      : 0;

    return {
      totalPositions: positionStats.length,
      totalUsers,
      totalUsersWithReports,
      averageSubmissionRate: totalUsers > 0 ? Math.round((totalUsersWithReports / totalUsers) * 100) : 0,
      averageCompletionRate,
      bestPerformingPosition: positionStats.length > 0 
        ? positionStats.reduce((best, current) => 
            current.stats.averageCompletionRate > best.stats.averageCompletionRate ? current : best
          )
        : null,
      needsImprovementCount: positionStats.filter(pos => pos.stats.averageCompletionRate < 85).length
    };
  }

  private calculateStaffSummary(jobPositionStats: any[]) {
    if (jobPositionStats.length === 0) {
      return {
        totalJobPositions: 0,
        totalUsers: 0,
        totalUsersWithReports: 0,
        averageSubmissionRate: 0,
        averageCompletionRate: 0,
        bestPerformingJobPosition: null,
        needsImprovementCount: 0
      };
    }

    const totalUsers = jobPositionStats.reduce((sum, jp) => sum + jp.stats.totalUsers, 0);
    const totalUsersWithReports = jobPositionStats.reduce((sum, jp) => sum + jp.stats.usersWithReports, 0);
    const averageCompletionRate = jobPositionStats.length > 0
      ? Math.round(jobPositionStats.reduce((sum, jp) => sum + jp.stats.averageCompletionRate, 0) / jobPositionStats.length)
      : 0;

    const bestPerformingJobPosition = jobPositionStats.length > 0
      ? jobPositionStats.reduce((best, current) => 
          current.stats.averageCompletionRate > best.stats.averageCompletionRate ? current : best
        )
      : null;

    return {
      totalJobPositions: jobPositionStats.length,
      totalUsers,
      totalUsersWithReports,
      averageSubmissionRate: totalUsers > 0 ? Math.round((totalUsersWithReports / totalUsers) * 100) : 0,
      averageCompletionRate,
      bestPerformingJobPosition,
      needsImprovementCount: jobPositionStats.filter(jp => jp.stats.averageCompletionRate < 85).length
    };
  }

  private async getUserOfficeId(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, isActive: true, role: { not: Role.WORKER } },
      select: { officeId: true }
    });
    return user?.officeId || '';
  }

  private async getUserDepartmentId(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, isActive: true, role: { not: Role.WORKER } },
      include: { jobPosition: { select: { departmentId: true } } }
    });
    return user?.jobPosition?.departmentId || '';
  }

  private getWeekFilters(filters: HierarchyFilters) {
    const current = getCurrentWorkWeek();
    return {
      weekNumber: filters.weekNumber || current.weekNumber,
      year: filters.year || current.year
    };
  }

  // Add missing methods referenced in existing code
  private getEmptyHierarchyResponse(weekNumber: number, year: number) {
    return {
      weekNumber,
      year,
      viewType: 'empty' as const,
      groupBy: 'none' as const,
      positions: [],
      jobPositions: [],
      summary: {
        totalPositions: 0,
        totalJobPositions: 0,
        totalUsers: 0,
        totalUsersWithReports: 0,
        averageSubmissionRate: 0,
        averageCompletionRate: 0
      }
    };
  }

  private mapUserToPositionUser(user: any) {
    const report = user.reports && user.reports.length > 0 ? user.reports[0] : null;
    let stats = {
      hasReport: false,
      isCompleted: false,
      totalTasks: 0,
      completedTasks: 0,
      taskCompletionRate: 0
    };

    if (report) {
      const totalTasks = report.tasks ? report.tasks.length : 0;
      const completedTasks = report.tasks ? report.tasks.filter((t: any) => t.isCompleted).length : 0;
      
      stats = {
        hasReport: true,
        isCompleted: report.isCompleted,
        totalTasks,
        completedTasks,
        taskCompletionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
      };
    }

    return {
      id: user.id,
      employeeCode: user.employeeCode,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
      fullName: `${user.firstName} ${user.lastName}`,
      email: user.email,
      office: user.office,
      jobPosition: user.jobPosition,
      stats
    };
  }

  /**
   * Get offices overview (Admin/Superadmin only)
   */
  async getOfficesOverview(userId: string, filters: HierarchyFilters = {}) {
    const { weekNumber, year } = this.getWeekFilters(filters);

    const offices = await this.prisma.office.findMany({
      include: {
        departments: {
          include: {
            // Fix: Remove invalid 'users' from _count
            _count: {
              select: { 
                jobPositions: true
              }
            }
          }
        },
        // Fix: Get users directly from office relation
        users: {
          where: { isActive: true, role: { not: Role.WORKER } },
          include: {
            reports: {
              where: { weekNumber, year },
              include: {
                tasks: {
                  select: {
                    isCompleted: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    const officesWithStats = offices.map(office => {
      // Fix: Calculate user count properly from users relation
      const userCount = office.users.length;
      const stats = this.calculateOfficeStats(office.users, weekNumber, year);
      
      return {
        office: {
          id: office.id,
          name: office.name,
          type: office.type,
          description: office.description
        },
        departments: office.departments.map(dept => ({
          id: dept.id,
          name: dept.name,
          jobPositionCount: dept._count.jobPositions || 0,
          userCount: userCount // This is not accurate per department, but office-level
        })),
        stats
      };
    });

    return {
      weekNumber,
      year,
      groupBy: 'office' as const,
      offices: officesWithStats,
      summary: this.calculateOfficeSummaryStats(officesWithStats.map(o => o.stats))
    };
  }

  /**
   * Get position details
   */
  async getPositionDetails(userId: string, userRole: Role, positionId: string, filters: HierarchyFilters = {}) {
    const { weekNumber, year } = this.getWeekFilters(filters);

    const position = await this.prisma.position.findUnique({
      where: { id: positionId },
      include: {
        jobPositions: {
          include: {
            users: {
              include: {
                office: true,
                jobPosition: {
                  include: {
                    department: true
                  }
                },
                reports: {
                  where: { weekNumber, year },
                  include: {
                    tasks: {
                      include: {
                        evaluations: {
                          include: {
                            evaluator: {
                              select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                employeeCode: true,
                                jobPosition: {
                                  include: {
                                    position: true,
                                    department: true
                                  }
                                }
                              }
                            }
                          },
                          orderBy: {
                            createdAt: 'desc'
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!position) {
      throw new NotFoundException('Position not found');
    }

    // Flatten users from all job positions
    const users = position.jobPositions.flatMap(jp => jp.users);
    const mappedUsers = users.map(this.mapUserToPositionUser.bind(this));

    return {
      position: {
        id: position.id,
        name: position.name,
        description: position.description
      },
      weekNumber,
      year,
      groupBy: 'user' as const,
      users: mappedUsers,
      summary: {
        totalUsers: users.length,
        usersWithReports: users.filter(u => u.reports && u.reports.length > 0).length,
        usersWithCompletedReports: users.filter(u => 
          u.reports && u.reports.length > 0 && u.reports[0].tasks &&
          u.reports[0].tasks.every((task: any) => task.isCompleted)
        ).length,
        averageTaskCompletion: this.calculateAverageTaskCompletion(users)
      }
    };
  }

  /**
   * Get position users list
   */
  async getPositionUsers(userId: string, userRole: Role, positionId: string, filters: HierarchyFilters = {}) {
    const { weekNumber, year } = this.getWeekFilters(filters);

    const users = await this.prisma.user.findMany({
      where: {
        jobPosition: {
          positionId: positionId
        },
        isActive: true,
        role: { not: Role.WORKER }
      },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: true
          }
        },
        reports: {
          where: { weekNumber, year },
          include: {
            tasks: true
          }
        }
      }
    });

    return {
      positionId,
      weekNumber,
      year,
      users: users.map(this.mapUserToPositionUser.bind(this)),
      summary: {
        totalUsers: users.length,
        usersWithReports: users.filter(u => u.reports && u.reports.length > 0).length
      }
    };
  }

  /**
   * Get user details
   */
  async getUserDetails(userId: string, userRole: Role, targetUserId: string, filters: HierarchyFilters = {}) {
    const { weekNumber, year, limit } = filters;

    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId, isActive: true, role: { not: Role.WORKER } },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: {
              include: {
                office: true
              }
            }
          }
        }
      }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get user reports
    const reportsWhere: any = { userId: targetUserId };
    if (weekNumber && year) {
      reportsWhere.weekNumber = weekNumber;
      reportsWhere.year = year;
    }

    const reports = await this.prisma.report.findMany({
      where: reportsWhere,
      include: {
        tasks: {
          include: {
            evaluations: {
              include: {
                evaluator: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    jobPosition: {
                      include: {
                        position: {
                          select: {
                            id: true,
                            name: true,
                            description: true
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      orderBy: [
        { year: 'desc' },
        { weekNumber: 'desc' }
      ],
      take: limit || 10
    });

    // Calculate overall stats
    const totalReports = reports.length;
    const completedReports = reports.filter(r => r.isCompleted).length;
    const totalTasks = reports.reduce((sum, r) => sum + r.tasks.length, 0);
    const completedTasks = reports.reduce((sum, r) => 
      sum + r.tasks.filter((t: any) => t.isCompleted).length, 0);

    return {
      user: {
        id: user.id,
        employeeCode: user.employeeCode,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        office: user.office,
        jobPosition: user.jobPosition
      },
      overallStats: {
        totalReports,
        completedReports,
        reportCompletionRate: totalReports > 0 ? Math.round((completedReports / totalReports) * 100) : 0,
        totalTasks,
        completedTasks,
        taskCompletionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
      },
      reports: reports.map(report => ({
        id: report.id,
        weekNumber: report.weekNumber,
        year: report.year,
        isCompleted: report.isCompleted,
        isLocked: report.isLocked,
        createdAt: report.createdAt.toISOString(),
        updatedAt: report.updatedAt.toISOString(),
        stats: {
          totalTasks: report.tasks.length,
          completedTasks: report.tasks.filter((t: any) => t.isCompleted).length,
          incompleteTasks: report.tasks.filter((t: any) => !t.isCompleted).length,
          taskCompletionRate: report.tasks.length > 0 
            ? Math.round((report.tasks.filter((t: any) => t.isCompleted).length / report.tasks.length) * 100)
            : 0,
          tasksByDay: this.calculateTasksByDay(report.tasks),
          incompleteReasons: this.calculateIncompleteReasons(report.tasks)
        },
        tasks: report.tasks
      }))
    };
  }

  /**
   * Get employees without reports
   */
  async getEmployeesWithoutReports(userId: string, userRole: Role, filters: HierarchyFilters = {}) {
    const { weekNumber, year, page = 1, limit = 10 } = filters;
    const { weekNumber: currentWeek, year: currentYear } = this.getWeekFilters(filters);

    const whereClause = await this.buildUserWhereClause(userId, userRole, filters);

    const users = await this.prisma.user.findMany({
      where: {
        ...whereClause,
        isActive: true,
        role: { not: Role.WORKER },
        reports: {
          none: {
            weekNumber: currentWeek,
            year: currentYear
          }
        }
      },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: {
              include: {
                office: true
              }
            }
          }
        }
      },
      skip: (page - 1) * limit,
      take: limit
    });

    const total = await this.prisma.user.count({
      where: {
        ...whereClause,
        isActive: true,
        role: { not: Role.WORKER },
        reports: {
          none: {
            weekNumber: currentWeek,
            year: currentYear
          }
        }
      }
    });

    return {
      weekNumber: currentWeek,
      year: currentYear,
      employees: users.map(user => ({
        id: user.id,
        employeeCode: user.employeeCode,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        office: user.office,
        jobPosition: user.jobPosition,
        status: 'not_submitted' as const,
        lastReportDate: null,
        daysOverdue: this.calculateDaysOverdue(currentWeek, currentYear)
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      summary: {
        totalActiveUsers: total,
        usersWithReports: 0,
        usersWithoutReports: total
      }
    };
  }

  /**
   * Get employees with incomplete reports
   */
  async getEmployeesWithIncompleteReports(userId: string, userRole: Role, filters: HierarchyFilters = {}) {
    const { weekNumber, year, page = 1, limit = 10 } = filters;
    const { weekNumber: currentWeek, year: currentYear } = this.getWeekFilters(filters);

    const whereClause = await this.buildUserWhereClause(userId, userRole, filters);

    const users = await this.prisma.user.findMany({
      where: {
        ...whereClause,
        isActive: true,
        role: { not: Role.WORKER },
        reports: {
          some: {
            weekNumber: currentWeek,
            year: currentYear,
            isCompleted: false
          }
        }
      },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: {
              include: {
                office: true
              }
            }
          }
        },
        reports: {
          where: {
            weekNumber: currentWeek,
            year: currentYear
          },
          include: {
            tasks: true
          }
        }
      },
      skip: (page - 1) * limit,
      take: limit
    });

    const total = await this.prisma.user.count({
      where: {
        ...whereClause,
        isActive: true,
        role: { not: Role.WORKER },
        reports: {
          some: {
            weekNumber: currentWeek,
            year: currentYear,
            isCompleted: false
          }
        }
      }
    });

    return {
      weekNumber: currentWeek,
      year: currentYear,
      employees: users.map(user => {
        const report = user.reports[0];
        const totalTasks = report?.tasks.length || 0;
        const completedTasks = report?.tasks.filter((t: any) => t.isCompleted).length || 0;

        return {
          id: user.id,
          employeeCode: user.employeeCode,
          firstName: user.firstName,
          lastName: user.lastName,
          fullName: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.role,
          office: user.office,
          jobPosition: user.jobPosition,
          status: 'incomplete' as const,
          reportDetails: report ? {
            id: report.id,
            createdAt: report.createdAt.toISOString(),
            updatedAt: report.updatedAt.toISOString(),
            totalTasks,
            completedTasks,
            incompleteTasks: totalTasks - completedTasks,
            completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
          } : undefined
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      summary: {
        totalActiveUsers: total,
        usersWithReports: total,
        usersWithoutReports: 0
      }
    };
  }

  /**
   * Get employees reporting status
   */
  async getEmployeesReportingStatus(userId: string, userRole: Role, filters: HierarchyFilters = {}) {
    const { weekNumber, year, page = 1, limit = 10, status } = filters;
    const { weekNumber: currentWeek, year: currentYear } = this.getWeekFilters(filters);

    const whereClause = await this.buildUserWhereClause(userId, userRole, filters);

    // Build status-specific where clause
    let statusWhere: any = {};
    if (status === 'not_submitted') {
      statusWhere = {
        reports: {
          none: {
            weekNumber: currentWeek,
            year: currentYear
          }
        }
      };
    } else if (status === 'incomplete') {
      statusWhere = {
        reports: {
          some: {
            weekNumber: currentWeek,
            year: currentYear,
            isCompleted: false
          }
        }
      };
    } else if (status === 'completed') {
      statusWhere = {
        reports: {
          some: {
            weekNumber: currentWeek,
            year: currentYear,
            isCompleted: true
          }
        }
      };
    }

    const users = await this.prisma.user.findMany({
      where: {
        ...whereClause,
        ...statusWhere,
        isActive: true,
        role: { not: Role.WORKER },
      },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: {
              include: {
                office: true
              }
            }
          }
        },
        reports: {
          where: {
            weekNumber: currentWeek,
            year: currentYear
          },
          include: {
            tasks: true
          }
        }
      },
      skip: (page - 1) * limit,
      take: limit
    });

    const total = await this.prisma.user.count({
      where: {
        ...whereClause,
        ...statusWhere
      }
    });

    return {
      weekNumber: currentWeek,
      year: currentYear,
      employees: users.map(user => {
        const report = user.reports[0];
        let userStatus: 'not_submitted' | 'incomplete' | 'completed' = 'not_submitted';

        if (report) {
          userStatus = report.isCompleted ? 'completed' : 'incomplete';
        }

        return {
          id: user.id,
          employeeCode: user.employeeCode,
          firstName: user.firstName,
          lastName: user.lastName,
          fullName: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.role,
          office: user.office,
          jobPosition: user.jobPosition,
          status: userStatus,
          reportDetails: report ? {
            id: report.id,
            createdAt: report.createdAt.toISOString(),
            updatedAt: report.updatedAt.toISOString(),
            totalTasks: report.tasks.length,
            completedTasks: report.tasks.filter((t: any) => t.isCompleted).length,
            completionRate: report.tasks.length > 0 
              ? Math.round((report.tasks.filter((t: any) => t.isCompleted).length / report.tasks.length) * 100)
              : 0
          } : undefined
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      summary: {
        totalActiveUsers: total,
        usersWithReports: users.filter(u => u.reports.length > 0).length,
        usersWithoutReports: users.filter(u => u.reports.length === 0).length
      }
    };
  }

  /**
   * Get task completion trends
   */
  async getTaskCompletionTrends(userId: string, userRole: Role, filters: HierarchyFilters = {}) {
    const { officeId, departmentId, weeks = 4 } = filters;
    const current = getCurrentWorkWeek();

    const whereClause = await this.buildUserWhereClause(userId, userRole, { officeId, departmentId });

    // Generate week ranges
    const weekRanges = [];
    for (let i = 0; i < weeks; i++) {
      let weekNumber = current.weekNumber - i;
      let year = current.year;
      
      if (weekNumber <= 0) {
        weekNumber = 52 + weekNumber;
        year = current.year - 1;
      }
      
      weekRanges.push({ weekNumber, year });
    }

    const trends = [];
    for (const { weekNumber, year } of weekRanges) {
      const reports = await this.prisma.report.findMany({
        where: {
          weekNumber,
          year,
          // Fix: Apply user filter correctly
          user: whereClause
        },
        include: {
          tasks: {
            select: {
              isCompleted: true
            }
          }
        }
      });

      const totalTasks = reports.reduce((sum, report) => sum + report.tasks.length, 0);
      const completedTasks = reports.reduce((sum, report) => 
        sum + report.tasks.filter(task => task.isCompleted).length, 0);

      trends.push({
        weekNumber,
        year,
        totalTasks,
        completedTasks,
        taskCompletionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
      });
    }

    trends.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.weekNumber - a.weekNumber;
    });

    const summary = {
      totalTasks: trends.reduce((sum, t) => sum + t.totalTasks, 0),
      totalCompletedTasks: trends.reduce((sum, t) => sum + t.completedTasks, 0),
      averageTaskCompletion: trends.length > 0 
        ? Math.round(trends.reduce((sum, t) => sum + t.taskCompletionRate, 0) / trends.length)
        : 0
    };

    return {
      filters: { officeId, departmentId, weeks },
      trends,
      summary
    };
  }

  /**
   * Get incomplete reasons hierarchy analysis
   */
  async getIncompleteReasonsHierarchy(userId: string, userRole: Role, filters: HierarchyFilters = {}) {
    const { weekNumber, year } = this.getWeekFilters(filters);

    const whereClause = await this.buildUserWhereClause(userId, userRole, filters);

    const reports = await this.prisma.report.findMany({
      where: {
        weekNumber,
        year,
        // Fix: Apply user filter correctly
        user: whereClause
      },
      include: {
        tasks: {
          where: {
            isCompleted: false,
            reasonNotDone: {
              not: null
            }
          }
        },
        user: {
          include: {
            office: true,
            jobPosition: {
              include: {
                department: true
              }
            }
          }
        }
      }
    });

    const reasonsMap = new Map();
    let totalIncompleteTasks = 0;

    reports.forEach(report => {
      report.tasks.forEach(task => {
        if (!task.isCompleted && task.reasonNotDone) {
          totalIncompleteTasks++;
          
          if (!reasonsMap.has(task.reasonNotDone)) {
            reasonsMap.set(task.reasonNotDone, {
              reason: task.reasonNotDone,
              count: 0,
              users: new Set(),
              sampleTasks: []
            });
          }
          
          const reasonData = reasonsMap.get(task.reasonNotDone);
          reasonData.count++;
          reasonData.users.add(report.user.id);
          
          if (reasonData.sampleTasks.length < 3) {
            reasonData.sampleTasks.push({
              taskName: task.taskName,
              userName: `${report.user.firstName} ${report.user.lastName}`,
              department: report.user.jobPosition?.department?.name || '',
              office: report.user.office?.name || ''
            });
          }
        }
      });
    });

    const reasonsAnalysis = Array.from(reasonsMap.values())
      .map(reason => ({
        reason: reason.reason,
        count: reason.count,
        users: reason.users.size,
        percentage: totalIncompleteTasks > 0 ? Math.round((reason.count / totalIncompleteTasks) * 100) : 0,
        sampleTasks: reason.sampleTasks
      }))
      .sort((a, b) => b.count - a.count);

    return {
      weekNumber,
      year,
      totalReports: reports.length,
      totalIncompleteTasks,
      reasonsAnalysis,
      summary: {
        totalIncompleteTasks,
        diversityIndex: reasonsAnalysis.length
      }
    };
  }

  // Helper methods

  private async buildUserWhereClause(userId: string, userRole: Role, filters: any = {}) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, isActive: true, role: { not: Role.WORKER } },
      include: { 
        office: true, 
        jobPosition: { 
          include: { 
            department: true,
            position: true 
          } 
        } 
      }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const whereClause: any = { isActive: true };

    if (userRole === Role.SUPERADMIN || userRole === Role.ADMIN) {
      // No additional filters for super admin/admin
    } else if (userRole === Role.USER || userRole === Role.MEDICAL_STAFF) {
      // Check if user has hierarchy viewing permission
      if (user.jobPosition?.position?.canViewHierarchy === true) {
        // Management user can see their department
        whereClause.jobPosition = {
          departmentId: user.jobPosition.departmentId
        };
      } else {
        // Regular user can only see themselves
        whereClause.id = userId;
      }
    }

    // Apply additional filters
    if (filters.officeId) {
      whereClause.officeId = filters.officeId;
    }
    if (filters.departmentId) {
      whereClause.jobPosition = {
        ...whereClause.jobPosition,
        departmentId: filters.departmentId
      };
    }

    return whereClause;
  }

  private calculateOfficeStats(users: any[], weekNumber: number, year: number) {
    const totalUsers = users.length;
    const usersWithReports = users.filter(u => u.reports && u.reports.length > 0).length;
    const usersWithoutReports = totalUsers - usersWithReports;

    return {
      totalUsers,
      usersWithReports,
      usersWithoutReports,
      reportSubmissionRate: totalUsers > 0 ? Math.round((usersWithReports / totalUsers) * 100) : 0
    };
  }

  private calculateAverageTaskCompletion(users: any[]): number {
    let totalTasks = 0;
    let completedTasks = 0;

    users.forEach(user => {
      if (user.reports && user.reports.length > 0) {
        const report = user.reports[0];
        if (report.tasks) {
          totalTasks += report.tasks.length;
          completedTasks += report.tasks.filter((t: any) => t.isCompleted).length;
        }
      }
    });

    return totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  }

  private calculateTasksByDay(tasks: any[]) {
    return {
      monday: tasks.filter(t => t.monday).length,
      tuesday: tasks.filter(t => t.tuesday).length,
      wednesday: tasks.filter(t => t.wednesday).length,
      thursday: tasks.filter(t => t.thursday).length,
      friday: tasks.filter(t => t.friday).length,
      saturday: tasks.filter(t => t.saturday).length,
    };
  }

  private calculateIncompleteReasons(tasks: any[]) {
    const reasonsMap = new Map();
    
    tasks.forEach(task => {
      if (!task.isCompleted && task.reasonNotDone) {
        if (!reasonsMap.has(task.reasonNotDone)) {
          reasonsMap.set(task.reasonNotDone, {
            reason: task.reasonNotDone,
            count: 0,
            tasks: []
          });
        }
        
        const reasonData = reasonsMap.get(task.reasonNotDone);
        reasonData.count++;
        reasonData.tasks.push(task.taskName);
      }
    });

    return Array.from(reasonsMap.values())
      .sort((a, b) => b.count - a.count);
  }

  private calculateDaysOverdue(weekNumber: number, year: number): number {
    const now = new Date();
    const currentWeek = getCurrentWorkWeek();
    
    if (year < currentWeek.year || (year === currentWeek.year && weekNumber < currentWeek.weekNumber)) {
      // Calculate days since the week ended
      return Math.max(0, Math.floor((now.getTime() - new Date(year, 0, 1 + (weekNumber - 1) * 7).getTime()) / (1000 * 60 * 60 * 24)));
    }
    
    return 0;
  }

  // FIX: Remove duplicate calculateSummaryStats methods and keep only one
  private calculateSummaryStats(users: any[], weekNumber: number, year: number) {
    const totalUsers = users.length;
    const usersWithReports = users.filter(u => u.reports && u.reports.length > 0).length;
    const usersWithoutReports = totalUsers - usersWithReports;

    let totalUsersWithCompletedReports = 0;
    let totalTasks = 0;
    let totalCompletedTasks = 0;
    const allCompletionRates: number[] = [];

    users.forEach(user => {
      if (user.reports && user.reports.length > 0) {
        const report = user.reports[0];
        if (report.tasks) {
          const userTotalTasks = report.tasks.length;
          const userCompletedTasks = report.tasks.filter((task: any) => task.isCompleted).length;
          
          totalTasks += userTotalTasks;
          totalCompletedTasks += userCompletedTasks;
          
          const userCompletionRate = userTotalTasks > 0 ? (userCompletedTasks / userTotalTasks) * 100 : 0;
          allCompletionRates.push(userCompletionRate);
          
          if (userCompletionRate === 100) {
            totalUsersWithCompletedReports++;
          }
        }
      } else {
        allCompletionRates.push(0);
      }
    });

    const averageSubmissionRate = totalUsers > 0 ? Math.round((usersWithReports / totalUsers) * 100) : 0;
    const averageCompletionRate = totalTasks > 0 ? Math.round((totalCompletedTasks / totalTasks) * 100) : 0;

    const positionSet = new Set();
    users.forEach(user => {
      if (user.jobPosition?.position) {
        positionSet.add(user.jobPosition.position.id);
      }
    });

    return {
      totalPositions: positionSet.size,
      totalUsers,
      totalUsersWithReports: usersWithReports,
      totalUsersWithCompletedReports,
      totalUsersWithoutReports: usersWithoutReports,
      averageSubmissionRate,
      averageCompletionRate,
      rankingDistribution: this.calculateRankingDistribution(allCompletionRates)
    };
  }

  // Separate method for office summary stats
  private calculateOfficeSummaryStats(officeStats: any[]) {
    const totalUsers = officeStats.reduce((sum, stat) => sum + stat.totalUsers, 0);
    const totalUsersWithReports = officeStats.reduce((sum, stat) => sum + stat.usersWithReports, 0);
    const averageSubmissionRate = totalUsers > 0 ? Math.round((totalUsersWithReports / totalUsers) * 100) : 0;

    return {
      totalPositions: officeStats.length,
      totalUsers,
      totalUsersWithReports,
      totalUsersWithCompletedReports: 0,
      totalUsersWithoutReports: totalUsers - totalUsersWithReports,
      averageSubmissionRate,
      averageCompletionRate: 0,
      rankingDistribution: {
        excellent: { count: 0, percentage: 0 },
        good: { count: 0, percentage: 0 },
        average: { count: 0, percentage: 0 },
        poor: { count: 0, percentage: 0 },
        fail: { count: 0, percentage: 0 }
      }
    };
  }

  /**
   * Get specific report details for admin view
   */
  async getReportDetailsForAdmin(userId: string, reportId: string, currentUser: any) {
    // Verify the target user exists
    const targetUser = await this.prisma.user.findUnique({
      where: { 
        id: userId,
        isActive: true,
        role: { not: Role.WORKER },
      },
      include: {
        office: true,
        jobPosition: {
          include: {
            department: { include: { office: true } },
            position: true,
          },
        },
      },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    // Check permissions - admin can only view reports from their office
    // if (currentUser.role === Role.ADMIN && targetUser.officeId !== currentUser.officeId) {
    //   throw new ForbiddenException('You can only view reports from your office');
    // }

    // Get the specific report
    const report = await this.prisma.report.findFirst({
      where: {
        id: reportId,
        userId: userId,
      },
      include: {
        tasks: {
          orderBy: { createdAt: 'asc' },
        },
        user: {
          include: {
            office: true,
            jobPosition: {
              include: {
                department: { include: { office: true } },
                position: true,
              },
            },
          },
        },
      },
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    // Calculate report statistics
    const stats = this.calculateReportStatistics(report);

    return {
      report,
      user: targetUser,
      stats,
    };
  }

  /**
   * Calculate detailed statistics for a report
   */
  private calculateReportStatistics(report: any) {
    const tasks = report.tasks || [];
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((task: any) => task.isCompleted).length;
    const incompleteTasks = totalTasks - completedTasks;
    const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Calculate tasks by day
    const tasksByDay = {
      monday: tasks.filter((task: any) => task.monday).length,
      tuesday: tasks.filter((task: any) => task.tuesday).length,
      wednesday: tasks.filter((task: any) => task.wednesday).length,
      thursday: tasks.filter((task: any) => task.thursday).length,
      friday: tasks.filter((task: any) => task.friday).length,
      saturday: tasks.filter((task: any) => task.saturday).length,
    };

    // Group incomplete reasons
    const incompleteReasons = [];
    const reasonGroups = new Map();

    tasks
      .filter((task: any) => !task.isCompleted && task.reasonNotDone)
      .forEach((task: any) => {
        const reason = task.reasonNotDone.trim();
        if (!reasonGroups.has(reason)) {
          reasonGroups.set(reason, {
            reason,
            count: 0,
            tasks: [],
          });
        }
        const group = reasonGroups.get(reason);
        group.count++;
        group.tasks.push(task.taskName);
      });

    incompleteReasons.push(...reasonGroups.values());

    return {
      totalTasks,
      completedTasks,
      incompleteTasks,
      taskCompletionRate,
      tasksByDay,
      incompleteReasons,
    };
  }

  /**
   * Get manager reports - for managers to view reports of their subordinates
   * 
   * AUTHORIZATION MATRIX:
   * 
   * ADMIN (Tổng Giám Đốc / General Director, Level 0):
   * - Can view reports of ALL employees across the entire system
   * - No office_id or level restrictions
   * 
   * USER Role - Office-based + Level-based Authorization:
   * - MUST have same office_id as requesting user
   * - MUST have higher level number (lower in hierarchy)
   * 
   * Level-based Hierarchy (USER Role - same office only):
   * - Level 1 (Phó Tổng Giám Đốc): Views levels 2,3,4,5,6,7
   * - Level 2 (Giám Đốc): Views levels 3,4,5,6,7
   * - Level 3 (Phó Giám đốc): Views levels 4,5,6,7
   * - Level 4 (Đội trưởng/Trưởng Line/Trưởng phòng): Views levels 5,6,7
   * - Level 5 (Trưởng Team/Trưởng ca/Trợ lý): Views levels 6,7
   *   * Special case: Trợ lý (Assistant) has NO viewing rights
   * - Level 6 (Tổ trưởng): Views level 7
   * - Level 7 (Nhân viên): NO permission to view others' reports
   * 
   * DATA STRUCTURE:
   * - Reports grouped by Position (Chức danh) and Job Position (Vị trí công việc)
   * - Each group contains employee list with their task report details
   * - Optimized for frontend display and navigation
   */
  async getManagerReports(userId: string, userRole: Role, filters: HierarchyFilters = {}) {
    // Get the manager's information
    const manager = await this.prisma.user.findUnique({
      where: { id: userId, isActive: true, role: { not: Role.WORKER } },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: {
              include: {
                office: true
              }
            }
          }
        }
      }
    });

    if (!manager) {
      throw new NotFoundException('Manager not found');
    }

    // Check if user has management permissions
    const hasManagementPermission = this.checkManagerPermissions(manager, userRole);
    if (!hasManagementPermission) {
      throw new ForbiddenException('You do not have permission to view subordinate reports');
    }

    const { weekNumber, year } = this.getWeekFilters(filters);

    // Get subordinates based on manager's role and position
    const subordinates = await this.getSubordinates(manager, userRole);

    // Get reports for subordinates
    const reports = await this.prisma.report.findMany({
      where: {
        weekNumber,
        year,
        userId: {
          in: subordinates.map(sub => sub.id)
        }
      },
      include: {
        tasks: {
          include: {
            evaluations: {
              include: {
                evaluator: true,
              }
            }
          },
          orderBy: { createdAt: 'asc' }
        },
        user: {
          include: {
            office: true,
            jobPosition: {
              include: {
                position: true,
                department: {
                  include: {
                    office: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: [
        { user: { jobPosition: { department: { name: 'asc' } } } },
        { user: { lastName: 'asc' } },
        { user: { firstName: 'asc' } }
      ]
    });

    // Group data by Position and Job Position for frontend
    const groupedData = this.groupReportsByPositionAndJobPosition(subordinates, reports);

    // Calculate overall summary
    const summary = this.calculateManagerSummaryFromGrouped(groupedData);

    return {
      manager: {
        id: manager.id,
        firstName: manager.firstName,
        lastName: manager.lastName,
        fullName: `${manager.firstName} ${manager.lastName}`,
        office: manager.office,
        jobPosition: manager.jobPosition,
        role: userRole,
        level: manager.jobPosition?.position?.level,
        officeId: manager.officeId
      },
      weekNumber,
      year,
      groupedReports: groupedData,
      summary
    };
  }

  /**
   * Check if user has management permissions based on precise role-based authorization
   * 
   * ADMIN (Tổng Giám Đốc): Always has full permissions
   * USER: Level-based permissions (Level 1-6 can view subordinates, Level 7 cannot)
   * Special case: Trợ lý (Assistant) at Level 5 has no viewing rights
   */
  private checkManagerPermissions(user: any, userRole: Role): boolean {
    // ADMIN (Tổng Giám Đốc) and SUPERADMIN always have management permissions
    if (userRole === Role.ADMIN || userRole === Role.SUPERADMIN) {
      return true;
    }

    // USER Role: Check level-based permissions
    if (userRole === Role.USER || userRole === Role.MEDICAL_STAFF) {
      const position = user.jobPosition?.position;
      const level = position?.level;

      // Level 7 (Nhân viên) has NO permission to view others' reports
      if (level >= 7) {
        return false;
      }

      // Level 5: Check if this is an Assistant role
      // if (level === 5) {
      //   const isAssistant = this.isAssistantRole(position?.name);
      //   if (isAssistant) {
      //     return false; // Assistants have no viewing rights
      //   }
      // }

      // Levels 1-6 (excluding Assistant at Level 5) have management permissions
      if (level >= 1 && level <= 6) {
        return true;
      }

      // Level 0 or undefined: Should be treated as ADMIN (Tổng Giám Đốc)
      if (level === 0 || level === undefined) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get subordinates based on simplified office-based and level-based authorization
   * 
   * AUTHORIZATION RULES:
   * 1. ADMIN (Tổng Giám Đốc, Level 0): View ALL employees across entire system
   * 2. USER (Levels 1-7): Must be same office_id AND higher level (lower rank)
   * 
   * LEVEL-BASED HIERARCHY (USER Role - same office only):
   * - Level 1 (Phó Tổng Giám Đốc): Views levels 2,3,4,5,6,7
   * - Level 2 (Giám Đốc): Views levels 3,4,5,6,7  
   * - Level 3 (Phó Giám đốc): Views levels 4,5,6,7
   * - Level 4 (Đội trưởng/Trưởng Line/Trưởng phòng): Views levels 5,6,7
   * - Level 5 (Trưởng Team/Trưởng ca/Trợ lý): Views levels 6,7
   *   * Special case: Trợ lý (Assistant) has NO viewing rights
   * - Level 6 (Tổ trưởng): Views level 7
   * - Level 7 (Nhân viên): NO permission
   */
    /**
   * Get target levels that a manager can view based on their level
   */
  private getTargetLevelsForManager(managerLevel: number): number[] {
    switch (managerLevel) {
      case 1: // Phó Tổng Giám Đốc
        return [2, 3, 4, 5, 6, 7];
      case 2: // Giám Đốc  
        return [3, 4, 5, 6, 7];
      case 3: // Phó Giám đốc
        return [4, 5, 6, 7];
      case 4: // Đội trưởng/Trưởng Line/Trưởng phòng
        return [5, 6, 7];
      case 5: // Trưởng Team/Trưởng ca/Trợ lý
        return [6, 7];
      case 6: // Tổ trưởng
        return [7];
      case 7: // Nhân viên
        return [];
      case 8: // Intern or other roles below Nhân viên
        return [];
      default:
        // Level 0 or undefined should be handled as ADMIN
        return [];
    }
  }

  /**
   * Calculate statistics for a subordinate
   */
  private calculateSubordinateStats(subordinate: any, report: any) {
    if (!report) {
      return {
        hasReport: false,
        isCompleted: false,
        totalTasks: 0,
        completedTasks: 0,
        incompleteTasks: 0,
        taskCompletionRate: 0,
        status: 'not_submitted' as const
      };
    }

    const totalTasks = report.tasks.length;
    const completedTasks = report.tasks.filter((task: any) => task.isCompleted).length;
    const incompleteTasks = totalTasks - completedTasks;
    const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    let status: 'not_submitted' | 'incomplete' | 'completed' = 'not_submitted';
    if (report.isCompleted) {
      status = 'completed';
    } else if (totalTasks > 0) {
      status = 'incomplete';
    }

    return {
      hasReport: true,
      isCompleted: report.isCompleted,
      totalTasks,
      completedTasks,
      incompleteTasks,
      taskCompletionRate,
      status
    };
  }
  
  
  private groupReportsByPositionAndJobPosition(subordinates: any[], reports: any[]) {
  const positionGroups = new Map();
  
  subordinates.forEach(subordinate => {
    const position = subordinate.jobPosition?.position;
    const jobPosition = subordinate.jobPosition;
    const userReport = reports.find(r => r.userId === subordinate.id);
    
    if (!position || !jobPosition) return;
    
    // Create position group key
    const positionKey = `${position.id}_${position.name}_${position.level}`;
    
    // Initialize position group if not exists
    if (!positionGroups.has(positionKey)) {
      positionGroups.set(positionKey, {
        position: {
          id: position.id,
          name: position.name,
          level: position.level,
          description: position.description,
          isManagement: position.isManagement
        },
        // For level 1-6: direct employees array
        // For level 7: jobPositionGroups Map
        employees: position.level < 7 ? [] : null,
        jobPositionGroups: position.level === 7 ? new Map() : null,
        stats: {
          totalUsers: 0,
          usersWithReports: 0,
          usersWithCompletedReports: 0,
          totalTasks: 0,
          completedTasks: 0,
          taskCompletionRate: 0
        }
      });
    }
    
    const positionGroup = positionGroups.get(positionKey);
    const stats = this.calculateSubordinateStats(subordinate, userReport);
    
    // Employee data structure
    const employeeData = {
      user: {
        id: subordinate.id,
        employeeCode: subordinate.employeeCode,
        firstName: subordinate.firstName,
        lastName: subordinate.lastName,
        fullName: `${subordinate.firstName} ${subordinate.lastName}`,
        email: subordinate.email,
        office: subordinate.office,
        jobPosition: subordinate.jobPosition
      },
      report: userReport ? {
        id: userReport.id,
        weekNumber: userReport.weekNumber,
        year: userReport.year,
        isCompleted: userReport.isCompleted,
        isLocked: userReport.isLocked,
        createdAt: userReport.createdAt.toISOString(),
        updatedAt: userReport.updatedAt.toISOString(),
        tasks: userReport.tasks
      } : null,
      stats
    };
    
    // LOGIC PHÂN BIỆT THEO LEVEL
    if (position.level === 7) {
      // Level 7 (Nhân viên): Group theo job position chi tiết
      const jobPositionKey = `${jobPosition.id}_${jobPosition.jobName}`;
      
      if (!positionGroup.jobPositionGroups.has(jobPositionKey)) {
        positionGroup.jobPositionGroups.set(jobPositionKey, {
          jobPosition: {
            id: jobPosition.id,
            jobName: jobPosition.jobName,
            code: jobPosition.code,
            description: jobPosition.description,
            department: jobPosition.department,
            position: position
          },
          employees: [],
          stats: {
            totalUsers: 0,
            usersWithReports: 0,
            usersWithCompletedReports: 0,
            totalTasks: 0,
            completedTasks: 0,
            taskCompletionRate: 0
          }
        });
      }
      
      const jobPositionGroup = positionGroup.jobPositionGroups.get(jobPositionKey);
      
      // Add employee to job position group
      jobPositionGroup.employees.push(employeeData);
      
      // Update job position group stats
      jobPositionGroup.stats.totalUsers++;
      if (stats.hasReport) {
        jobPositionGroup.stats.usersWithReports++;
        jobPositionGroup.stats.totalTasks += stats.totalTasks;
        jobPositionGroup.stats.completedTasks += stats.completedTasks;
      }
      if (stats.isCompleted) {
        jobPositionGroup.stats.usersWithCompletedReports++;
      }
      
    } else {
      // Level 1-6 (Các cấp quản lý): Chỉ group theo position
      positionGroup.employees.push(employeeData);
    }
    
    // Update position group stats (cho tất cả levels)
    positionGroup.stats.totalUsers++;
    if (stats.hasReport) {
      positionGroup.stats.usersWithReports++;
      positionGroup.stats.totalTasks += stats.totalTasks;
      positionGroup.stats.completedTasks += stats.completedTasks;
    }
    if (stats.isCompleted) {
      positionGroup.stats.usersWithCompletedReports++;
    }
  });

  // Convert Maps to Arrays and calculate final stats
  const result = Array.from(positionGroups.values()).map(positionGroup => {
    // Calculate task completion rate for position
    positionGroup.stats.taskCompletionRate = positionGroup.stats.totalTasks > 0
      ? Math.round((positionGroup.stats.completedTasks / positionGroup.stats.totalTasks) * 100)
      : 0;
    
    if (positionGroup.position.level === 7) {
      // Level 7: Convert jobPositionGroups Map to Array
      const jobPositions = Array.from(positionGroup.jobPositionGroups.values()).map((jobPositionGroup: any) => {
        // Calculate task completion rate for each job position
        jobPositionGroup.stats.taskCompletionRate = jobPositionGroup.stats.totalTasks > 0
          ? Math.round((jobPositionGroup.stats.completedTasks / jobPositionGroup.stats.totalTasks) * 100)
          : 0;
        
        return jobPositionGroup;
      });

      return {
        position: positionGroup.position,
        jobPositions: jobPositions.sort((a: any, b: any) => a.jobPosition.jobName.localeCompare(b.jobPosition.jobName)),
        employees: null, // Level 7 không có employees trực tiếp
        stats: positionGroup.stats
      };
    } else {
      // Level 1-6: Return with employees array
      return {
        position: positionGroup.position,
        jobPositions: null, // Level 1-6 không có jobPositions
        employees: positionGroup.employees.sort((a: any, b: any) => a.user.fullName.localeCompare(b.user.fullName)),
        stats: positionGroup.stats
      };
    }
  });

  // Sort by position level (TGĐ -> PTGĐ -> GĐ -> ... -> NV)
  return result.sort((a, b) => a.position.level - b.position.level);
}

  /**
 * Calculate manager summary from grouped data
 */
private calculateManagerSummaryFromGrouped(groupedData: any[]) {
  let totalSubordinates = 0;
  let subordinatesWithReports = 0;
  let subordinatesWithCompletedReports = 0;
  let totalTasks = 0;
  let totalCompletedTasks = 0;
  let totalJobPositions = 0;

  groupedData.forEach(positionGroup => {
    // Add stats from position group
    totalSubordinates += positionGroup.stats.totalUsers;
    subordinatesWithReports += positionGroup.stats.usersWithReports;
    subordinatesWithCompletedReports += positionGroup.stats.usersWithCompletedReports;
    totalTasks += positionGroup.stats.totalTasks;
    totalCompletedTasks += positionGroup.stats.completedTasks;

    // Handle job positions safely - check if they exist and are not null
    if (positionGroup.jobPositions && Array.isArray(positionGroup.jobPositions)) {
      totalJobPositions += positionGroup.jobPositions.length;
      positionGroup.jobPositions.forEach((jobPositionGroup: any) => {
        // Additional stats are already included in position stats above
        // so we don't double count here
      });
    }
  });

  const reportSubmissionRate = totalSubordinates > 0 ? Math.round((subordinatesWithReports / totalSubordinates) * 100) : 0;
  const overallTaskCompletionRate = totalTasks > 0 ? Math.round((totalCompletedTasks / totalTasks) * 100) : 0;

  return {
    totalSubordinates,
    subordinatesWithReports,
    subordinatesWithoutReports: totalSubordinates - subordinatesWithReports,
    subordinatesWithCompletedReports,
    subordinatesWithIncompleteReports: subordinatesWithReports - subordinatesWithCompletedReports,
    reportSubmissionRate,
    totalTasks,
    totalCompletedTasks,
    overallTaskCompletionRate,
    totalPositions: groupedData.length,
    totalJobPositions
  };
}
 
}