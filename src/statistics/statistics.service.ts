import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { getCurrentWorkWeek } from '../common/utils/week-utils';
import { Role } from '@prisma/client';

@Injectable()
export class StatisticsService {
  private readonly logger = new Logger(StatisticsService.name);

  constructor(private prisma: PrismaService) {}

  // Helper method for percentage calculation
  private calculatePercentage(numerator: number, denominator: number): number {
    if (denominator === 0) return 0;
    const percentage = (numerator / denominator) * 100;
    return Math.round(percentage * 100) / 100;
  }

  async getDashboardStats(userId: string) {
    const { weekNumber: currentWeek, year: currentYear } = getCurrentWorkWeek();
    
    try {
      // Get user with reports for current week
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          reports: {
            where: {
              weekNumber: currentWeek,
              year: currentYear,
            },
            include: {
              tasks: true,
            },
          },
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Get total reports for this user
      const totalReports = await this.prisma.report.count({
        where: { userId },
      });

      const completedReports = await this.prisma.report.count({
        where: { userId, isCompleted: true },
      });

      // Current week stats
      const currentWeekReport = user.reports[0];
      let currentWeekStats = {
        hasReport: false,
        isCompleted: false,
        totalTasks: 0,
        completedTasks: 0,
        taskCompletionRate: 0,
      };

      if (currentWeekReport) {
        const totalTasks = currentWeekReport.tasks.length;
        const completedTasks = currentWeekReport.tasks.filter(task => task.isCompleted).length;
        
        currentWeekStats = {
          hasReport: true,
          isCompleted: currentWeekReport.isCompleted,
          totalTasks,
          completedTasks,
          taskCompletionRate: this.calculatePercentage(completedTasks, totalTasks),
        };
      }

      return {
        currentWeek: {
          weekNumber: currentWeek,
          year: currentYear,
          ...currentWeekStats,
        },
        totals: {
          totalReports,
          completedReports,
          completionRate: this.calculatePercentage(completedReports, totalReports),
        },
      };
    } catch (error) {
      this.logger.error('Error in getDashboardStats:', error);
      throw error;
    }
  }

  async getUserReportStats(userId: string) {
    try {
      const reports = await this.prisma.report.findMany({
        where: { userId },
        include: {
          tasks: true,
        },
        orderBy: [{ year: 'desc' }, { weekNumber: 'desc' }],
      });

      const totalReports = reports.length;
      const completedReports = reports.filter(r => r.isCompleted).length;
      const totalTasks = reports.reduce((sum, r) => sum + r.tasks.length, 0);
      const completedTasks = reports.reduce(
        (sum, r) => sum + r.tasks.filter(t => t.isCompleted).length,
        0,
      );

      return {
        totalReports,
        completedReports,
        reportCompletionRate: this.calculatePercentage(completedReports, totalReports),
        totalTasks,
        completedTasks,
        taskCompletionRate: this.calculatePercentage(completedTasks, totalTasks),
      };
    } catch (error) {
      this.logger.error('Error in getUserReportStats:', error);
      throw error;
    }
  }

  async getWeeklyTaskStats(userId: string) {
    const { weekNumber: currentWeek, year: currentYear } = getCurrentWorkWeek();
    
    try {
      const report = await this.prisma.report.findUnique({
        where: {
          weekNumber_year_userId: {
            weekNumber: currentWeek,
            year: currentYear,
            userId,
          },
        },
        include: {
          tasks: true,
        },
      });

      if (!report) {
        return {
          total: 0,
          completed: 0,
          uncompleted: 0,
          completionRate: 0,
          incompleteReasonsAnalysis: [],
        };
      }

      const total = report.tasks.length;
      const completed = report.tasks.filter(task => task.isCompleted).length;
      const uncompleted = total - completed;

      // Analyze incomplete reasons
      const incompleteReasons = new Map<string, number>();
      report.tasks
        .filter(task => !task.isCompleted && task.reasonNotDone)
        .forEach(task => {
          const reason = task.reasonNotDone.trim();
          incompleteReasons.set(reason, (incompleteReasons.get(reason) || 0) + 1);
        });

      const incompleteReasonsAnalysis = Array.from(incompleteReasons.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count);

      return {
        total,
        completed,
        uncompleted,
        completionRate: this.calculatePercentage(completed, total),
        incompleteReasonsAnalysis,
      };
    } catch (error) {
      this.logger.error('Error in getWeeklyTaskStats:', error);
      throw error;
    }
  }

  async getMonthlyTaskStats(userId: string, year?: number) {
    const currentYear = year || new Date().getFullYear();
    
    try {
      const reports = await this.prisma.report.findMany({
        where: {
          userId,
          year: currentYear,
        },
        include: {
          tasks: true,
        },
      });

      // Group by month based on creation date
      const monthlyStats = [];
      for (let month = 1; month <= 12; month++) {
        const monthReports = reports.filter(report => {
          const reportDate = new Date(report.createdAt);
          return reportDate.getMonth() + 1 === month;
        });

        const total = monthReports.reduce((sum, r) => sum + r.tasks.length, 0);
        const completed = monthReports.reduce(
          (sum, r) => sum + r.tasks.filter(t => t.isCompleted).length,
          0,
        );

        monthlyStats.push({
          month,
          total,
          completed,
          uncompleted: total - completed,
          completionRate: this.calculatePercentage(completed, total),
        });
      }

      return {
        year: currentYear,
        monthlyStats,
      };
    } catch (error) {
      this.logger.error('Error in getMonthlyTaskStats:', error);
      throw error;
    }
  }

  /**
   * Get yearly task statistics
   */
  async getYearlyTaskStats(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const currentYear = new Date().getFullYear();
    const years = [currentYear - 1, currentYear];

    const yearlyStats = [];

    for (const year of years) {
      // Fix: Use correct model name
      const reports = await this.prisma.report.findMany({
        where: {
          userId,
          year
        },
        include: {
          tasks: true
        }
      });

      const totalTasks = reports.reduce((sum, report) => sum + report.tasks.length, 0);
      const completedTasks = reports.reduce((sum, report) => 
        sum + report.tasks.filter(task => task.isCompleted).length, 0);
      const incompleteTasks = totalTasks - completedTasks;

      // Get top incomplete reasons for the year
      const incompleteReasons = reports.flatMap(report => 
        report.tasks
          .filter(task => !task.isCompleted && task.reasonNotDone)
          .map(task => task.reasonNotDone!)
      );

      const reasonCount = incompleteReasons.reduce((acc, reason) => {
        acc[reason] = (acc[reason] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const topIncompleteReasons = Object.entries(reasonCount)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      yearlyStats.push({
        year,
        total: totalTasks,
        completed: completedTasks,
        uncompleted: incompleteTasks,
        completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
        reportsCount: reports.length,
        topIncompleteReasons
      });
    }

    return {
      yearlyStats,
      summary: {
        totalTasksAllYears: yearlyStats.reduce((sum, stat) => sum + stat.total, 0),
        averageCompletionRate: yearlyStats.length > 0 
          ? Math.round(yearlyStats.reduce((sum, stat) => sum + stat.completionRate, 0) / yearlyStats.length)
          : 0
      }
    };
  }

  async getRecentActivities(userId: string) {
    try {
      const reports = await this.prisma.report.findMany({
        where: { userId },
        include: {
          tasks: true,
        },
        orderBy: [{ year: 'desc' }, { weekNumber: 'desc' }],
        take: 10,
      });

      return reports.map(report => {
        const totalTasks = report.tasks.length;
        const completedTasks = report.tasks.filter(t => t.isCompleted).length;
        const incompleteTasks = totalTasks - completedTasks;

        // Get top incomplete reasons
        const incompleteReasons = new Map<string, number>();
        report.tasks
          .filter(task => !task.isCompleted && task.reasonNotDone)
          .forEach(task => {
            const reason = task.reasonNotDone.trim();
            incompleteReasons.set(reason, (incompleteReasons.get(reason) || 0) + 1);
          });

        const topIncompleteReasons = Array.from(incompleteReasons.entries())
          .map(([reason, count]) => ({ reason, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 3);

        return {
          reportId: report.id,
          weekNumber: report.weekNumber,
          year: report.year,
          isCompleted: report.isCompleted,
          createdAt: report.createdAt,
          updatedAt: report.updatedAt,
          stats: {
            totalTasks,
            completedTasks,
            incompleteTasks,
            taskCompletionRate: this.calculatePercentage(completedTasks, totalTasks),
            completionRate: this.calculatePercentage(completedTasks, totalTasks),
            topIncompleteReasons,
          },
        };
      });
    } catch (error) {
      this.logger.error('Error in getRecentActivities:', error);
      throw error;
    }
  }

  async getIncompleteReasonsAnalysis(
    userId: string,
    filters: {
      weekNumber?: number;
      year?: number;
      startDate?: string;
      endDate?: string;
    },
  ) {
    try {
      const whereClause: any = { userId };

      if (filters.weekNumber && filters.year) {
        whereClause.weekNumber = filters.weekNumber;
        whereClause.year = filters.year;
      } else if (filters.startDate && filters.endDate) {
        whereClause.createdAt = {
          gte: new Date(filters.startDate),
          lte: new Date(filters.endDate),
        };
      }

      const reports = await this.prisma.report.findMany({
        where: whereClause,
        include: {
          tasks: {
            where: {
              isCompleted: false,
              reasonNotDone: { not: null },
            },
          },
        },
      });

      // Analyze reasons
      const reasonsMap = new Map<string, {
        count: number;
        tasks: string[];
      }>();

      reports.forEach(report => {
        report.tasks.forEach(task => {
          if (task.reasonNotDone) {
            const reason = task.reasonNotDone.trim();
            if (!reasonsMap.has(reason)) {
              reasonsMap.set(reason, { count: 0, tasks: [] });
            }
            const data = reasonsMap.get(reason)!;
            data.count += 1;
            data.tasks.push(task.taskName);
          }
        });
      });

      const totalIncompleteTasks = Array.from(reasonsMap.values())
        .reduce((sum, data) => sum + data.count, 0);

      const reasonsAnalysis = Array.from(reasonsMap.entries())
        .map(([reason, data]) => ({
          reason,
          count: data.count,
          percentage: this.calculatePercentage(data.count, totalIncompleteTasks),
          sampleTasks: data.tasks.slice(0, 5),
        }))
        .sort((a, b) => b.count - a.count);

      return {
        totalIncompleteTasks,
        reasonsAnalysis,
        filters,
      };
    } catch (error) {
      this.logger.error('Error in getIncompleteReasonsAnalysis:', error);
      throw error;
    }
  }

  /**
   * Get admin dashboard statistics
   */
  async getAdminDashboardStats(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
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

    // Get overview stats
    const dashboardStats = await this.getDashboardStats(userId);
    
    // Get additional admin-specific stats
    const currentWeek = getCurrentWorkWeek();
    
    const [
      totalUsers,
      totalReports,
      currentWeekReports
    ] = await Promise.all([
      this.prisma.user.count({
        where: { isActive: true }
      }),
      this.prisma.report.count(),
      this.prisma.report.count({
        where: {
          weekNumber: currentWeek.weekNumber,
          year: currentWeek.year
        }
      })
    ]);

    return {
      ...dashboardStats,
      adminStats: {
        totalUsers,
        totalReports,
        currentWeekReports,
        reportingRate: totalUsers > 0 ? Math.round((currentWeekReports / totalUsers) * 100) : 0
      }
    };
  }

  /**
   * Combined method to get all dashboard data at once - Fix parameter and method calls
   */
  async getAllDashboardData(userId: string) {
    const [
      dashboardStats,
      userReportStats,
      weeklyTaskStats,
      monthlyTaskStats,
      yearlyTaskStats,
      recentActivities
    ] = await Promise.all([
      this.getDashboardStats(userId), // Fix: Pass userId parameter
      this.getUserReportStats(userId),
      this.getWeeklyTaskStats(userId),
      this.getMonthlyTaskStats(userId),
      this.getYearlyTaskStats(userId),
      this.getRecentActivities(userId)
    ]);

    return {
      dashboardStats,
      userReportStats,
      weeklyTaskStats,
      monthlyTaskStats,
      yearlyTaskStats,
      recentActivities
    };
  }

  /**
   * Get completion rate statistics - Implementation for missing method
   */
  async getCompletionRate(userId: string, filters?: {
    week?: number
    year?: number
    departmentId?: string
  }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        office: true,
        jobPosition: {
          include: {
            department: true
          }
        }
      }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const currentWeek = getCurrentWorkWeek();
    const targetWeek = filters?.week || currentWeek.weekNumber;
    const targetYear = filters?.year || currentWeek.year;

    // Build where clause based on user role and filters
    const whereClause: any = {
      weekNumber: targetWeek,
      year: targetYear
    };

    // Apply department filter if provided and user has permission
    if (filters?.departmentId && ['ADMIN', 'SUPERADMIN'].includes(user.role)) {
      whereClause.user = {
        jobPosition: {
          departmentId: filters.departmentId
        }
      };
    } else if (user.role === 'USER') {
      // Regular user can only see their own data
      whereClause.userId = userId;
    }

    const reports = await this.prisma.report.findMany({
      where: whereClause,
      include: {
        tasks: true,
        user: {
          include: {
            jobPosition: {
              include: {
                department: true
              }
            }
          }
        }
      }
    });

    const totalTasks = reports.reduce((sum, report) => sum + report.tasks.length, 0);
    const completedTasks = reports.reduce((sum, report) => 
      sum + report.tasks.filter(task => task.isCompleted).length, 0);

    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return {
      targetWeek,
      targetYear,
      totalReports: reports.length,
      totalTasks,
      completedTasks,
      completionRate,
      departmentId: filters?.departmentId,
      userRole: user.role
    };
  }

  /**
   * Get missing reports statistics - Implementation for missing method
   */
  async getMissingReports(userId: string, filters?: {
    week?: number
    year?: number
  }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        office: true,
        jobPosition: {
          include: {
            department: true
          }
        }
      }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const currentWeek = getCurrentWorkWeek();
    const targetWeek = filters?.week || currentWeek.weekNumber;
    const targetYear = filters?.year || currentWeek.year;

    // Build user filter based on role
    const userWhereClause: any = {
      isActive: true
    };

     if (user.role === 'USER') {
      userWhereClause.id = userId;
    }
    // ADMIN and SUPERADMIN can see all users (no additional filter)

    // Get all active users
    const allUsers = await this.prisma.user.findMany({
      where: userWhereClause,
      include: {
        reports: {
          where: {
            weekNumber: targetWeek,
            year: targetYear
          }
        },
        jobPosition: {
          include: {
            department: true,
            position: true
          }
        },
        office: true
      }
    });

    // Filter users without reports
    const usersWithoutReports = allUsers.filter(user => user.reports.length === 0);

    return {
      targetWeek,
      targetYear,
      totalUsers: allUsers.length,
      usersWithReports: allUsers.length - usersWithoutReports.length,
      usersWithoutReports: usersWithoutReports.length,
      missingReportRate: allUsers.length > 0 
        ? Math.round((usersWithoutReports.length / allUsers.length) * 100) 
        : 0,
      userRole: user.role,
      missingUsers: usersWithoutReports.map(user => ({
        id: user.id,
        employeeCode: user.employeeCode,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        office: user.office.name,
        department: user.jobPosition?.department?.name,
        position: user.jobPosition?.position?.name
      }))
    };
  }
}
