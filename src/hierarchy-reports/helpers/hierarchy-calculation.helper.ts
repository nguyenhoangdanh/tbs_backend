import { Injectable } from '@nestjs/common';

@Injectable()
export class HierarchyCalculationHelper {
  
  calculateUserStats(users: any[], weekNumber: number, year: number) {
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

  calculateRanking(rate: number): string {
    if (rate > 90) return 'EXCELLENT';
    if (rate >= 80) return 'GOOD';
    if (rate >= 70) return 'AVERAGE';
    return 'POOR';
  }

  calculateRankingDistribution(rates: number[]) {
    const distribution = {
      excellent: { count: 0, percentage: 0 },
      good: { count: 0, percentage: 0 },
      average: { count: 0, percentage: 0 },
      poor: { count: 0, percentage: 0 }
    };

    rates.forEach(rate => {
      if (rate > 90) distribution.excellent.count++;
      else if (rate >= 80) distribution.good.count++;
      else if (rate >= 70) distribution.average.count++;
      else distribution.poor.count++;
    });

    const total = rates.length;
    Object.keys(distribution).forEach(key => {
      const item = distribution[key as keyof typeof distribution];
      item.percentage = total > 0 ? Math.round((item.count / total) * 100) : 0;
    });

    return distribution;
  }

  calculateDepartmentBreakdown(users: any[]) {
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

  calculateSubordinateStats(subordinate: any, report: any) {
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

  /**
   * ENHANCED: Calculate department-aware user stats
   */
  calculateDepartmentAwareStats(users: any[], weekNumber: number, year: number, managedDepartmentIds: string[] = []) {
    // Filter users by managed departments if specified
    const relevantUsers = managedDepartmentIds.length > 0 
      ? users.filter(user => {
          const userDeptId = user.jobPosition?.department?.id;
          return managedDepartmentIds.includes(userDeptId);
        })
      : users;

    return this.calculateUserStats(relevantUsers, weekNumber, year);
  }

  /**
   * ENHANCED: Calculate department breakdown with management context
   */
  calculateManagedDepartmentBreakdown(users: any[], managedDepartmentIds: string[] = []) {
    const departmentMap = new Map();
    
    users.forEach(user => {
      const deptId = user.jobPosition?.department?.id;
      const deptName = user.jobPosition?.department?.name;
      
      if (deptId && deptName) {
        // Only include if in managed departments or if no restriction
        if (managedDepartmentIds.length === 0 || managedDepartmentIds.includes(deptId)) {
          if (!departmentMap.has(deptId)) {
            departmentMap.set(deptId, {
              id: deptId,
              name: deptName,
              userCount: 0,
              usersWithReports: 0,
              isManaged: managedDepartmentIds.includes(deptId)
            });
          }
          
          const dept = departmentMap.get(deptId);
          dept.userCount++;
          
          if (user.reports && user.reports.length > 0) {
            dept.usersWithReports++;
          }
        }
      }
    });

    return Array.from(departmentMap.values());
  }
}
