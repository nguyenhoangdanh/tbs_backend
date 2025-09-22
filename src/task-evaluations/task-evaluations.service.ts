import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Role, EvaluationType } from '@prisma/client';
import { tr } from 'date-fns/locale';

interface CreateEvaluationDto {
  taskId: string;
  evaluatedIsCompleted: boolean;
  evaluatedReasonNotDone?: string;
  evaluatorComment?: string;
  evaluationType: EvaluationType;
}

interface UpdateEvaluationDto {
  evaluatedIsCompleted?: boolean;
  evaluatedReasonNotDone?: string;
  evaluatorComment?: string;
  evaluationType?: EvaluationType;
}

@Injectable()
export class TaskEvaluationsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new task evaluation by a manager
   */
  async createTaskEvaluation(
    evaluatorId: string,
    evaluatorRole: Role,
    createEvaluationDto: CreateEvaluationDto
  ) {
    // Get the task and validate it exists
    const task = await this.prisma.reportTask.findUnique({
      where: { id: createEvaluationDto.taskId },
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
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Check if evaluator has permission to evaluate this task
    await this.checkEvaluationPermission(evaluatorId, evaluatorRole, task);

    // Check if evaluation already exists
    const existingEvaluation = await this.prisma.taskEvaluation.findUnique({
      where: {
        taskId_evaluatorId: {
          taskId: createEvaluationDto.taskId,
          evaluatorId: evaluatorId
        }
      }
    });

    if (existingEvaluation) {
      throw new BadRequestException('Evaluation already exists for this task');
    }

    // Create the evaluation
    const evaluation = await this.prisma.taskEvaluation.create({
      data: {
        taskId: createEvaluationDto.taskId,
        evaluatorId,
        originalIsCompleted: task.isCompleted,
        originalReasonNotDone: task.reasonNotDone,
        evaluatedIsCompleted: createEvaluationDto.evaluatedIsCompleted,
        evaluatedReasonNotDone: createEvaluationDto.evaluatedReasonNotDone,
        evaluatorComment: createEvaluationDto.evaluatorComment,
        evaluationType: createEvaluationDto.evaluationType
      },
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
      }
    });

    return evaluation;
  }

  /**
   * Update an existing task evaluation
   */
  async updateTaskEvaluation(
    evaluationId: string,
    evaluatorId: string,
    evaluatorRole: Role,
    updateEvaluationDto: UpdateEvaluationDto
  ) {
    // Get the evaluation and validate it exists
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
      }
    });

    return updatedEvaluation;
  }

  /**
   * Get task evaluations for a specific task
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
      orderBy: { createdAt: 'desc' }
    });

    return evaluations;
  }

  /**
   * Get evaluations created by a specific evaluator
   */
  async getEvaluationsByEvaluator(
    evaluatorId: string,
    evaluatorRole: Role,
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
   */
  async getEvaluableTasksForManager(
    managerId: string,
    managerRole: Role,
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

    // Add permission-based filters
    if (managerRole === Role.SUPERADMIN) {
      // SUPERADMIN can evaluate all tasks
    } else if (managerRole === Role.ADMIN) {
      // ADMIN can evaluate tasks from their office
      whereClause.report = {
        ...whereClause.report,
        user: {
          officeId: manager.officeId
        }
      };
    } else if (managerRole === Role.USER || managerRole === Role.MEDICAL_STAFF) {
      // USER can only evaluate tasks if they have management permissions
      const position = manager.jobPosition?.position;
      if (!position?.canViewHierarchy && !position?.isManagement) {
        return []; // No tasks can be evaluated
      }

      // Can evaluate tasks from subordinates in same department
      whereClause.report = {
        ...whereClause.report,
        user: {
          jobPosition: {
            departmentId: manager.jobPosition.departmentId,
            position: {
              level: {
                gt: position.level // Only subordinates
              }
            }
          }
        }
      };
    }

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
   */
  private async checkEvaluationPermission(
    evaluatorId: string,
    evaluatorRole: Role,
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

    // SUPERADMIN can evaluate any task
    if (evaluatorRole === Role.SUPERADMIN) {
      return;
    }

    // ADMIN can evaluate tasks from their office
    // if (evaluatorRole === Role.ADMIN) {
    //   if (task.report.user.officeId === evaluator.officeId) {
    //     return;
    //   }
    //   throw new ForbiddenException('Admin can only evaluate tasks from their office');
    // }

    // USER role - check management permissions
    // if (evaluatorRole === Role.USER) {
      const position = evaluator.jobPosition?.position;
      
      if (!position?.canViewHierarchy && !position?.isManagement) {
        throw new ForbiddenException('User does not have management permissions');
      }

      // Check if the task belongs to a subordinate
      const taskUser = task.report.user;
      
      // Must be from same department
      // if (taskUser.jobPosition.departmentId !== evaluator.jobPosition.departmentId) {
      //   throw new ForbiddenException('Can only evaluate tasks from same department');
      // }

      // Must be from a subordinate (higher level number)
      if (taskUser.jobPosition.position.level <= position.level) {
        // throw new ForbiddenException('Can only evaluate tasks from subordinates with lower position level');
        throw new ForbiddenException('Chỉ có thể đánh giá nhiệm vụ của cấp dưới có cấp bậc thấp hơn');
      }

      return;
    // }

    // throw new ForbiddenException('Insufficient permissions to evaluate this task');
  }

  /**
   * Delete a task evaluation
   */
  async deleteTaskEvaluation(
    evaluationId: string,
    evaluatorId: string,
    evaluatorRole: Role
  ) {
    // Get the evaluation
    const evaluation = await this.prisma.taskEvaluation.findUnique({
      where: { id: evaluationId }
    });

    if (!evaluation) {
      throw new NotFoundException('Evaluation not found');
    }

    // Check if evaluator has permission to delete
    if (evaluation.evaluatorId !== evaluatorId && evaluatorRole !== Role.SUPERADMIN) {
      throw new ForbiddenException('Can only delete your own evaluations');
    }

    // await this.prisma.reportTask.update({
    //   where: { id: evaluation.taskId },
    //   data: {
    //     isCompleted: evaluation.originalIsCompleted,
    //     reasonNotDone: evaluation.originalReasonNotDone || null
    //   }
    // });

    // await this.prisma.taskEvaluation.delete({
    //   where: { id: evaluationId }
    // });

    await Promise.all([
      this.prisma.reportTask.update({
        where: { id: evaluation.taskId },
        data: {
          isCompleted: evaluation.originalIsCompleted,
          reasonNotDone:  ""
        }
      }),
      this.prisma.taskEvaluation.delete({
        where: { id: evaluationId }
      })
    ]);

    return { message: 'Evaluation deleted successfully' };
  }
}