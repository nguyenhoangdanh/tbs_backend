import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { EvaluationType } from '@prisma/client';

interface CreateEvaluationDto {
  taskId: string;
  evaluatorComment?: string;
}

interface UpdateEvaluationDto {
  evaluatorComment?: string;
}

@Injectable()
export class TaskEvaluationsService {
  constructor(private prisma: PrismaService) {}

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
        originalReasonNotDone: task.reasonNotDone || ''
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
                    jobPosition: { include: { department: true, position: true } }
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

    if (evaluation.evaluatorId !== evaluatorId) {
      await this.checkEvaluationPermission(evaluatorId, evaluatorRole, evaluation.task);
    }

    const updatedEvaluation = await this.prisma.taskEvaluation.update({
      where: { id: evaluationId },
      data: { evaluatorComment: updateEvaluationDto.evaluatorComment },
      include: {
        evaluator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeCode: true,
            jobPosition: { include: { position: true, department: true } }
          }
        },
        task: {
          include: {
            report: {
              include: {
                user: { select: { id: true, firstName: true, lastName: true, employeeCode: true } }
              }
            }
          }
        }
      }
    });

    return updatedEvaluation;
  }

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
            jobPosition: { include: { position: true, department: true } }
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    return evaluations;
  }

  async getEvaluationsByEvaluator(
    evaluatorId: string,
    evaluatorRole: string,
    filters?: {
      weekNumber?: number;
      year?: number;
      userId?: string;
    }
  ) {
    const whereClause: any = { evaluatorId };

    if (filters?.weekNumber || filters?.year || filters?.userId) {
      whereClause.task = { report: {} };

      if (filters.weekNumber) whereClause.task.report.weekNumber = filters.weekNumber;
      if (filters.year) whereClause.task.report.year = filters.year;
      if (filters.userId) whereClause.task.report.userId = filters.userId;
    }

    return this.prisma.taskEvaluation.findMany({
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
                    jobPosition: { include: { position: true, department: true } }
                  }
                }
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

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
    const manager = await this.prisma.user.findUnique({
      where: { id: managerId },
      include: { jobPosition: { include: { position: true, department: true } } }
    });

    if (!manager) {
      throw new NotFoundException('Manager not found');
    }

    const managerPosition = manager.jobPosition?.position;

    if (!managerPosition?.canViewHierarchy && !managerPosition?.isManagement) {
      return [];
    }

    const whereClause: any = {
      report: {
        user: {
          jobPosition: {
            position: { level: { gt: managerPosition.level } }
          }
        }
      }
    };

    if (filters?.weekNumber) whereClause.report.weekNumber = filters.weekNumber;
    if (filters?.year) whereClause.report.year = filters.year;
    if (filters?.userId) whereClause.report.userId = filters.userId;
    if (filters?.isCompleted !== undefined) whereClause.isCompleted = filters.isCompleted;

    return this.prisma.reportTask.findMany({
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
                jobPosition: { include: { position: true, department: true } }
              }
            }
          }
        },
        evaluations: {
          include: {
            evaluator: {
              select: { id: true, firstName: true, lastName: true, employeeCode: true }
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
  }

  private async checkEvaluationPermission(
    evaluatorId: string,
    evaluatorRole: string,
    task: any
  ) {
    const evaluator = await this.prisma.user.findUnique({
      where: { id: evaluatorId },
      include: { jobPosition: { include: { position: true, department: true } } }
    });

    if (!evaluator) {
      throw new NotFoundException('Evaluator not found');
    }

    const evaluatorPosition = evaluator.jobPosition?.position;
    const taskUserPosition = task.report.user.jobPosition?.position;

    if (!evaluatorPosition?.canViewHierarchy && !evaluatorPosition?.isManagement) {
      throw new ForbiddenException('Bạn không có quyền quản lý để đánh giá công việc');
    }

    if (taskUserPosition.level <= evaluatorPosition.level) {
      throw new ForbiddenException(
        `Chỉ có thể đánh giá cấp dưới. Cấp của bạn: ${evaluatorPosition.level}, Cấp nhân viên: ${taskUserPosition.level}`
      );
    }
  }

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
