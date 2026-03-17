import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiParam, ApiQuery, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { TaskEvaluationsService } from './task-evaluations.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { GetUser } from '../common/decorators/get-user.decorator';

/** Derive primary role code from user.roles[] (JWT shape) */
function getPrimaryRole(user: any): string {
  const roles: any[] = user?.roles ?? [];
  if (roles.some((r) => r.roleDefinition?.code === 'SUPERADMIN')) return 'SUPERADMIN';
  if (roles.some((r) => r.roleDefinition?.code === 'ADMIN')) return 'ADMIN';
  return roles[0]?.roleDefinition?.code ?? 'USER';
}

@ApiTags('task-evaluations')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('task-evaluations')
export class TaskEvaluationsController {
  constructor(private readonly taskEvaluationsService: TaskEvaluationsService) {}

  @Post()
  @RequirePermissions('task-evaluations:create')
  @ApiOperation({ summary: 'Create a new task evaluation (comment only)' })
  @ApiResponse({ status: 201, description: 'Task evaluation created successfully' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'ID of the task to evaluate' },
        evaluatorComment: { type: 'string', description: 'Evaluator comment' }
      },
      required: ['taskId']
    }
  })
  @HttpCode(HttpStatus.CREATED)
  async createTaskEvaluation(
    @GetUser() user: any,
    @Body() createEvaluationDto: { taskId: string; evaluatorComment?: string }
  ) {
    return this.taskEvaluationsService.create(createEvaluationDto, user.id);
  }

  @Put(':evaluationId')
  @RequirePermissions('task-evaluations:update')
  @ApiOperation({ summary: 'Update a task evaluation comment' })
  @ApiResponse({ status: 200, description: 'Task evaluation updated successfully' })
  @ApiParam({ name: 'evaluationId', description: 'ID of the evaluation to update' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        evaluatorComment: { type: 'string', description: 'Updated comment' }
      }
    }
  })
  @HttpCode(HttpStatus.OK)
  async updateTaskEvaluation(
    @Param('evaluationId') evaluationId: string,
    @GetUser() user: any,
    @Body() updateEvaluationDto: { evaluatorComment?: string }
  ) {
    return this.taskEvaluationsService.updateTaskEvaluation(
      evaluationId,
      user.id,
      getPrimaryRole(user),
      updateEvaluationDto
    );
  }

  @Get('my-evaluations')
  @RequirePermissions('task-evaluations:view')
  @ApiOperation({ summary: 'Get evaluations created by the current user' })
  @ApiQuery({ name: 'weekNumber', required: false })
  @ApiQuery({ name: 'year', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @HttpCode(HttpStatus.OK)
  async getMyEvaluations(
    @GetUser() user: any,
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
    @Query('userId') userId?: string
  ) {
    const filters: any = {};
    if (weekNumber) {
      const n = parseInt(weekNumber, 10);
      if (!isNaN(n)) filters.weekNumber = n;
    }
    if (year) {
      const n = parseInt(year, 10);
      if (!isNaN(n)) filters.year = n;
    }
    if (userId) filters.userId = userId;

    return this.taskEvaluationsService.getEvaluationsByEvaluator(user.id, getPrimaryRole(user), filters);
  }

  @Get('evaluable-tasks')
  @RequirePermissions('task-evaluations:view')
  @ApiOperation({ summary: 'Get tasks that can be evaluated by the current manager' })
  @ApiQuery({ name: 'weekNumber', required: false })
  @ApiQuery({ name: 'year', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'isCompleted', required: false })
  @HttpCode(HttpStatus.OK)
  async getEvaluableTasksForManager(
    @GetUser() user: any,
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
    @Query('userId') userId?: string,
    @Query('isCompleted') isCompleted?: string
  ) {
    const filters: any = {};
    if (weekNumber) {
      const n = parseInt(weekNumber, 10);
      if (!isNaN(n)) filters.weekNumber = n;
    }
    if (year) {
      const n = parseInt(year, 10);
      if (!isNaN(n)) filters.year = n;
    }
    if (userId) filters.userId = userId;
    if (isCompleted !== undefined) filters.isCompleted = isCompleted === 'true';

    return this.taskEvaluationsService.getEvaluableTasksForManager(user.id, getPrimaryRole(user), filters);
  }

  @Get('task/:taskId')
  @RequirePermissions('task-evaluations:view')
  @ApiOperation({ summary: 'Get all evaluations for a specific task' })
  @ApiParam({ name: 'taskId', description: 'ID of the task' })
  @HttpCode(HttpStatus.OK)
  async getTaskEvaluations(@Param('taskId') taskId: string) {
    return this.taskEvaluationsService.getTaskEvaluations(taskId);
  }

  @Delete(':evaluationId')
  @RequirePermissions('task-evaluations:delete')
  @ApiOperation({ summary: 'Delete a task evaluation' })
  @ApiParam({ name: 'evaluationId', description: 'ID of the evaluation to delete' })
  @HttpCode(HttpStatus.OK)
  async deleteTaskEvaluation(
    @Param('evaluationId') evaluationId: string,
    @GetUser() user: any
  ) {
    return this.taskEvaluationsService.deleteTaskEvaluation(evaluationId, user.id, getPrimaryRole(user));
  }
}