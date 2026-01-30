/**
 * ===============================================
 * TESTING GUIDE: Multiple Manager Evaluations
 * ===============================================
 * 
 * SCENARIO: 2 managers evaluate same task
 * 
 * STEP 1: Manager A evaluates Task #1
 * ----------------------------------------
 * Request: POST /task-evaluations
 * Body: {
 *   taskId: "task-123",
 *   evaluatedIsCompleted: true,
 *   evaluatorComment: "Tốt lắm!",
 *   evaluationType: "APPROVAL"
 * }
 * 
 * Expected Console Log:
 * 🔍 Task task-123 currently has 0 evaluations
 * ✅ Evaluation created successfully:
 *    - TaskID: task-123
 *    - EvaluatorID: manager-a-id
 *    - EvaluationID: eval-1-id
 *    - Total evaluations on this task: 1
 *    - Unique evaluators: 1
 * 
 * STEP 2: Manager B evaluates Task #1 (SAME TASK)
 * ------------------------------------------------
 * Request: POST /task-evaluations
 * Body: {
 *   taskId: "task-123",  // ✅ SAME TASK
 *   evaluatedIsCompleted: false,
 *   evaluatorComment: "Cần cải thiện",
 *   evaluationType: "REVIEW"
 * }
 * 
 * Expected Console Log:
 * 🔍 Task task-123 currently has 1 evaluations  // ✅ Manager A's evaluation exists
 * ✅ Evaluation created successfully:
 *    - TaskID: task-123
 *    - EvaluatorID: manager-b-id
 *    - EvaluationID: eval-2-id
 *    - Total evaluations on this task: 2  // ✅ CRITICAL: Should be 2
 *    - Unique evaluators: 2  // ✅ CRITICAL: Should be 2
 * 
 * STEP 3: Verify by fetching report
 * ----------------------------------
 * Request: GET /reports/by-week/{weekNumber}/{year}
 * 
 * Expected Response:
 * {
 *   tasks: [{
 *     id: "task-123",
 *     taskName: "...",
 *     evaluations: [
 *       {
 *         id: "eval-2-id",
 *         evaluator: { firstName: "Manager", lastName: "B" },
 *         evaluationType: "REVIEW",
 *         // ... Manager B's evaluation (latest)
 *       },
 *       {
 *         id: "eval-1-id",
 *         evaluator: { firstName: "Manager", lastName: "A" },
 *         evaluationType: "APPROVAL",
 *         // ... Manager A's evaluation (older)
 *       }
 *     ]
 *   }]
 * }
 * 
 * ❌ WRONG RESULT (nếu có bug):
 * {
 *   tasks: [{
 *     evaluations: [
 *       {
 *         id: "eval-2-id",
 *         // ... Only Manager B's evaluation (Manager A's lost)
 *       }
 *     ]
 *   }]
 * }
 * 
 * STEP 4: Check database directly
 * --------------------------------
 * Query: SELECT * FROM TaskEvaluation WHERE taskId = 'task-123'
 * 
 * Expected Result: 2 rows
 * Row 1: evaluationId=eval-1-id, evaluatorId=manager-a-id
 * Row 2: evaluationId=eval-2-id, evaluatorId=manager-b-id
 * 
 * ===============================================
 * COMMON ISSUES:
 * ===============================================
 * 
 * ISSUE 1: Manager B's evaluation overwrites Manager A's
 * ROOT CAUSE: Backend has deleteMany() before create()
 * FIX: Remove deleteMany() from create() method ✅ DONE
 * 
 * ISSUE 2: Frontend only shows 1 evaluation
 * ROOT CAUSE: Frontend state management issue or cache
 * FIX: 
 * - Clear browser cache
 * - Check React Query cache invalidation
 * - Check Zustand store sync
 * 
 * ISSUE 3: Database has 2 evaluations but frontend shows 1
 * ROOT CAUSE: Backend query doesn't include all evaluations
 * FIX: Ensure reports query includes all evaluations ✅ CHECK
 * 
 * ===============================================
 */

import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { EvaluationType } from '@prisma/client';

// ✅ FIXED: Proper DTO interfaces
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
   * ✅ FIXED: Allows multiple managers to evaluate same task
   * 
   * LOGIC:
   * - Manager A đánh giá Task #1 → Create evaluation A
   * - Manager B đánh giá Task #1 → Create evaluation B
   * - Task #1 sẽ có 2 evaluations: [evaluation A, evaluation B]
   * - Frontend sẽ hiển thị cả 2 evaluations
   */
  async create(createDto: CreateEvaluationDto, evaluatorId: string) {
    // ✅ STEP 1: Validate task exists
    const task = await this.prisma.reportTask.findUnique({
      where: { id: createDto.taskId },
      include: { 
        report: {
          include: {
            user: true
          }
        },
        // ✅ CRITICAL: Include existing evaluations to verify
        evaluations: {
          include: {
            evaluator: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            }
          }
        }
      }
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    console.log(`🔍 Task ${createDto.taskId} currently has ${task.evaluations?.length || 0} evaluations`);

    // ✅ STEP 2: Check if THIS evaluator already evaluated THIS task
    const existingEvaluation = await this.prisma.taskEvaluation.findFirst({
      where: {
        taskId: createDto.taskId,
        evaluatorId: evaluatorId
      }
    });

    if (existingEvaluation) {
      throw new ConflictException(
        'Bạn đã đánh giá công việc này. Vui lòng cập nhật đánh giá cũ thay vì tạo mới.'
      );
    }

    // ✅ STEP 3: Save original task state
    const originalIsCompleted = task.isCompleted;
    const originalReasonNotDone = task.reasonNotDone || '';

    // ✅ STEP 4: Create new evaluation (NO deletion of others)
    const newEvaluation = await this.prisma.taskEvaluation.create({
      data: {
        taskId: createDto.taskId,
        evaluatorId,
        evaluationType: createDto.evaluationType,
        evaluatedIsCompleted: createDto.evaluatedIsCompleted,
        evaluatorComment: createDto.evaluatorComment,
        evaluatedReasonNotDone: createDto.evaluatedReasonNotDone,
        originalIsCompleted,
        originalReasonNotDone
      },
      include: {
        task: {
          include: {
            // ✅ VERIFY: Include all evaluations after creation
            evaluations: {
              include: {
                evaluator: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true
                  }
                }
              }
            }
          }
        },
        evaluator: {
          include: {
            jobPosition: {
              include: {
                position: true
              }
            }
          }
        }
      }
    });

    const totalEvaluations = newEvaluation.task.evaluations?.length || 1;
    const uniqueEvaluators = new Set(newEvaluation.task.evaluations?.map(e => e.evaluatorId)).size;
    
    console.log(`✅ Evaluation created successfully:`);
    console.log(`   - TaskID: ${createDto.taskId}`);
    console.log(`   - EvaluatorID: ${evaluatorId}`);
    console.log(`   - EvaluationID: ${newEvaluation.id}`);
    console.log(`   - Total evaluations on this task: ${totalEvaluations}`);
    console.log(`   - Unique evaluators: ${uniqueEvaluators}`);

    return newEvaluation;
  }

  /**
   * Update an existing task evaluation
   */
  async updateTaskEvaluation(
    evaluationId: string,
    evaluatorId: string,
    evaluatorRole: string,
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
    // Get the evaluation
    const evaluation = await this.prisma.taskEvaluation.findUnique({
      where: { id: evaluationId }
    });

    if (!evaluation) {
      throw new NotFoundException('Evaluation not found');
    }

    // Check if evaluator has permission to delete
    if (evaluation.evaluatorId !== evaluatorId && evaluatorRole !== 'SUPERADMIN') {
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