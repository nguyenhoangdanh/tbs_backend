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
import { ApiOperation, ApiResponse, ApiTags, ApiParam, ApiQuery, ApiBody } from '@nestjs/swagger';
import { TaskEvaluationsService } from './task-evaluations.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { GetUser } from '../common/decorators/get-user.decorator';
import { EvaluationType } from '@prisma/client';

@ApiTags('task-evaluations')
@Controller('task-evaluations')
@UseGuards(JwtAuthGuard)
export class TaskEvaluationsController {
  constructor(private readonly taskEvaluationsService: TaskEvaluationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new task evaluation (managers only)' })
  @ApiResponse({ status: 201, description: 'Task evaluation created successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - User does not have management permissions' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'ID of the task to evaluate' },
        evaluatedIsCompleted: { type: 'boolean', description: 'Manager evaluation of task completion' },
        evaluatedReasonNotDone: { type: 'string', description: 'Manager evaluation of reason not done' },
        evaluatorComment: { type: 'string', description: 'Manager comment on the evaluation' },
        evaluationType: { 
          type: 'string', 
          enum: ['REVIEW', 'APPROVAL', 'REJECTION'],
          description: 'Type of evaluation' 
        }
      },
      required: ['taskId', 'evaluatedIsCompleted', 'evaluationType']
    }
  })
  @HttpCode(HttpStatus.CREATED)
  async createTaskEvaluation(
    @GetUser() user: any,
    @Body() createEvaluationDto: {
      taskId: string;
      evaluatedIsCompleted: boolean;
      evaluatedReasonNotDone?: string;
      evaluatorComment?: string;
      evaluationType: EvaluationType;
    }
  ) {
    return this.taskEvaluationsService.createTaskEvaluation(
      user.id,
      user.role,
      createEvaluationDto
    );
  }

  @Put(':evaluationId')
  @ApiOperation({ summary: 'Update a task evaluation' })
  @ApiResponse({ status: 200, description: 'Task evaluation updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Cannot update this evaluation' })
  @ApiResponse({ status: 404, description: 'Evaluation not found' })
  @ApiParam({ name: 'evaluationId', description: 'ID of the evaluation to update' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        evaluatedIsCompleted: { type: 'boolean', description: 'Manager evaluation of task completion' },
        evaluatedReasonNotDone: { type: 'string', description: 'Manager evaluation of reason not done' },
        evaluatorComment: { type: 'string', description: 'Manager comment on the evaluation' },
        evaluationType: { 
          type: 'string', 
          enum: ['REVIEW', 'APPROVAL', 'REJECTION'],
          description: 'Type of evaluation' 
        }
      }
    }
  })
  @HttpCode(HttpStatus.OK)
  async updateTaskEvaluation(
    @Param('evaluationId') evaluationId: string,
    @GetUser() user: any,
    @Body() updateEvaluationDto: {
      evaluatedIsCompleted?: boolean;
      evaluatedReasonNotDone?: string;
      evaluatorComment?: string;
      evaluationType?: EvaluationType;
    }
  ) {
    return this.taskEvaluationsService.updateTaskEvaluation(
      evaluationId,
      user.id,
      user.role,
      updateEvaluationDto
    );
  }

  

  @Get('my-evaluations')
  @ApiOperation({ summary: 'Get evaluations created by the current user' })
  @ApiResponse({ status: 200, description: 'Evaluations retrieved successfully' })
  @ApiQuery({ name: 'weekNumber', required: false, description: 'Filter by week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Filter by year' })
  @ApiQuery({ name: 'userId', required: false, description: 'Filter by user ID' })
  @ApiQuery({ name: 'evaluationType', required: false, description: 'Filter by evaluation type' })
  @HttpCode(HttpStatus.OK)
  async getMyEvaluations(
    @GetUser() user: any,
    @Query('weekNumber') weekNumber?: string,
    @Query('year') year?: string,
    @Query('userId') userId?: string,
    @Query('evaluationType') evaluationType?: string
  ) {
    const filters: any = {};

    if (weekNumber) {
      const parsedWeekNumber = parseInt(weekNumber, 10);
      if (!isNaN(parsedWeekNumber) && parsedWeekNumber >= 1 && parsedWeekNumber <= 53) {
        filters.weekNumber = parsedWeekNumber;
      }
    }

    if (year) {
      const parsedYear = parseInt(year, 10);
      if (!isNaN(parsedYear) && parsedYear >= 2020 && parsedYear <= 2030) {
        filters.year = parsedYear;
      }
    }

    if (userId) {
      filters.userId = userId;
    }

    if (evaluationType && Object.values(EvaluationType).includes(evaluationType as EvaluationType)) {
      filters.evaluationType = evaluationType as EvaluationType;
    }

    return this.taskEvaluationsService.getEvaluationsByEvaluator(user.id, user.role, filters);
  }

  @Get('evaluable-tasks')
  @ApiOperation({ summary: 'Get tasks that can be evaluated by the current manager' })
  @ApiResponse({ status: 200, description: 'Evaluable tasks retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - User does not have management permissions' })
  @ApiQuery({ name: 'weekNumber', required: false, description: 'Filter by week number' })
  @ApiQuery({ name: 'year', required: false, description: 'Filter by year' })
  @ApiQuery({ name: 'userId', required: false, description: 'Filter by user ID' })
  @ApiQuery({ name: 'isCompleted', required: false, description: 'Filter by completion status' })
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
      const parsedWeekNumber = parseInt(weekNumber, 10);
      if (!isNaN(parsedWeekNumber) && parsedWeekNumber >= 1 && parsedWeekNumber <= 53) {
        filters.weekNumber = parsedWeekNumber;
      }
    }

    if (year) {
      const parsedYear = parseInt(year, 10);
      if (!isNaN(parsedYear) && parsedYear >= 2020 && parsedYear <= 2030) {
        filters.year = parsedYear;
      }
    }

    if (userId) {
      filters.userId = userId;
    }

    if (isCompleted !== undefined) {
      filters.isCompleted = isCompleted === 'true';
    }

    return this.taskEvaluationsService.getEvaluableTasksForManager(user.id, user.role, filters);
  }

@Get('task/:taskId')
  @ApiOperation({ summary: 'Get all evaluations for a specific task' })
  @ApiResponse({ status: 200, description: 'Task evaluations retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @ApiParam({ name: 'taskId', description: 'ID of the task' })
  @HttpCode(HttpStatus.OK)
  async getTaskEvaluations(
    @Param('taskId') taskId: string
  ) {
    return this.taskEvaluationsService.getTaskEvaluations(taskId);
  }

  @Delete(':evaluationId')
  @ApiOperation({ summary: 'Delete a task evaluation' })
  @ApiResponse({ status: 200, description: 'Task evaluation deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Cannot delete this evaluation' })
  @ApiResponse({ status: 404, description: 'Evaluation not found' })
  @ApiParam({ name: 'evaluationId', description: 'ID of the evaluation to delete' })
  @HttpCode(HttpStatus.OK)
  async deleteTaskEvaluation(
    @Param('evaluationId') evaluationId: string,
    @GetUser() user: any
  ) {
    return this.taskEvaluationsService.deleteTaskEvaluation(evaluationId, user.id, user.role);
  }
}