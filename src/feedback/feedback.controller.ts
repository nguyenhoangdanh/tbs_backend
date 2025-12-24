import {
  Controller,
  Get,
  Post,
  Delete,
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
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Request } from 'express';

@ApiTags('feedback')
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  // ========== PUBLIC ENDPOINT - SUBMIT FEEDBACK ==========

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Gửi góp ý (Public - không cần đăng nhập)',
    description: 'Người dùng ẩn danh có thể gửi góp ý mà không cần đăng nhập',
  })
  @ApiResponse({
    status: 201,
    description: 'Góp ý đã được gửi thành công',
  })
  @ApiResponse({
    status: 400,
    description: 'Dữ liệu không hợp lệ',
  })
  async createFeedback(@Body() dto: CreateFeedbackDto, @Req() req: Request) {
    const ipAddress = (req.headers['x-forwarded-for'] as string) || 
                     (req.headers['x-real-ip'] as string) || 
                     req.ip || 
                     req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    return this.feedbackService.createFeedback(dto, ipAddress, userAgent);
  }

  // ========== PROTECTED ENDPOINTS - REQUIRE PERMISSIONS ==========

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @RequirePermissions('feedback:view')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Lấy danh sách góp ý (Cần quyền)',
    description: 'Chỉ user có quyền feedback:view mới xem được',
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách góp ý',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'year', required: false, type: Number, example: 2024 })
  @ApiQuery({ name: 'month', required: false, type: Number, example: 12 })
  async getAllFeedback(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.feedbackService.getAllFeedback({
      page: parseInt(page),
      limit: parseInt(limit),
      startDate,
      endDate,
      year: year ? parseInt(year) : undefined,
      month: month ? parseInt(month) : undefined,
    });
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @RequirePermissions('feedback:view')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Lấy thống kê góp ý',
    description: 'Thống kê tổng số và theo tháng',
  })
  @ApiResponse({
    status: 200,
    description: 'Thống kê góp ý',
  })
  async getFeedbackStats() {
    return this.feedbackService.getFeedbackStats();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @RequirePermissions('feedback:view')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Lấy chi tiết góp ý theo ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Chi tiết góp ý',
  })
  async getFeedbackById(@Param('id') id: string) {
    return this.feedbackService.getFeedbackById(id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @RequirePermissions('feedback:delete')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Xóa góp ý (Cần quyền)',
    description: 'Chỉ user có quyền feedback:delete mới xóa được',
  })
  @ApiResponse({
    status: 200,
    description: 'Đã xóa góp ý thành công',
  })
  async deleteFeedback(@Param('id') id: string) {
    return this.feedbackService.deleteFeedback(id);
  }
}
