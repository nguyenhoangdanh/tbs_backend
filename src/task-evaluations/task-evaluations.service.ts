import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { EvaluationType } from '@prisma/client';

interface CreateEvaluationDto {
  taskId: string;
  evaluatorComment?: string;
  evaluatedIsCompleted?: boolean;
  evaluationType?: EvaluationType;
}

interface UpdateEvaluationDto {
  evaluatorComment?: string;
}

@Injectable()
export class TaskEvaluationsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new task evaluation.
   * Multiple evaluators can evaluate the same task independently.
   */
  async create(createDto: CreateEvaluationDto, evaluatorId: string) {
    const task = await this.prisma.reportTask.findUnique({
      where: { id: createDto.taskId },
      include: { report: { include: { user: true } } }
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const existingEvaluation = await this.prisma.taskEvaluation.findFirst({
      where: { taskId: createDto.taskId, evaluatorId }
    });

    if (existingEvaluation) {
      throw new ConflictException(
        'Bạn đã đánh giá công việc này. Vui lòng cập nhật đánh giá cũ thay vì tạo mới.'
      );
    }

    const newEvaluation = await this.prisma.taskEvaluation.create({
      data: {
        taskId: createDto.taskId,
        evaluatorId,
        evaluationType: EvaluationType.REVIEW,
        evaluatedIsCompleted: task.isCompleted,
        evaluatorComment: createDto.evaluatorComment,
        originalIsCompleted: task.isCompleted,
        originalReasonNotDone: task.reasonNotDone || '',
      },
      include: {
        evaluator: {
          include: {
            jobPosition: { include: { position: true } }
          }
        }
      }
    });

    return newEvaluation;
  }

  /**
   * Update an existing task evaluation (comment only)
   */
  async updateTaskEvaluation(
    evaluationId: string,
    evaluatorId: string,
    evaluatorRole: string,
    updateEvaluationDto: UpdateEvaluationDto
  ) {
    const evaluation = await this.prisma.taskEvaluation.findUnique({
      where: { id: evaluationId },
      include: {
        task: {
          include: {
            report: {
              include: {
                user: {
                  include: {
                    jobPosition: {
                      include: {
                        department: true,
                        position: true
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

    if (!evaluation) {
      throw new NotFoundException('Evaluation not found');
    }

    // Check if evaluator has permission to update this evaluation
    if (evaluation.evaluatorId !== evaluatorId) {
      await this.checkEvaluationPermission(evaluatorId, evaluatorRole, evaluation.task);
    }

    // Update the evaluation
    const updatedEvaluation = await this.prisma.taskEvaluation.update({
      where: { id: evaluationId },
      data: updateEvaluationDto,
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
        },
        task: {
          include: {
            report: {
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    employeeCode: true
                  }
                }
              }
            }
          }
        }
      }});

    return updatedEvaluation;
  }

  /**
   * Get task evaluations for a specific task
   * ✅ FIXED: Returns ALL evaluations from ALL managers
   */
  async getTaskEvaluations(taskId: string) {
    const evaluations = await this.prisma.taskEvaluation.findMany({
      where: { taskId },
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
      orderBy: { updatedAt: 'desc' } // ✅ Sort by updatedAt to show latest first
    });

    console.log(`📊 Task ${taskId} has ${evaluations.length} evaluations from ${new Set(evaluations.map(e => e.evaluatorId)).size} different managers`);
    
    return evaluations;
  }

  /**
   * Get evaluations created by a specific evaluator
   */
  async getEvaluationsByEvaluator(
    evaluatorId: string,
    evaluatorRole: string,
    filters?: {
      weekNumber?: number;
      year?: number;
      userId?: string;
      evaluationType?: EvaluationType;
    }
  ) {
    // Build where clause for evaluations
    const whereClause: any = { evaluatorId };

    if (filters?.evaluationType) {
      whereClause.evaluationType = filters.evaluationType;
    }

    // Add filters for report week/year and user
    if (filters?.weekNumber || filters?.year || filters?.userId) {
      whereClause.task = {
        report: {}
      };

      if (filters.weekNumber) {
        whereClause.task.report.weekNumber = filters.weekNumber;
      }

      if (filters.year) {
        whereClause.task.report.year = filters.year;
      }

      if (filters.userId) {
        whereClause.task.report.userId = filters.userId;
      }
    }

    const evaluations = await this.prisma.taskEvaluation.findMany({
      where: whereClause,
      include: {
        task: {
          include: {
            report: {
              include: {
                user: {
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
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return evaluations;
  }

  /**
   * Get tasks that can be evaluated by a manager
   * ✅ FIXED: Based on LEVEL, not role
   */
  async getEvaluableTasksForManager(
    managerId: string,
    managerRole: string,
    filters?: {
      weekNumber?: number;
      year?: number;
      userId?: string;
      isCompleted?: boolean;
    }
  ) {
    // Get manager information
    const manager = await this.prisma.user.findUnique({
      where: { id: managerId },
      include: {
        jobPosition: {
          include: {
            position: true,
            department: true
          }
        }
      }
    });

    if (!manager) {
      throw new NotFoundException('Manager not found');
    }

    const managerPosition = manager.jobPosition?.position;

    // ✅ CHECK: Manager must have management permissions
    if (!managerPosition?.canViewHierarchy && !managerPosition?.isManagement) {
      return []; // No tasks can be evaluated
    }

    // Build where clause for tasks
    const whereClause: any = {};

    // Add filters
    if (filters?.weekNumber || filters?.year || filters?.userId) {
      whereClause.report = {};

      if (filters.weekNumber) {
        whereClause.report.weekNumber = filters.weekNumber;
      }

      if (filters.year) {
        whereClause.report.year = filters.year;
      }

      if (filters.userId) {
        whereClause.report.userId = filters.userId;
      }
    }

    if (filters?.isCompleted !== undefined) {
      whereClause.isCompleted = filters.isCompleted;
    }

    // ✅ FIXED: Filter by level (subordinates only)
    // Only get tasks from users with higher level number (lower authority)
    whereClause.report = {
      ...whereClause.report,
      user: {
        ...whereClause.report?.user,
        jobPosition: {
          position: {
            level: {
              gt: managerPosition.level // Only subordinates with higher level number
            }
          }
        }
      }
    };

    const tasks = await this.prisma.reportTask.findMany({
      where: whereClause,
      include: {
        report: {
          include: {
            user: {
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
          }
        },
        evaluations: {
          include: {
            evaluator: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                employeeCode: true
              }
            }
          }
        }
      },
      orderBy: [
        { report: { year: 'desc' } },
        { report: { weekNumber: 'desc' } },
        { report: { user: { lastName: 'asc' } } },
        { createdAt: 'asc' }
      ]
    });

    return tasks;
  }

  /**
   * Check if evaluator has permission to evaluate a task
   * ✅ FIXED: Check based on LEVEL and MANAGEMENT permissions, NOT role
   * - Evaluator must have management permissions (isManagement OR canViewHierarchy)
   * - Evaluator must have LOWER level number (higher authority) than task owner
   * - Level 0 (TGĐ) can evaluate level 1,2,3...
   * - Level 1 (PTGĐ) can evaluate level 2,3,4...
   * - etc.
   */
  private async checkEvaluationPermission(
    evaluatorId: string,
    evaluatorRole: string,
    task: any
  ) {
    // Get evaluator information
    const evaluator = await this.prisma.user.findUnique({
      where: { id: evaluatorId },
      include: {
        jobPosition: {
          include: {
            position: true,
            department: true
          }
        }
      }
    });

    if (!evaluator) {
      throw new NotFoundException('Evaluator not found');
    }

    const evaluatorPosition = evaluator.jobPosition?.position;
    const taskUser = task.report.user;
    const taskUserPosition = taskUser.jobPosition?.position;

    // ✅ CHECK 1: Evaluator must have management permissions
    if (!evaluatorPosition?.canViewHierarchy && !evaluatorPosition?.isManagement) {
      throw new ForbiddenException('Bạn không có quyền quản lý để đánh giá công việc');
    }

    // ✅ CHECK 2: Must evaluate subordinates (lower level = higher number)
    // Level càng thấp = Chức vụ càng cao
    // Example: Level 0 (TGĐ) > Level 3 (PGĐ) > Level 7 (NV)
    if (taskUserPosition.level <= evaluatorPosition.level) {
      throw new ForbiddenException(
        `Chỉ có thể đánh giá cấp dưới. Cấp của bạn: ${evaluatorPosition.level} (${evaluatorPosition.description}), Cấp nhân viên: ${taskUserPosition.level} (${taskUserPosition.description})`
      );
    }

    // ✅ OPTIONAL CHECK 3: Same office check (có thể bỏ comment nếu cần)
    // if (taskUser.officeId !== evaluator.officeId) {
    //   throw new ForbiddenException('Chỉ có thể đánh giá nhân viên trong cùng văn phòng');
    // }

    return;
  }

  /**
   * Delete a task evaluation
   */
  async deleteTaskEvaluation(
    evaluationId: string,
    evaluatorId: string,
    evaluatorRole: string
  ) {
    const evaluation = await this.prisma.taskEvaluation.findUnique({
      where: { id: evaluationId }
    });

    if (!evaluation) {
      throw new NotFoundException('Evaluation not found');
    }

    if (evaluation.evaluatorId !== evaluatorId && evaluatorRole !== 'SUPERADMIN') {
      throw new ForbiddenException('Can only delete your own evaluations');
    }

    await this.prisma.taskEvaluation.delete({ where: { id: evaluationId } });

    return { message: 'Evaluation deleted successfully' };
  }
}