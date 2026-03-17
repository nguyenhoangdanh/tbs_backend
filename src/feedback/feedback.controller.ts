import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { UpdateFeedbackStatusDto } from './dto/update-feedback-status.dto';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Request } from 'express';
import { FeedbackStatus } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('feedback')
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  // ========== PUBLIC - SUBMIT FEEDBACK ==========

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Gửi góp ý (Public - không cần đăng nhập)' })
  async createFeedback(@Body() dto: CreateFeedbackDto, @Req() req: Request) {
    const ipAddress =
      (req.headers['x-forwarded-for'] as string) ||
      (req.headers['x-real-ip'] as string) ||
      req.ip ||
      req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.feedbackService.createFeedback(dto, ipAddress, userAgent);
  }

  // ========== PROTECTED ==========

  @Get()
  @RequirePermissions('feedback:view')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Lấy danh sách góp ý' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'year', required: false, type: Number })
  @ApiQuery({ name: 'month', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: FeedbackStatus })
  async getAllFeedback(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('status') status?: FeedbackStatus,
  ) {
    return this.feedbackService.getAllFeedback({
      page: parseInt(page),
      limit: parseInt(limit),
      startDate,
      endDate,
      year: year ? parseInt(year) : undefined,
      month: month ? parseInt(month) : undefined,
      status,
    });
  }

  @Get('stats')
  @RequirePermissions('feedback:view')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Thống kê góp ý' })
  async getFeedbackStats() {
    return this.feedbackService.getFeedbackStats();
  }

  @Get(':id')
  @RequirePermissions('feedback:view')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Xem chi tiết góp ý (ghi lại người xem)' })
  async getFeedbackById(@Param('id') id: string, @Req() req: any) {
    const viewerId = req.user?.id;
    return this.feedbackService.getFeedbackById(id, viewerId);
  }

  @Patch(':id/status')
  @RequirePermissions('feedback:manage')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Cập nhật trạng thái góp ý' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateFeedbackStatusDto,
    @Req() req: any,
  ) {
    return this.feedbackService.updateStatus(id, dto, req.user.id);
  }

  @Delete(':id')
  @RequirePermissions('feedback:delete')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Xóa góp ý' })
  async deleteFeedback(@Param('id') id: string) {
    return this.feedbackService.deleteFeedback(id);
  }
}
