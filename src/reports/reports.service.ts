import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateWeeklyReportDto, UpdateReportDto } from './dto/report.dto';
import { 
  getCurrentWorkWeek, 
  isValidWeekForCreation, 
  isValidWeekForEdit, 
  isValidWeekForDeletion 
} from '../common/utils/week-utils';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async createWeeklyReport(
    userId: string,
    createReportDto: CreateWeeklyReportDto,
  ) {
    const { weekNumber, year, tasks } = createReportDto;

    /**
     * VALIDATION TUẦN LÀM VIỆC:
     * - Chỉ cho phép tạo báo cáo cho tuần trước, hiện tại, tiếp theo
     * - Tuần hiện tại được tính theo work week logic (T6-T5)
     * - Kiểm tra dựa trên getCurrentWorkWeek() đã được cập nhật
     */
    const { weekNumber: currentWeek, year: currentYear } = getCurrentWorkWeek();
    
    const isValidWeek = isValidWeekForCreation(weekNumber, year, currentWeek, currentYear);

    if (!isValidWeek) {
      throw new BadRequestException(
        'Chỉ có thể tạo báo cáo cho tuần hiện tại, tuần trước và tuần sau',
      );
    }

    // Check if report already exists
    const existingReport = await this.prisma.report.findUnique({
      where: {
        weekNumber_year_userId: {
          weekNumber,
          year,
          userId,
        },
      },
    });

    if (existingReport) {
      throw new ConflictException('Báo cáo cho tuần này đã tồn tại');
    }

    // Validate: require reasonNotDone if not completed
    for (const task of tasks) {
      if (
        !task.isCompleted &&
        (!task.reasonNotDone || !task.reasonNotDone.trim())
      ) {
        throw new BadRequestException(
          'Lý do chưa hoàn thành là bắt buộc cho các công việc chưa hoàn thành',
        );
      }
    }

    // Create report with tasks (6-day work week)
    const report = await this.prisma.report.create({
      data: {
        weekNumber,
        year,
        userId,
        isCompleted: this.checkIfReportCompleted(tasks),
        tasks: {
          create: tasks.map((task) => ({
            taskName: task.taskName,
            monday: task.monday || false,
            tuesday: task.tuesday || false,
            wednesday: task.wednesday || false,
            thursday: task.thursday || false,
            friday: task.friday || false,
            saturday: task.saturday || false,
            isCompleted: task.isCompleted || false,
            reasonNotDone: task.reasonNotDone,
          })),
        },
      },
      include: {
        tasks: true,
        user: {
          include: {
            office: true,
            jobPosition: {
              include: {
                department: {
                  include: {
                    office: true,
                  },
                },
                position: true,
              },
            },
          },
        },
      },
    });

    return report;
  }

  async updateReport(
    userId: string,
    reportId: string,
    updateReportDto: UpdateReportDto,
  ) {
    // Check if report exists and belongs to user
    const existingReport = await this.prisma.report.findFirst({
      where: { id: reportId, userId },
      include: {
        tasks: {
          include: {
            evaluations: true,
          },
        },
      },
    });

    if (!existingReport) {
      throw new NotFoundException('Report not found');
    }

    // Check if report is locked
    if (existingReport.isLocked) {
      throw new ForbiddenException('Cannot update locked report');
    }

    // Validate week edit permissions using updated logic
    const { weekNumber: currentWeek, year: currentYear } = getCurrentWorkWeek();
    const isValidForEdit = isValidWeekForEdit(
      existingReport.weekNumber,
      existingReport.year,
      currentWeek,
      currentYear,
    );
    
    if (!isValidForEdit) {
      throw new ForbiddenException(
        'Chỉ có thể chỉnh sửa báo cáo cho tuần hiện tại, tuần trước và tuần sau',
      );
    }

    // Use transaction for atomic updates
    return this.prisma.$transaction(async (prisma) => {
      // Update tasks if new tasks are provided - PRESERVE EVALUATIONS
      if (updateReportDto.tasks) {
        // Validate: require reasonNotDone if not completed
        for (const task of updateReportDto.tasks) {
          if (
            !task.isCompleted &&
            (!task.reasonNotDone || !task.reasonNotDone.trim())
          ) {
            throw new BadRequestException(
              'Lý do chưa hoàn thành là bắt buộc cho các công việc chưa hoàn thành',
            );
          }
        }
        
        // Store existing evaluations before deleting tasks
        const existingTasksWithEvaluations = await prisma.reportTask.findMany({
          where: { reportId },
          include: {
            evaluations: true,
          },
        });

        // Create a map of task name -> evaluations for preservation
        const evaluationsMap = new Map();
        existingTasksWithEvaluations.forEach(task => {
          if (task.evaluations.length > 0) {
            evaluationsMap.set(task.taskName, task.evaluations);
          }
        });

        // Delete existing tasks (this will cascade delete evaluations)
        await prisma.reportTask.deleteMany({
          where: { reportId },
        });

        // Create new tasks
        if (updateReportDto.tasks.length > 0) {
          for (const taskDto of updateReportDto.tasks) {
            // Create the new task
            const newTask = await prisma.reportTask.create({
              data: {
                reportId,
                taskName: taskDto.taskName || '',
                monday: taskDto.monday || false,
                tuesday: taskDto.tuesday || false,
                wednesday: taskDto.wednesday || false,
                thursday: taskDto.thursday || false,
                friday: taskDto.friday || false,
                saturday: taskDto.saturday || false,
                isCompleted: taskDto.isCompleted || false,
                reasonNotDone: taskDto.reasonNotDone || null,
              },
            });

            // Restore evaluations if they existed for this task name
            const savedEvaluations = evaluationsMap.get(taskDto.taskName);
            if (savedEvaluations && savedEvaluations.length > 0) {
              for (const evaluation of savedEvaluations) {
                await prisma.taskEvaluation.create({
                  data: {
                    taskId: newTask.id,
                    evaluatorId: evaluation.evaluatorId,
                    originalIsCompleted: evaluation.originalIsCompleted,
                    evaluatedIsCompleted: evaluation.evaluatedIsCompleted,
                    originalReasonNotDone: evaluation.originalReasonNotDone,
                    evaluatedReasonNotDone: evaluation.evaluatedReasonNotDone,
                    evaluatorComment: evaluation.evaluatorComment,
                    evaluationType: evaluation.evaluationType,
                    createdAt: evaluation.createdAt, // Preserve original creation time
                  },
                });
              }
            }
          }
        }
      }

      // Update report with only provided fields (PATCH behavior)
      const updateData: any = {
        updatedAt: new Date(), // ALWAYS update timestamp when report is modified
      };
      
      if (updateReportDto.isCompleted !== undefined) {
        updateData.isCompleted = updateReportDto.isCompleted;
      }

      // Update the report
      const updatedReport = await prisma.report.update({
        where: { id: reportId },
        data: updateData,
        include: {
          tasks: true,
          user: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
              jobPosition: {
                include: {
                  department: {
                    include: { office: true },
                  },
                  position: true,
                },
              },
              office: true,
            },
          },
        },
      });

      return updatedReport;
    });
  }

  async getMyReports(userId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [reports, total] = await Promise.all([
      this.prisma.report.findMany({
        where: { userId },
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
                orderBy: { createdAt: 'desc' },
              },
            },
          },
          user: {
            include: {
              jobPosition: {
                include: {
                  department: {
                    include: {
                      office: true,
                    },
                  },
                  position: true,
                },
              },
              office: true,
            },
          },
        },
        orderBy: [{ year: 'desc' }, { weekNumber: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.report.count({
        where: { userId },
      }),
    ]);

    return {
      data: reports,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getCurrentWeekReport(userId: string) {
    /**
     * LẤY BÁO CÁO TUẦN HIỆN TẠI:
     * - Sử dụng getCurrentWorkWeek() để xác định tuần hiện tại
     * - Tuần hiện tại được tính theo logic T6-T5
     * - Kết quả sẽ đồng bộ với frontend
     */
    const { weekNumber, year } = getCurrentWorkWeek();

    const report = await this.prisma.report.findUnique({
      where: {
        weekNumber_year_userId: {
          weekNumber,
          year,
          userId,
        },
      },
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
                        position: {
                          select: {
                            name: true,
                            description: true,
                          }
                        }
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
        },
        user: {
          include: {
            jobPosition: {
              include: {
                department: {
                  include: {
                    office: true,
                  },
                },
                position: true,
              },
            },
            office: true,
          },
        },
      },
    });

    return report;
  }

  async getReportById(id: string, userId: string) {
    const report = await this.prisma.report.findFirst({
      where: {
        id,
        userId, // Ensure user can only access their own reports
      },
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
        },
        user: {
          include: {
            jobPosition: {
              include: {
                department: {
                  include: {
                    office: true,
                  },
                },
                position: true,
              },
            },
            office: true,
          },
        },
      },
    });

    if (!report) {
      throw new NotFoundException('Không tìm thấy báo cáo');
    }

    return report;
  }

  async getReportByWeek(userId: string, weekNumber: number, year: number) {
    const report = await this.prisma.report.findUnique({
      where: {
        weekNumber_year_userId: {
          weekNumber,
          year,
          userId,
        },
      },
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
          },
          orderBy: {
            createdAt: 'asc', // Ensure consistent task order
          },
        },
        user: {
          include: {
            jobPosition: {
              include: {
                department: {
                  include: {
                    office: true,
                  },
                },
                position: true,
              },
            },
            office: true,
          },
        },
      },
    });

    if (!report) {
      throw new NotFoundException(
        `Không tìm thấy báo cáo cho tuần ${weekNumber}/${year}`,
      );
    }

    return report;
  }

  // Approve task evaluation
  async approveTask(
    taskId: string,
  ) {
    // Find the task and verify ownership
    const task = await this.prisma.reportTask.findFirst({
      where: {
        id: taskId,
        // report: { userId },
      },
      include: {
        report: true,
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found or access denied');
    }

    // Update task isCompleted status
    const updatedTask = await this.prisma.reportTask.update({
      where: { id: taskId },
      data: {
        isCompleted: true,
        reasonNotDone: null, // Clear reasonNotDone if task is now completed
      },
    });

    // Update report timestamp
    await this.prisma.report.update({
      where: { id: task.report.id },
      data: { updatedAt: new Date() },
    });

    // Return updated task
    return updatedTask;
  }

  // Reject task evaluation
  async rejectTask(
    taskId: string,
    user: string,
  ) {
    // Find the task and verify ownership
    const task = await this.prisma.reportTask.findFirst({
      where: {
        id: taskId,
        // report: { userId },
      },
      include: {
        report: true,
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found or access denied');
    }

    // Update task isCompleted status
    const updatedTask = await this.prisma.reportTask.update({
      where: { id: taskId },
      data: {
        isCompleted: false, // Set to not completed
        reasonNotDone: `Từ chối bởi ${user}`, // Add rejection reason
      },
    });

    // Update report timestamp
    await this.prisma.report.update({
      where: { id: task.report.id },
      data: { updatedAt: new Date() },
    });

    // Return updated task
    return updatedTask;
  }

  // New method to delete individual task
  async deleteTask(userId: string, taskId: string) {
    // First, find the task and verify ownership
    const task = await this.prisma.reportTask.findFirst({
      where: {
        id: taskId,
        report: { userId },
      },
      include: {
        report: true,
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found or access denied');
    }

    // Check if the report is locked
    if (task.report.isLocked) {
      throw new ForbiddenException('Cannot delete task from locked report');
    }

    // Validate week edit permissions using updated logic
    const { weekNumber: currentWeek, year: currentYear } = getCurrentWorkWeek();
    const isValidForEdit = isValidWeekForEdit(
      task.report.weekNumber,
      task.report.year,
      currentWeek,
      currentYear,
    );
    
    if (!isValidForEdit) {
      throw new ForbiddenException(
        'Chỉ có thể chỉnh sửa báo cáo cho tuần hiện tại, tuần trước và tuần sau',
      );
    }

    // Use transaction to update both task and report timestamp
    await this.prisma.$transaction(async (prisma) => {
      // Delete the task
      await prisma.reportTask.delete({
        where: { id: taskId },
      });

      // Update report timestamp
      await prisma.report.update({
        where: { id: task.report.id },
        data: { updatedAt: new Date() },
      });
    });

    return { message: 'Task deleted successfully' };
  }

  async deleteReport(userId: string, reportId: string): Promise<void> {
    // Find the report first to ensure it exists and belongs to user
    const report = await this.prisma.report.findFirst({
      where: { 
        id: reportId,
        userId: userId
      },
      include: { user: true },
    });

    if (!report) {
      throw new NotFoundException('Báo cáo không tồn tại hoặc bạn không có quyền xóa');
    }

    // Check if report is locked
    if (report.isLocked) {
      throw new ForbiddenException('Không thể xóa báo cáo đã bị khóa');
    }

    // Check if week is still deletable using updated logic
    const { weekNumber: currentWeek, year: currentYear } = getCurrentWorkWeek();
    const isDeletableWeek = isValidWeekForDeletion(
      report.weekNumber,
      report.year,
      currentWeek,
      currentYear,
    );

    if (!isDeletableWeek) {
      throw new ForbiddenException(
        'Chỉ có thể xóa báo cáo của tuần hiện tại và tuần tiếp theo',
      );
    }

    // Use transaction to ensure data consistency
    await this.prisma.$transaction(async (prisma) => {
      // Delete all tasks first
      await prisma.reportTask.deleteMany({
        where: { reportId },
      });

      // Then delete the report
      await prisma.report.delete({
        where: { id: reportId },
      });
    });
  }

  // New method to update individual task
  async updateTask(userId: string, taskId: string, updateTaskDto: any) {
    // Find the task and verify ownership
    const task = await this.prisma.reportTask.findFirst({
      where: {
        id: taskId,
        report: { userId },
      },
      include: {
        report: true,
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found or access denied');
    }

    // Check if the report is locked
    if (task.report.isLocked) {
      throw new ForbiddenException('Cannot update task in locked report');
    }

    // Validate week edit permissions using updated logic
    const { weekNumber: currentWeek, year: currentYear } = getCurrentWorkWeek();
    const isValidForEdit = isValidWeekForEdit(
      task.report.weekNumber,
      task.report.year,
      currentWeek,
      currentYear,
    );
    
    if (!isValidForEdit) {
      throw new ForbiddenException(
        'Chỉ có thể chỉnh sửa báo cáo cho tuần hiện tại, tuần trước và tuần sau',
      );
    }

    // Validate: require reasonNotDone if not completed
    if (
      updateTaskDto.isCompleted === false &&
      (!updateTaskDto.reasonNotDone || !updateTaskDto.reasonNotDone.trim())
    ) {
      throw new BadRequestException(
        'Lý do chưa hoàn thành là bắt buộc cho các công việc chưa hoàn thành',
      );
    }

    // Use transaction to update both task and report timestamp
    return this.prisma.$transaction(async (prisma) => {
      // Only allow updating allowed fields (6-day work week)
      const allowedFields = [
        'taskName',
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'isCompleted',
        'reasonNotDone',
      ];
      
      // FIX: Build updateData with proper type checking
      const updateData: any = {};
      for (const key of allowedFields) {
        if (updateTaskDto[key] !== undefined) {
          if (key === 'taskName' && updateTaskDto[key] === '') {
            // Don't allow empty task name
            throw new BadRequestException('Tên công việc không được để trống');
          }
          updateData[key] = updateTaskDto[key];
        }
      }

      // Update the task
      const updatedTask = await prisma.reportTask.update({
        where: { id: taskId },
        data: updateData,
      });

      // Update report timestamp
      await prisma.report.update({
        where: { id: task.report.id },
        data: { updatedAt: new Date() },
      });

      return updatedTask;
    });
  }

  private checkIfReportCompleted(tasks: any[]): boolean {
    if (!tasks || tasks.length === 0) {
      return false;
    }

    // Report is considered completed if all tasks are completed
    return tasks.every((task) => task.isCompleted === true);
  }

  // Admin methods
  async getAllReports(
    page: number = 1,
    limit: number = 10,
    departmentId?: string,
    weekNumber?: number,
    year?: number,
  ) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (departmentId) {
      where.user = {
        jobPosition: {
          departmentId,
        },
      };
    }

    if (weekNumber && year) {
      where.weekNumber = weekNumber;
      where.year = year;
    }

    const [reports, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        include: {
          tasks: true,
          user: {
            include: {
              jobPosition: {
                include: {
                  department: {
                    include: {
                      office: true,
                    },
                  },
                  position: true,
                },
              },
              office: true,
            },
          },
        },
        orderBy: [
          { year: 'desc' },
          { weekNumber: 'desc' },
          { createdAt: 'desc' },
        ],
        skip,
        take: limit,
      }),
      this.prisma.report.count({ where }),
    ]);

    return {
      data: reports,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getReportStats(weekNumber?: number, year?: number) {
    const where: any = {};

    if (weekNumber && year) {
      where.weekNumber = weekNumber;
      where.year = year;
    }

    const [totalReports, completedReports, pendingReports] = await Promise.all([
      this.prisma.report.count({ where }),
      this.prisma.report.count({
        where: { ...where, isCompleted: true },
      }),
      this.prisma.report.count({
        where: { ...where, isCompleted: false },
      }),
    ]);

    // FIXED: Report stats completion rate calculation
    const completionRate = totalReports > 0
      ? Math.round(((completedReports / totalReports) * 100) * 100) / 100 // 2 decimal places
      : 0;

    return {
      totalReports,
      completedReports,
      pendingReports,
      completionRate,
    };
  }

  // Method for scheduled tasks
  async lockReportsForCurrentWeek() {
    const { weekNumber, year } = getCurrentWorkWeek();

    // Lock reports from previous week (current week - 1)
    let prevWeekNumber = weekNumber - 1;
    let prevYear = year;

    if (prevWeekNumber === 0) {
      prevWeekNumber = 52; // Last week of previous year
      prevYear = year - 1;
    }

    const result = await this.prisma.report.updateMany({
      where: {
        weekNumber: prevWeekNumber,
        year: prevYear,
        isLocked: false,
      },
      data: {
        isLocked: true,
      },
    });
    return result;
  }

  async lockReportsByWeek(weekNumber: number, year: number) {
    const result = await this.prisma.report.updateMany({
      where: {
        weekNumber,
        year,
        isLocked: false,
      },
      data: {
        isLocked: true,
      },
    });

    return result;
  }
}
