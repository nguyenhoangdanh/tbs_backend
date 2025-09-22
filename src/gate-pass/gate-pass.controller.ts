import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { GatePassService } from './gate-pass.service';
import { CreateGatePassDto, CreateGatePassFlexibleDto } from './dto/create-gate-pass.dto';
import { UpdateGatePassDto } from './dto/update-gate-pass.dto';
import { ApproveGatePassDto, RejectGatePassDto, BulkApproveGatePassDto, BulkRejectGatePassDto, RequestCancellationDto, ApproveCancellationDto, RejectCancellationDto } from './dto/approve-gate-pass.dto';
import { GatePassFiltersDto } from './dto/gate-pass-filters.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@ApiTags('gate-passes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('gate-passes')
export class GatePassController {
  constructor(private readonly gatePassService: GatePassService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new gate pass' })
  @ApiResponse({ status: 201, description: 'Gate pass created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  create(@Request() req, @Body() createGatePassDto: CreateGatePassDto) {
    return this.gatePassService.create(req.user.id, createGatePassDto);
  }

  @Post('flexible')
  @ApiOperation({ 
    summary: 'Create gate pass with flexible time input (date + time)',
    description: 'Tạo giấy ra vào cổng với thời gian linh hoạt - chỉ cần nhập ngày và giờ riêng biệt'
  })
  @ApiResponse({ status: 201, description: 'Gate pass created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  createFlexible(@Request() req, @Body() createDto: CreateGatePassFlexibleDto) {
    return this.gatePassService.createFlexible(req.user.id, createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all gate passes' })
  @ApiResponse({ status: 200, description: 'Gate passes retrieved successfully' })
  findAll(
    @Request() req, 
    @Query(ValidationPipe) filters: GatePassFiltersDto
  ) {
    return this.gatePassService.findAll(req.user.id, req.user.role, filters);
  }

  @Get('my-gate-passes')
  @ApiOperation({ summary: 'Get current user\'s gate passes only' })
  @ApiResponse({ status: 200, description: 'My gate passes retrieved successfully' })
  findMyGatePasses(
    @Request() req, 
    @Query(ValidationPipe) filters: GatePassFiltersDto
  ) {
    return this.gatePassService.findMyGatePasses(req.user.id, filters);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get gate pass statistics' })
  @ApiResponse({ status: 200, description: 'Gate pass statistics retrieved successfully' })
  getStats(
    @Request() req,
    @Query(ValidationPipe) filters: Omit<GatePassFiltersDto, 'page' | 'limit'>
  ) {
    return this.gatePassService.getStats(req.user.id, req.user.role, filters);
  }

  @Get('pending-approvals')
  @ApiOperation({ summary: 'Get pending approvals for current user' })
  @ApiResponse({ status: 200, description: 'Pending approvals retrieved successfully' })
  getPendingApprovals(@Request() req) {
    return this.gatePassService.getPendingApprovals(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get gate pass by ID' })
  @ApiResponse({ status: 200, description: 'Gate pass retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Gate pass not found' })
  findOne(@Param('id') id: string, @Request() req) {
    return this.gatePassService.findOne(id, req.user.id, req.user.role);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update gate pass' })
  @ApiResponse({ status: 200, description: 'Gate pass updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Can only edit own pending gate passes' })
  @ApiResponse({ status: 404, description: 'Gate pass not found' })
  update(
    @Param('id') id: string,
    @Request() req,
    @Body() updateGatePassDto: UpdateGatePassDto,
  ) {
    return this.gatePassService.update(id, req.user.id, updateGatePassDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete gate pass' })
  @ApiResponse({ status: 200, description: 'Gate pass deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Gate pass not found' })
  remove(@Param('id') id: string, @Request() req) {
    return this.gatePassService.remove(id, req.user.id, req.user.role);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve gate pass' })
  @ApiResponse({ status: 200, description: 'Gate pass approved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Cannot approve this gate pass' })
  @ApiResponse({ status: 404, description: 'Approval request not found' })
  approve(
    @Param('id') id: string,
    @Request() req,
    @Body() approveDto: ApproveGatePassDto,
  ) {
    return this.gatePassService.approve(id, req.user.id, approveDto);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject gate pass' })
  @ApiResponse({ status: 200, description: 'Gate pass rejected successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Cannot reject this gate pass' })
  @ApiResponse({ status: 404, description: 'Approval request not found' })
  reject(
    @Param('id') id: string,
    @Request() req,
    @Body() rejectDto: RejectGatePassDto,
  ) {
    return this.gatePassService.reject(id, req.user.id, rejectDto);
  }

  @Get(':id/can-approve')
  @ApiOperation({ summary: 'Check if current user can approve gate pass' })
  @ApiResponse({ status: 200, description: 'Approval permission checked' })
  async canApprove(@Param('id') id: string, @Request() req) {
    const canApprove = await this.gatePassService.canUserApprove(id, req.user.id);
    return { canApprove };
  }

  @Get(':id/can-approve-details')
  @ApiOperation({ summary: 'Check approval permission with detailed error information' })
  @ApiResponse({ status: 200, description: 'Detailed approval permission checked' })
  async canApproveWithDetails(@Param('id') id: string, @Request() req) {
    const result = await this.gatePassService.canUserApproveWithDetails(id, req.user.id);
    return result;
  }

  @Get(':id/approval')
  @ApiOperation({ summary: 'Approval page redirect for email links' })
  @ApiResponse({ status: 302, description: 'Redirects to approval page' })
  async approvalRedirect(@Param('id') id: string, @Request() req) {
    // Check if user can approve this gate pass
    const canApprove = await this.gatePassService.canUserApprove(id, req.user.id);
    
    if (!canApprove) {
      return {
        redirect: `/gate-pass/${id}`,
        message: 'Bạn không có quyền duyệt giấy ra vào cổng này',
      };
    }

    return {
      redirect: `/gate-pass/${id}/approve`,
      gatePassId: id,
    };
  }

  @Post(':id/request-cancellation')
  @ApiOperation({ summary: 'Request cancellation of approved gate pass' })
  @ApiResponse({ status: 200, description: 'Cancellation request sent successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Can only request cancellation of own approved gate passes' })
  @ApiResponse({ status: 404, description: 'Gate pass not found' })
  async requestCancellation(
    @Param('id') id: string,
    @Request() req,
    @Body() requestCancellationDto: RequestCancellationDto,
  ) {
    return this.gatePassService.requestCancellation(id, req.user.id, requestCancellationDto);
  }

  @Post(':id/approve-cancellation')
  @ApiOperation({ summary: 'Approve cancellation request of gate pass' })
  @ApiResponse({ status: 200, description: 'Cancellation approved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Cannot approve this cancellation request' })
  @ApiResponse({ status: 404, description: 'Gate pass not found' })
  async approveCancellation(
    @Param('id') id: string,
    @Request() req,
    @Body() approveCancellationDto: ApproveCancellationDto,
  ) {
    return this.gatePassService.approveCancellation(id, req.user.id, approveCancellationDto);
  }

  @Post(':id/reject-cancellation')
  @ApiOperation({ summary: 'Reject cancellation request of gate pass' })
  @ApiResponse({ status: 200, description: 'Cancellation rejected successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Cannot reject this cancellation request' })
  @ApiResponse({ status: 404, description: 'Gate pass not found' })
  async rejectCancellation(
    @Param('id') id: string,
    @Request() req,
    @Body() rejectCancellationDto: RejectCancellationDto,
  ) {
    return this.gatePassService.rejectCancellation(id, req.user.id, rejectCancellationDto);
  }

  @Post('bulk-approve')
  @ApiOperation({ summary: 'Bulk approve multiple gate passes' })
  @ApiResponse({ status: 200, description: 'Gate passes approved successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async bulkApprove(
    @Request() req,
    @Body() bulkApproveDto: BulkApproveGatePassDto,
  ) {
    return this.gatePassService.bulkApprove(req.user.id, bulkApproveDto);
  }

  @Post('bulk-reject')
  @ApiOperation({ summary: 'Bulk reject multiple gate passes' })
  @ApiResponse({ status: 200, description: 'Gate passes rejected successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async bulkReject(
    @Request() req,
    @Body() bulkRejectDto: BulkRejectGatePassDto,
  ) {
    return this.gatePassService.bulkReject(req.user.id, bulkRejectDto);
  }

  @Post('bulk-approve-cancellation')
  @ApiOperation({ summary: 'Bulk approve cancellation requests' })
  @ApiResponse({ status: 200, description: 'Cancellation requests approved successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async bulkApproveCancellation(
    @Request() req,
    @Body() bulkApproveDto: BulkApproveGatePassDto,
  ) {
    return this.gatePassService.bulkApproveCancellation(req.user.id, bulkApproveDto);
  }

  @Post('bulk-reject-cancellation')
  @ApiOperation({ summary: 'Bulk reject cancellation requests' })
  @ApiResponse({ status: 200, description: 'Cancellation requests rejected successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async bulkRejectCancellation(
    @Request() req,
    @Body() bulkRejectDto: BulkRejectGatePassDto,
  ) {
    return this.gatePassService.bulkRejectCancellation(req.user.id, bulkRejectDto);
  }

  @Post('bulk-check-permissions')
  @ApiOperation({ summary: 'Check bulk approval permissions for debugging' })
  @ApiResponse({ status: 200, description: 'Permission check completed' })
  async bulkCheckPermissions(
    @Request() req,
    @Body() data: { gatePassIds: string[] },
  ) {
    const results = [];
    
    for (const gatePassId of data.gatePassIds) {
      try {
        const result = await this.gatePassService.canUserApproveWithDetails(gatePassId, req.user.id);
        results.push({
          id: gatePassId,
          ...result
        });
      } catch (error) {
        results.push({
          id: gatePassId,
          canApprove: false,
          reason: 'Error checking permission',
          error: error.message
        });
      }
    }
    
    const canApproveCount = results.filter(r => r.canApprove).length;
    const cannotApproveCount = results.filter(r => !r.canApprove).length;
    
    return {
      results,
      summary: {
        total: data.gatePassIds.length,
        canApprove: canApproveCount,
        cannotApprove: cannotApproveCount
      }
    };
  }
}