import {
  Injectable, BadRequestException, NotFoundException,
  ForbiddenException, Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/common/prisma.service';
import { WorkingDayService } from './working-day.service';
import { LeaveApprovalService } from './leave-approval.service';
import { LeaveBalanceService } from './leave-balance.service';
import { CreateLeaveRequestDto } from '../dto/leave-request/create-leave-request.dto';
import { UpdateLeaveRequestDto } from '../dto/leave-request/update-leave-request.dto';
import { CancelLeaveRequestDto, AddLeaveCommentDto } from '../dto/leave-request/approve-leave.dto';
import { LeaveRequestStatus, Prisma } from '@prisma/client';

@Injectable()
export class LeaveRequestService {
  private readonly logger = new Logger(LeaveRequestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workingDayService: WorkingDayService,
    private readonly approvalService: LeaveApprovalService,
    private readonly balanceService: LeaveBalanceService,
  ) {}

  // ── Tạo đơn xin phép ──────────────────────────────────────────

  async createRequest(userId: string, dto: CreateLeaveRequestDto) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, companyId: true, officeId: true, jobPositionId: true, jobPosition: { select: { departmentId: true } } },
    });

    const leaveType = await this.prisma.leaveType.findFirst({
      where: {
        id: dto.leaveTypeId,
        isActive: true,
        OR: [{ companyId: null }, { companyId: user.companyId }],
      },
    });
    if (!leaveType) throw new NotFoundException('Loại phép không tồn tại');

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (startDate > endDate) throw new BadRequestException('Ngày bắt đầu phải trước ngày kết thúc');

    // Kiểm tra trùng ngày với đơn nghỉ đang active (DRAFT hoặc PENDING hoặc APPROVED)
    const overlapping = await this.prisma.leaveRequest.findFirst({
      where: {
        userId,
        status: { in: ['DRAFT', 'PENDING', 'APPROVED'] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      select: { id: true, requestNumber: true, status: true, startDate: true, endDate: true },
    });
    if (overlapping) {
      throw new BadRequestException(
        `Trùng ngày với đơn ${overlapping.requestNumber} (${overlapping.status}) từ ` +
        `${overlapping.startDate.toISOString().split('T')[0]} đến ${overlapping.endDate.toISOString().split('T')[0]}`,
      );
    }

    // Tính tổng ngày làm việc
    const totalDays = await this.workingDayService.calculateWorkingDays(startDate, endDate, {
      startHalfDay: dto.startHalfDay,
      endHalfDay: dto.endHalfDay,
      companyId: user.companyId,
      countWorkingDaysOnly: leaveType.countWorkingDaysOnly,
    });
    if (totalDays <= 0) throw new BadRequestException('Không có ngày làm việc hợp lệ trong khoảng thời gian đã chọn');

    // Kiểm tra số ngày phép còn lại (chỉ với loại phép có số dư giới hạn)
    if (leaveType.isAccruable || leaveType.maxDaysPerYear) {
      const year = startDate.getFullYear();
      const balance = await this.balanceService.getOrCreateBalance(userId, dto.leaveTypeId, year, user.companyId);
      const available = this.balanceService.calcAvailable(balance);
      if (available < totalDays) {
        throw new BadRequestException(
          `Số ngày phép không đủ. Còn lại: ${available} ngày, yêu cầu: ${totalDays} ngày`,
        );
      }
    }

    // Tìm flow duyệt phù hợp
    const flow = await this.approvalService.findMatchingFlow(
      user.companyId,
      dto.leaveTypeId,
      user.officeId,
      user.jobPosition.departmentId,
    );

    // Tạo số đơn tự động
    const requestNumber = await this.generateRequestNumber(user.companyId);

    const status: LeaveRequestStatus = dto.submitImmediately !== false
      ? (leaveType.isAutoApproved ? 'APPROVED' : 'PENDING')
      : 'DRAFT';

    const request = await this.prisma.leaveRequest.create({
      data: {
        requestNumber,
        userId,
        companyId: user.companyId,
        leaveTypeId: dto.leaveTypeId,
        flowId: flow?.id ?? null,
        currentLevel: 1,
        startDate,
        endDate,
        startHalfDay: dto.startHalfDay ?? false,
        endHalfDay: dto.endHalfDay ?? false,
        totalDays,
        reason: dto.reason ?? null,
        attachmentUrl: dto.attachmentUrl ?? null,
        status,
        submittedAt: status !== 'DRAFT' ? new Date() : null,
        approvedAt: status === 'APPROVED' ? new Date() : null,
        notifyByEmail: dto.notifyByEmail ?? false,
      },
      include: this.requestInclude(),
    });

    // Cập nhật số dư pending nếu đã submit
    if (status === 'PENDING' && leaveType.isAccruable) {
      await this.balanceService.adjustPending(userId, dto.leaveTypeId, startDate.getFullYear(), user.companyId, totalDays);
    }

    return request;
  }

  // ── Cập nhật đơn (chỉ khi DRAFT) ──────────────────────────────

  async updateRequest(requestId: string, userId: string, dto: UpdateLeaveRequestDto) {
    const request = await this.findRequestForUser(requestId, userId);
    if (request.status !== 'DRAFT') {
      throw new BadRequestException('Chỉ có thể chỉnh sửa đơn ở trạng thái Nháp');
    }

    const updateData: Prisma.LeaveRequestUpdateInput = {};

    if (dto.startDate || dto.endDate) {
      const startDate = new Date(dto.startDate ?? request.startDate.toISOString().split('T')[0]);
      const endDate = new Date(dto.endDate ?? request.endDate.toISOString().split('T')[0]);
      const leaveType = await this.prisma.leaveType.findUniqueOrThrow({ where: { id: request.leaveTypeId } });

      const totalDays = await this.workingDayService.calculateWorkingDays(startDate, endDate, {
        startHalfDay: dto.startHalfDay ?? request.startHalfDay,
        endHalfDay: dto.endHalfDay ?? request.endHalfDay,
        companyId: request.companyId,
        countWorkingDaysOnly: leaveType.countWorkingDaysOnly,
      });

      updateData.startDate = startDate;
      updateData.endDate = endDate;
      updateData.totalDays = totalDays;
    }
    if (dto.startHalfDay !== undefined) updateData.startHalfDay = dto.startHalfDay;
    if (dto.endHalfDay !== undefined) updateData.endHalfDay = dto.endHalfDay;
    if (dto.reason !== undefined) updateData.reason = dto.reason;
    if (dto.attachmentUrl !== undefined) updateData.attachmentUrl = dto.attachmentUrl;
    if (dto.notifyByEmail !== undefined) updateData.notifyByEmail = dto.notifyByEmail;

    return this.prisma.leaveRequest.update({
      where: { id: requestId },
      data: updateData,
      include: this.requestInclude(),
    });
  }

  // ── Submit đơn nháp ────────────────────────────────────────────

  async submitRequest(requestId: string, userId: string) {
    const request = await this.findRequestForUser(requestId, userId);
    if (request.status !== 'DRAFT') {
      throw new BadRequestException('Đơn đã được gửi trước đó');
    }
    const leaveType = await this.prisma.leaveType.findUniqueOrThrow({ where: { id: request.leaveTypeId } });
    const newStatus: LeaveRequestStatus = leaveType.isAutoApproved ? 'APPROVED' : 'PENDING';

    const updated = await this.prisma.leaveRequest.update({
      where: { id: requestId },
      data: {
        status: newStatus,
        submittedAt: new Date(),
        approvedAt: newStatus === 'APPROVED' ? new Date() : null,
      },
      include: this.requestInclude(),
    });

    if (newStatus === 'PENDING' && leaveType.isAccruable) {
      await this.balanceService.adjustPending(
        userId, request.leaveTypeId,
        request.startDate.getFullYear(), request.companyId, Number(request.totalDays),
      );
    }

    return updated;
  }

  // ── Hủy đơn ───────────────────────────────────────────────────

  async cancelRequest(requestId: string, userId: string, dto: CancelLeaveRequestDto) {
    const request = await this.findRequestForUser(requestId, userId);
    if (!['DRAFT', 'PENDING'].includes(request.status)) {
      throw new BadRequestException('Không thể hủy đơn đã được xử lý');
    }

    const updated = await this.prisma.leaveRequest.update({
      where: { id: requestId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: dto.cancelReason ?? null,
      },
      include: this.requestInclude(),
    });

    // Hoàn lại số ngày pending
    const leaveType = await this.prisma.leaveType.findUniqueOrThrow({ where: { id: request.leaveTypeId } });
    if (request.status === 'PENDING' && leaveType.isAccruable) {
      await this.balanceService.adjustPending(
        userId, request.leaveTypeId,
        request.startDate.getFullYear(), request.companyId, -Number(request.totalDays),
      );
    }

    return updated;
  }

  // ── Thêm bình luận ─────────────────────────────────────────────

  async addComment(requestId: string, userId: string, dto: AddLeaveCommentDto) {
    // Kiểm tra quyền xem đơn
    await this.getRequestById(requestId, userId);

    return this.prisma.leaveRequestComment.create({
      data: {
        requestId,
        userId,
        content: dto.content,
        isInternal: dto.isInternal ?? false,
      },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  // ── Query ───────────────────────────────────────────────────────

  async getMyRequests(userId: string, companyId: string, filters: {
    status?: string; leaveTypeId?: string; year?: number; page?: number; limit?: number;
  }) {
    const { status, leaveTypeId, year, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;
    const where: Prisma.LeaveRequestWhereInput = { userId, companyId };
    if (status) where.status = status as LeaveRequestStatus;
    if (leaveTypeId) where.leaveTypeId = leaveTypeId;
    if (year) {
      where.startDate = {
        gte: new Date(Date.UTC(year, 0, 1)),
        lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59)),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: this.requestInclude(),
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getRequestById(requestId: string, viewerId: string) {
    const request = await this.prisma.leaveRequest.findUnique({
      where: { id: requestId },
      include: {
        ...this.requestInclude(),
        comments: {
          where: { isInternal: false },
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'asc' },
        },
        approvals: {
          include: { approver: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { level: 'asc' },
        },
      },
    });
    if (!request) throw new NotFoundException('Đơn xin phép không tồn tại');
    return request;
  }

  // ── Pending approvals queue ────────────────────────────────────

  async getPendingForApprover(approverId: string, companyId: string) {
    return this.approvalService.getPendingRequestsForApprover(approverId, companyId);
  }

  // ── Admin: xem tất cả đơn ─────────────────────────────────────

  async getAllRequests(companyId: string | null, filters: {
    status?: string; leaveTypeId?: string; year?: number;
    userId?: string; page?: number; limit?: number;
  }) {
    const { status, leaveTypeId, year, userId, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;
    const where: Prisma.LeaveRequestWhereInput = {};
    if (companyId) where.companyId = companyId;   // null = SUPERADMIN sees all companies
    if (status) where.status = status as LeaveRequestStatus;
    if (leaveTypeId) where.leaveTypeId = leaveTypeId;
    if (userId) where.userId = userId;
    if (year) {
      where.startDate = {
        gte: new Date(Date.UTC(year, 0, 1)),
        lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59)),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: this.requestInclude(),
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ── Helpers ────────────────────────────────────────────────────

  private async findRequestForUser(requestId: string, userId: string) {
    const request = await this.prisma.leaveRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Đơn xin phép không tồn tại');
    if (request.userId !== userId) throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
    return request;
  }

  private async generateRequestNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.leaveRequest.count({
      where: { companyId, submittedAt: { gte: new Date(`${year}-01-01`) } },
    });
    return `LR-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  private requestInclude() {
    return {
      leaveType: {
          select: {
            id: true,
            code: true,
            name: true,
            colorCode: true,
            category: { select: { code: true, name: true, leaveCategory: true } },
          },
        },
      user: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
      flow: {
        select: {
          id: true,
          name: true,
          levels: {
            where: { isActive: true },
            orderBy: { level: 'asc' as const },
            select: {
              id: true,
              level: true,
              approverMode: true,
              specificUser: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
              substitute1: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
              substitute2: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
              roleDefinition: { select: { id: true, code: true, name: true } },
              targetDepartment: { select: { id: true, name: true } },
            },
          },
        },
      },
    } as const;
  }
}
