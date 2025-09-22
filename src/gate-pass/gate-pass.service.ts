import { 
  Injectable, 
  NotFoundException, 
  ForbiddenException, 
  BadRequestException 
} from '@nestjs/common';
import { NotificationService } from '../notifications/notification.service';
import { CreateGatePassDto, CreateGatePassFlexibleDto } from './dto/create-gate-pass.dto';
import { UpdateGatePassDto } from './dto/update-gate-pass.dto';
import { ApproveGatePassDto, RejectGatePassDto, BulkApproveGatePassDto, BulkRejectGatePassDto, RequestCancellationDto, ApproveCancellationDto, RejectCancellationDto } from './dto/approve-gate-pass.dto';
import { GatePassFiltersDto } from './dto/gate-pass-filters.dto';
import { 
  GatePassStatus, 
  GatePassApprovalStatus, 
  Role 
} from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class GatePassService {
  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
  ) {}



  // Auto-assign approvers based on organizational hierarchy
  private async getApproversForUser(userId: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        jobPosition: {
          include: {
            department: {
              include: {
                managers: {
                  include: {
                    user: true,
                  },
                },
              },
            },
            position: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const approvers: string[] = [];

    // Level 1: Department manager
    const departmentManager = user.jobPosition.department.managers
      .find(m => m.isActive)?.user;
    
    if (departmentManager && departmentManager.id !== userId) {
      approvers.push(departmentManager.id);
    }

    // Level 2: Higher level approver (find users with higher position level)
    const higherLevelApprovers = await this.prisma.user.findMany({
      where: {
        isActive: true,
        jobPosition: {
          position: {
            level: {
              lt: user.jobPosition.position.level, // Lower level number = higher position
            },
          },
          department: {
            officeId: user.officeId, // Same office
          },
        },
      },
      include: {
        jobPosition: {
          include: {
            position: true,
          },
        },
      },
      orderBy: {
        jobPosition: {
          position: {
            level: 'asc', // Get highest position first
          },
        },
      },
      take: 1, // Only get one higher level approver
    });

    if (higherLevelApprovers.length > 0 && 
        higherLevelApprovers[0].id !== userId &&
        !approvers.includes(higherLevelApprovers[0].id)) {
      approvers.push(higherLevelApprovers[0].id);
    }

    return approvers;
  }

  // Check for time overlap with existing approved gate passes
  private async checkTimeOverlap(userId: string, startDate: Date, endDate: Date, excludeGatePassId?: string): Promise<void> {
    // Check for overlapping approved or pending gate passes for the same user
    const whereClause: any = {
      userId,
      // Only check approved and pending gate passes (not rejected or cancelled)
      status: {
        in: ['PENDING', 'APPROVED']
      },
      // Check for time overlap
      OR: [
        // New pass starts during existing pass
        {
          AND: [
            { startDateTime: { lte: startDate } },
            { endDateTime: { gt: startDate } }
          ]
        },
        // New pass ends during existing pass
        {
          AND: [
            { startDateTime: { lt: endDate } },
            { endDateTime: { gte: endDate } }
          ]
        },
        // New pass completely contains existing pass
        {
          AND: [
            { startDateTime: { gte: startDate } },
            { endDateTime: { lte: endDate } }
          ]
        },
        // Existing pass completely contains new pass
        {
          AND: [
            { startDateTime: { lte: startDate } },
            { endDateTime: { gte: endDate } }
          ]
        }
      ]
    };

    // Exclude current gate pass when updating
    if (excludeGatePassId) {
      whereClause.id = { not: excludeGatePassId };
    }

    const overlappingGatePass = await this.prisma.gatePass.findFirst({
      where: whereClause,
      select: {
        id: true,
        passNumber: true,
        startDateTime: true,
        endDateTime: true,
        status: true
      }
    });

    if (overlappingGatePass) {
      const formatTime = (date: Date) => date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      const formatDate = (date: Date) => date.toLocaleDateString('vi-VN');
      
      throw new BadRequestException(
        `Khung giờ ${formatTime(startDate)} - ${formatTime(endDate)} (${formatDate(startDate)}) đã được tạo phiếu trước đó. ` +
        `Phiếu ${overlappingGatePass.passNumber} có thời gian ${formatTime(overlappingGatePass.startDateTime)} - ${formatTime(overlappingGatePass.endDateTime)} đang ở trạng thái ${overlappingGatePass.status}.`
      );
    }
  }

  async create(userId: string, createGatePassDto: CreateGatePassDto) {
    // Validate dates
    const startDate = new Date(createGatePassDto.startDateTime);
    const endDate = new Date(createGatePassDto.endDateTime);
    const now = new Date();

    if (startDate <= now) {
      throw new BadRequestException('Thời gian ra phải là thời gian trong tương lai');
    }

    if (endDate <= startDate) {
      throw new BadRequestException('Thời gian vào phải sau thời gian ra');
    }

    // Check for time overlap with existing approved gate passes
    await this.checkTimeOverlap(userId, startDate, endDate);

    // Get approvers for this user
    const approverIds = await this.getApproversForUser(userId);
    
    if (approverIds.length === 0) {
      throw new BadRequestException('Không tìm được người duyệt phù hợp');
    }

    // Create gate pass with approvals in transaction
    const gatePass = await this.prisma.$transaction(async (tx) => {
      // Generate pass number inside transaction to avoid race condition
      let passNumber: string;
      let attempts = 0;
      const maxAttempts = 5;
      
      while (attempts < maxAttempts) {
        try {
          const year = new Date().getFullYear();
          const month = String(new Date().getMonth() + 1).padStart(2, '0');
          
          // Get the highest existing pass number for current month within transaction
          const latestGatePass = await tx.gatePass.findFirst({
            where: {
              passNumber: {
                startsWith: `GP${year}${month}`,
              },
            },
            orderBy: {
              passNumber: 'desc',
            },
            select: {
              passNumber: true,
            },
          });

          let nextNumber = 1;
          if (latestGatePass) {
            const numberPart = latestGatePass.passNumber.slice(-4);
            nextNumber = parseInt(numberPart, 10) + 1;
          }

          passNumber = `GP${year}${month}${String(nextNumber).padStart(4, '0')}`;
          break;
        } catch (error) {
          attempts++;
          if (attempts >= maxAttempts) {
            // Fallback: use timestamp
            const timestamp = Date.now().toString().slice(-6);
            const year = new Date().getFullYear();
            const month = String(new Date().getMonth() + 1).padStart(2, '0');
            passNumber = `GP${year}${month}${timestamp}`;
            break;
          }
          // Wait a bit and retry
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      // Create the gate pass
      const gatePass = await tx.gatePass.create({
        data: {
          passNumber,
          userId,
          reasonType: createGatePassDto.reasonType,
          reasonDetail: createGatePassDto.reasonDetail,
          startDateTime: startDate,
          endDateTime: endDate,
        },
        include: {
          user: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              jobPosition: {
                include: {
                  department: true,
                  position: true,
                },
              },
            },
          },
        },
      });

      // Create approval records
      const approvalPromises = approverIds.map((approverId, index) =>
        tx.gatePassApproval.create({
          data: {
            gatePassId: gatePass.id,
            approverId,
            approvalLevel: index + 1,
          },
        })
      );

      await Promise.all(approvalPromises);

      // Fetch complete gate pass with approvals
      return await tx.gatePass.findUnique({
        where: { id: gatePass.id },
        include: {
          user: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              jobPosition: {
                include: {
                  department: true,
                  position: true,
                },
              },
            },
          },
          approvals: {
            include: {
              approver: {
                select: {
                  id: true,
                  employeeCode: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
            orderBy: {
              approvalLevel: 'asc',
            },
          },
        },
      });
    });

    // Send notification for gate pass creation AFTER transaction commits
    try {
      await this.notificationService.notifyGatePassCreated(gatePass.id);
    } catch (error) {
      // Log error but don't fail the operation since gate pass was created successfully
      console.error('Failed to send notification for gate pass:', gatePass.id, error.message);
    }

    return gatePass;
  }

  async createFlexible(userId: string, createDto: CreateGatePassFlexibleDto) {
    // Determine the date - use provided date or today
    const baseDate = createDto.date ? new Date(createDto.date) : new Date();
    
    // Create start and end datetime from date + time
    const [startHour, startMinute] = createDto.startTime.split(':').map(Number);
    const [endHour, endMinute] = createDto.endTime.split(':').map(Number);
    
    const startDate = new Date(baseDate);
    startDate.setHours(startHour, startMinute, 0, 0);
    
    const endDate = new Date(baseDate);
    endDate.setHours(endHour, endMinute, 0, 0);
    
    // Handle case where end time is next day (e.g., night shift)
    if (endDate <= startDate) {
      endDate.setDate(endDate.getDate() + 1);
    }
    
    // If it's full day, set times accordingly
    if (createDto.isFullDay) {
      startDate.setHours(8, 0, 0, 0); // 8:00 AM
      endDate.setHours(17, 30, 0, 0); // 5:30 PM
    }
    
    // Validate times
    const now = new Date();
    if (startDate <= now) {
      throw new BadRequestException('Thời gian ra phải là thời gian trong tương lai');
    }
    
    if (endDate <= startDate) {
      throw new BadRequestException('Thời gian vào phải sau thời gian ra');
    }
    
    // Convert to standard CreateGatePassDto format and use existing create method
    const standardDto: CreateGatePassDto = {
      reasonType: createDto.reasonType,
      reasonDetail: createDto.reasonDetail,
      startDateTime: startDate.toISOString(),
      endDateTime: endDate.toISOString(),
    };
    
    // Use existing create method which handles pass number generation atomically
    return this.create(userId, standardDto);
  }

  async findAll(userId: string, userRole: Role, filters: GatePassFiltersDto) {
    const { status, reasonType, startDate, endDate, page = 1, limit = 10 } = filters;
    
    // Build where clause based on user role
    let whereClause: any = {};
    
    if (userRole === Role.SUPERADMIN || userRole === Role.ADMIN) {
      // Admins can see all gate passes, optionally filtered by user
      if (filters.userId) {
        whereClause.userId = filters.userId;
      }
    } else {
      // Regular users can only see their own gate passes or ones they need to approve
      whereClause = {
        OR: [
          { userId }, // Own gate passes
          {
            approvals: {
              some: {
                approverId: userId,
              },
            },
          }, // Gate passes they need to approve
        ],
      };
    }

    // Add filters
    if (status) {
      whereClause.status = status;
    }
    
    if (reasonType) {
      whereClause.reasonType = reasonType;
    }

    if (startDate || endDate) {
      whereClause.startDateTime = {};
      if (startDate) {
        whereClause.startDateTime.gte = new Date(startDate);
      }
      if (endDate) {
        whereClause.startDateTime.lte = new Date(endDate);
      }
    }

    const skip = (page - 1) * limit;

    const [gatePasses, total] = await Promise.all([
      this.prisma.gatePass.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              jobPosition: {
                include: {
                  department: true,
                  position: true,
                },
              },
            },
          },
          approvals: {
            include: {
              approver: {
                select: {
                  id: true,
                  employeeCode: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
            orderBy: {
              approvalLevel: 'asc',
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.gatePass.count({ where: whereClause }),
    ]);

    return {
      data: gatePasses,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // New method to get only user's own gate passes
  async findMyGatePasses(userId: string, filters: GatePassFiltersDto) {
    const { status, reasonType, startDate, endDate, page = 1, limit = 10 } = filters;
    
    // Get user's office and department for filtering
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        jobPosition: {
          include: {
            department: {
              include: {
                office: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Build where clause - only show user's own gate passes
    const whereClause: any = {
      userId, // Only current user's gate passes
    };

    // Add filters
    if (status) {
      whereClause.status = status;
    }
    
    if (reasonType) {
      whereClause.reasonType = reasonType;
    }

    if (startDate || endDate) {
      whereClause.startDateTime = {};
      if (startDate) {
        whereClause.startDateTime.gte = new Date(startDate);
      }
      if (endDate) {
        whereClause.startDateTime.lte = new Date(endDate);
      }
    }

    const skip = (page - 1) * limit;

    const [gatePasses, total] = await Promise.all([
      this.prisma.gatePass.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              jobPosition: {
                include: {
                  department: true,
                  position: true,
                },
              },
            },
          },
          approvals: {
            include: {
              approver: {
                select: {
                  id: true,
                  employeeCode: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
            orderBy: {
              approvalLevel: 'asc',
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.gatePass.count({ where: whereClause }),
    ]);

    return {
      data: gatePasses,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      userInfo: {
        office: user.jobPosition.department.office.name,
        department: user.jobPosition.department.name,
      },
    };
  }

  async findOne(id: string, userId: string, userRole: Role) {
    const gatePass = await this.prisma.gatePass.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            jobPosition: {
              include: {
                department: true,
                position: true,
              },
            },
          },
        },
        approvals: {
          include: {
            approver: {
              select: {
                id: true,
                employeeCode: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: {
            approvalLevel: 'asc',
          },
        },
      },
    });

    if (!gatePass) {
      throw new NotFoundException('Gate pass not found');
    }

    // Check access permissions
    const canAccess = 
      userRole === Role.SUPERADMIN || 
      userRole === Role.ADMIN ||
      gatePass.userId === userId ||
      gatePass.approvals.some(approval => approval.approverId === userId);

    if (!canAccess) {
      throw new ForbiddenException('Access denied');
    }

    return gatePass;
  }

  async update(id: string, userId: string, updateGatePassDto: UpdateGatePassDto, userRole?: Role) {
    const gatePass = await this.prisma.gatePass.findUnique({
      where: { id },
    });

    if (!gatePass) {
      throw new NotFoundException('Gate pass not found');
    }

    // Only the owner can edit their gate pass details
    // Managers/Admins can only approve/reject, not edit the details
    if (gatePass.userId !== userId) {
      throw new ForbiddenException('You can only edit your own gate passes');
    }

    if (gatePass.status !== GatePassStatus.PENDING) {
      throw new ForbiddenException('Only pending gate passes can be edited');
    }

    // Validate dates if provided
    if (updateGatePassDto.startDateTime || updateGatePassDto.endDateTime) {
      const startDate = updateGatePassDto.startDateTime 
        ? new Date(updateGatePassDto.startDateTime)
        : gatePass.startDateTime;
      const endDate = updateGatePassDto.endDateTime 
        ? new Date(updateGatePassDto.endDateTime)
        : gatePass.endDateTime;
      const now = new Date();

      if (startDate <= now) {
        throw new BadRequestException('Start date must be in the future');
      }

      if (endDate <= startDate) {
        throw new BadRequestException('End date must be after start date');
      }

      // Check for time overlap with other gate passes (excluding current one)
      await this.checkTimeOverlap(userId, startDate, endDate, id);
    }

    const updatedGatePass = await this.prisma.gatePass.update({
      where: { id },
      data: {
        ...updateGatePassDto,
        startDateTime: updateGatePassDto.startDateTime 
          ? new Date(updateGatePassDto.startDateTime)
          : undefined,
        endDateTime: updateGatePassDto.endDateTime 
          ? new Date(updateGatePassDto.endDateTime)
          : undefined,
      },
      include: {
        user: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
        approvals: {
          include: {
            approver: {
              select: {
                id: true,
                employeeCode: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: {
            approvalLevel: 'asc',
          },
        },
      },
    });

    // Send real-time notification to approvers about the update
    try {
      const approverIds = updatedGatePass.approvals.map(approval => approval.approverId);
      if (approverIds.length > 0) {
        await this.notificationService.notifyGatePassUpdated(id, updatedGatePass, approverIds);
      }
    } catch (error) {
      console.error('Failed to send update notifications for gate pass:', id, error.message);
    }

    return updatedGatePass;
  }

  async remove(id: string, userId: string, userRole: Role) {
    const gatePass = await this.prisma.gatePass.findUnique({
      where: { id },
      include: {
        approvals: {
          select: {
            approverId: true,
          },
        },
      },
    });

    if (!gatePass) {
      throw new NotFoundException('Gate pass not found');
    }

    const canDelete = 
      userRole === Role.SUPERADMIN || 
      userRole === Role.ADMIN ||
      (gatePass.userId === userId && gatePass.status === GatePassStatus.PENDING);

    if (!canDelete) {
      throw new ForbiddenException('Access denied or gate pass cannot be deleted');
    }

    // Store approver IDs before deletion for notification
    const approverIds = gatePass.approvals.map(approval => approval.approverId);

    await this.prisma.gatePass.delete({
      where: { id },
    });

    // Notify approvers that the gate pass has been deleted
    try {
      if (approverIds.length > 0) {
        await this.notificationService.notifyGatePassDeleted(id, approverIds, gatePass);
      }
    } catch (error) {
      console.error('Failed to send deletion notification for gate pass:', id, error.message);
    }

    return { message: 'Gate pass deleted successfully' };
  }

  async approve(gatePassId: string, approverId: string, approveDto: ApproveGatePassDto) {
    const result = await this.prisma.$transaction(async (tx) => {
      // First check if the gate pass still exists
      const gatePassExists = await tx.gatePass.findUnique({
        where: { id: gatePassId },
        select: { id: true, status: true }
      });

      if (!gatePassExists) {
        throw new NotFoundException('Giấy ra vào cổng không tồn tại hoặc đã bị xóa');
      }

      // Find the approval record for this approver
      const approval = await tx.gatePassApproval.findFirst({
        where: {
          gatePassId,
          approverId,
          status: GatePassApprovalStatus.PENDING,
        },
        include: {
          gatePass: true,
        },
      });

      if (!approval) {
        throw new NotFoundException('Yêu cầu duyệt không tồn tại hoặc đã được xử lý');
      }

      if (approval.gatePass.status !== GatePassStatus.PENDING) {
        throw new ForbiddenException('Giấy ra vào cổng không ở trạng thái chờ duyệt');
      }

      // Check if this is sequential approval (level 2 can only approve after level 1)
      if (approval.approvalLevel > 1) {
        const previousApprovals = await tx.gatePassApproval.findMany({
          where: {
            gatePassId,
            approvalLevel: {
              lt: approval.approvalLevel,
            },
          },
        });

        const allPreviousApproved = previousApprovals.every(
          prev => prev.status === GatePassApprovalStatus.APPROVED
        );

        if (!allPreviousApproved) {
          throw new ForbiddenException('Cần hoàn thành duyệt cấp trước đó trước khi duyệt cấp này');
        }
      }

      // Update this approval
      await tx.gatePassApproval.update({
        where: { id: approval.id },
        data: {
          status: GatePassApprovalStatus.APPROVED,
          approvedAt: new Date(),
          comment: approveDto.comment,
        },
      });

      // Check if all approvals are completed
      const allApprovals = await tx.gatePassApproval.findMany({
        where: { gatePassId },
      });

      const allApproved = allApprovals.every(
        app => app.status === GatePassApprovalStatus.APPROVED
      );

      // Update gate pass status if all approvals are completed
      if (allApproved) {
        await tx.gatePass.update({
          where: { id: gatePassId },
          data: { status: GatePassStatus.APPROVED },
        });
      }

      // Return updated gate pass
      return await tx.gatePass.findUnique({
        where: { id: gatePassId },
        include: {
          user: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
            },
          },
          approvals: {
            include: {
              approver: {
                select: {
                  id: true,
                  employeeCode: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
            orderBy: {
              approvalLevel: 'asc',
            },
          },
        },
      });
    });

    // Send notifications AFTER transaction commits
    try {
      // Check if all approvals are completed
      const allApprovals = await this.prisma.gatePassApproval.findMany({
        where: { gatePassId },
      });

      const allApproved = allApprovals.every(
        app => app.status === GatePassApprovalStatus.APPROVED
      );

      if (allApproved) {
        // Send approval notification
        await this.notificationService.notifyGatePassApproved(gatePassId);
      } else {
        // Notify next approval level if there are more approvals needed
        await this.notificationService.notifyNextApprovalLevel(gatePassId);
      }
    } catch (error) {
      console.error('Failed to send notifications for gate pass:', gatePassId, error.message);
    }

    return result;
  }

  async reject(gatePassId: string, approverId: string, rejectDto: RejectGatePassDto) {
    const result = await this.prisma.$transaction(async (tx) => {
      // First check if the gate pass still exists
      const gatePassExists = await tx.gatePass.findUnique({
        where: { id: gatePassId },
        select: { id: true, status: true }
      });

      if (!gatePassExists) {
        throw new NotFoundException('Giấy ra vào cổng không tồn tại hoặc đã bị xóa');
      }

      // Find the approval record for this approver
      const approval = await tx.gatePassApproval.findFirst({
        where: {
          gatePassId,
          approverId,
          status: GatePassApprovalStatus.PENDING,
        },
        include: {
          gatePass: true,
        },
      });

      if (!approval) {
        throw new NotFoundException('Yêu cầu duyệt không tồn tại hoặc đã được xử lý');
      }

      if (approval.gatePass.status !== GatePassStatus.PENDING) {
        throw new ForbiddenException('Giấy ra vào cổng không ở trạng thái chờ duyệt');
      }

      // Update this approval as rejected
      await tx.gatePassApproval.update({
        where: { id: approval.id },
        data: {
          status: GatePassApprovalStatus.REJECTED,
          rejectedAt: new Date(),
          comment: rejectDto.comment,
        },
      });

      // Update gate pass status to rejected
      await tx.gatePass.update({
        where: { id: gatePassId },
        data: { status: GatePassStatus.REJECTED },
      });

      // Return updated gate pass
      return await tx.gatePass.findUnique({
        where: { id: gatePassId },
        include: {
          user: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
            },
          },
          approvals: {
            include: {
              approver: {
                select: {
                  id: true,
                  employeeCode: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
            orderBy: {
              approvalLevel: 'asc',
            },
          },
        },
      });
    });

    // Send rejection notification AFTER transaction commits
    try {
      await this.notificationService.notifyGatePassRejected(gatePassId, rejectDto.comment);
    } catch (error) {
      console.error('Failed to send rejection notification for gate pass:', gatePassId, error.message);
    }

    return result;
  }

  // Request cancellation for approved gate pass
  async requestCancellation(gatePassId: string, userId: string, requestDto: RequestCancellationDto) {
    const gatePass = await this.prisma.gatePass.findUnique({
      where: { id: gatePassId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          }
        },
        approvals: {
          include: {
            approver: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              }
            }
          },
          where: {
            status: 'APPROVED'
          }
        }
      }
    });

    if (!gatePass) {
      throw new NotFoundException('Giấy ra vào cổng không tồn tại');
    }

    // Only the owner can request cancellation
    if (gatePass.userId !== userId) {
      throw new ForbiddenException('Bạn chỉ có thể yêu cầu hủy giấy ra vào cổng của chính mình');
    }

    // Can only request cancellation for approved gate passes
    if (gatePass.status !== 'APPROVED') {
      throw new BadRequestException('Chỉ có thể yêu cầu hủy giấy ra vào cổng đã được phê duyệt');
    }

    // Check if gate pass has already started (past start time)
    const now = new Date();
    if (gatePass.startDateTime <= now) {
      throw new BadRequestException('Không thể yêu cầu hủy giấy ra vào cổng đã bắt đầu');
    }

    // Create cancellation request record
    const cancellationRequest = await this.prisma.$transaction(async (tx) => {
      // Update gate pass status to indicate cancellation is requested
      const updatedGatePass = await tx.gatePass.update({
        where: { id: gatePassId },
        data: {
          status: 'CANCELLATION_REQUESTED',
          // Store cancellation reason in a comment field or create separate table
          reasonDetail: `${gatePass.reasonDetail}\n\n[YÊU CẦU HỦY] ${requestDto.reason}`
        }
      });

      return updatedGatePass;
    });

    // Send notification to all approvers about cancellation request
    try {
      for (const approval of gatePass.approvals) {
        await this.notificationService.notifyGatePassCancellationRequested(
          gatePassId,
          gatePass.user,
          approval.approver,
          requestDto.reason
        );
      }
    } catch (error) {
      console.error('Failed to send cancellation request notifications for gate pass:', gatePassId, error.message);
    }

    return {
      message: 'Yêu cầu hủy giấy ra vào cổng đã được gửi đến người quản lý',
      gatePass: cancellationRequest
    };
  }

  async getPendingApprovals(approverId: string) {
    // Get regular pending approval records
    const pendingApprovals = await this.prisma.gatePassApproval.findMany({
      where: {
        approverId,
        status: GatePassApprovalStatus.PENDING,
      },
      include: {
        gatePass: {
          include: {
            user: {
              select: {
                id: true,
                employeeCode: true,
                firstName: true,
                lastName: true,
                jobPosition: {
                  include: {
                    department: true,
                    position: true,
                  },
                },
              },
            },
            approvals: {
              include: {
                approver: {
                  select: {
                    id: true,
                    employeeCode: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
              orderBy: {
                approvalLevel: 'asc',
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Get cancellation requests where this user was one of the approvers
    const cancellationRequests = await this.prisma.gatePass.findMany({
      where: {
        status: 'CANCELLATION_REQUESTED',
        approvals: {
          some: {
            approverId,
            status: 'APPROVED' // User must have approved this gate pass originally
          }
        }
      },
      include: {
        user: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            jobPosition: {
              include: {
                department: true,
                position: true,
              },
            },
          },
        },
        approvals: {
          include: {
            approver: {
              select: {
                id: true,
                employeeCode: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: {
            approvalLevel: 'asc',
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    // Convert cancellation requests to the same format as pending approvals
    const cancellationApprovals = cancellationRequests.map(gatePass => {
      // Find the user's approval record for this gate pass
      const userApproval = gatePass.approvals.find(approval => 
        approval.approverId === approverId && approval.status === 'APPROVED'
      );
      
      return {
        id: `cancellation-${gatePass.id}`, // Use unique ID to distinguish from regular approvals
        gatePassId: gatePass.id,
        approverId,
        approvalLevel: userApproval?.approvalLevel || 1,
        status: 'PENDING' as any, // Mark as pending for UI compatibility
        createdAt: gatePass.updatedAt, // Use gate pass updated time
        updatedAt: gatePass.updatedAt,
        gatePass: {
          ...gatePass,
          // Add a flag to identify cancellation requests
          isCancellationRequest: true
        },
        isCancellationRequest: true // Add flag at approval level too
      };
    });

    // Combine both types of approvals
    return [...pendingApprovals, ...cancellationApprovals].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getStats(userId: string, userRole: Role, filters?: any) {
    // Build where clause based on user role
    let whereClause: any = {};
    
    if (userRole === Role.SUPERADMIN || userRole === Role.ADMIN) {
      // Admins can see all gate passes
    } else {
      // Regular users can only see their own gate passes or ones they need to approve
      whereClause = {
        OR: [
          { userId }, // Own gate passes
          {
            approvals: {
              some: {
                approverId: userId,
              },
            },
          }, // Gate passes they need to approve
        ],
      };
    }

    // Add date filters if provided
    if (filters?.startDate || filters?.endDate) {
      whereClause.createdAt = {};
      if (filters.startDate) {
        whereClause.createdAt.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        // Set end date to end of day
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        whereClause.createdAt.lte = endDate;
      }
    }

    // Get basic counts
    const [total, pending, approved, rejected] = await Promise.all([
      this.prisma.gatePass.count({ where: whereClause }),
      this.prisma.gatePass.count({ 
        where: { ...whereClause, status: GatePassStatus.PENDING }
      }),
      this.prisma.gatePass.count({ 
        where: { ...whereClause, status: GatePassStatus.APPROVED }
      }),
      this.prisma.gatePass.count({ 
        where: { ...whereClause, status: GatePassStatus.REJECTED }
      }),
    ]);

    // Get today's statistics
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const todayWhereClause = {
      ...whereClause,
      createdAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    };

    const [todayTotal, todayPending, todayApproved, todayRejected] = await Promise.all([
      this.prisma.gatePass.count({ where: todayWhereClause }),
      this.prisma.gatePass.count({ 
        where: { ...todayWhereClause, status: GatePassStatus.PENDING }
      }),
      this.prisma.gatePass.count({ 
        where: { ...todayWhereClause, status: GatePassStatus.APPROVED }
      }),
      this.prisma.gatePass.count({ 
        where: { ...todayWhereClause, status: GatePassStatus.REJECTED }
      }),
    ]);

    // Get reason type statistics
    const reasonTypeStats = await this.prisma.gatePass.groupBy({
      by: ['reasonType'],
      where: whereClause,
      _count: true,
      orderBy: {
        _count: {
          reasonType: 'desc',
        },
      },
    });

    // Get hourly statistics for today (for chart)
    const hourlyStats = [];
    for (let hour = 0; hour < 24; hour++) {
      const hourStart = new Date(today);
      hourStart.setHours(hour, 0, 0, 0);
      const hourEnd = new Date(today);
      hourEnd.setHours(hour, 59, 59, 999);
      
      const count = await this.prisma.gatePass.count({
        where: {
          ...whereClause,
          createdAt: {
            gte: hourStart,
            lte: hourEnd,
          },
        },
      });

      hourlyStats.push({
        hour: hour.toString().padStart(2, '0') + ':00',
        count,
      });
    }

    return {
      total,
      pending,
      approved,
      rejected,
      today: {
        total: todayTotal,
        pending: todayPending,
        approved: todayApproved,
        rejected: todayRejected,
      },
      reasonTypeStats: reasonTypeStats.map(stat => ({
        reasonType: stat.reasonType,
        count: stat._count,
      })),
      hourlyStats,
    };
  }

  // Helper method to check if user can approve a gate pass
  async canUserApprove(gatePassId: string, userId: string): Promise<boolean> {
    const approval = await this.prisma.gatePassApproval.findFirst({
      where: {
        gatePassId,
        approverId: userId,
        status: GatePassApprovalStatus.PENDING,
      },
      include: {
        gatePass: true,
      },
    });

    if (!approval) {
      return false;
    }

    if (approval.gatePass.status !== GatePassStatus.PENDING) {
      return false;
    }

    // For level 2+ approvals, check if previous levels are approved
    if (approval.approvalLevel > 1) {
      const previousApprovals = await this.prisma.gatePassApproval.findMany({
        where: {
          gatePassId,
          approvalLevel: {
            lt: approval.approvalLevel,
          },
        },
      });

      return previousApprovals.every(
        prev => prev.status === GatePassApprovalStatus.APPROVED
      );
    }

    return true;
  }

  // Enhanced method with detailed error information for debugging
  async canUserApproveWithDetails(gatePassId: string, userId: string): Promise<{ 
    canApprove: boolean; 
    reason?: string; 
    details?: any 
  }> {
    // Check if gate pass exists
    const gatePass = await this.prisma.gatePass.findUnique({
      where: { id: gatePassId },
      select: { id: true, status: true, passNumber: true }
    });

    if (!gatePass) {
      return { 
        canApprove: false, 
        reason: 'Giấy ra vào cổng không tồn tại',
        details: { gatePassId }
      };
    }

    console.log('gatePass found---------:', gatePass);

    if (gatePass.status !== GatePassStatus.PENDING) {
      return { 
        canApprove: false, 
        reason: 'Giấy ra vào cổng không ở trạng thái chờ duyệt',
        details: { status: gatePass.status, passNumber: gatePass.passNumber }
      };
    }

    // Check for approval record
    const approval = await this.prisma.gatePassApproval.findFirst({
      where: {
        gatePassId,
        approverId: userId,
      },
      include: {
        gatePass: true,
        approver: {
          select: { firstName: true, lastName: true, employeeCode: true }
        }
      },
    });

    if (!approval) {
      return { 
        canApprove: false, 
        reason: 'Bạn không được chỉ định làm người duyệt cho giấy này',
        details: { gatePassId, userId, passNumber: gatePass.passNumber }
      };
    }

    if (approval.status !== GatePassApprovalStatus.PENDING) {
      return { 
        canApprove: false, 
        reason: 'Yêu cầu duyệt đã được xử lý',
        details: { 
          status: approval.status, 
          approvedAt: approval.approvedAt,
          rejectedAt: approval.rejectedAt,
          passNumber: gatePass.passNumber
        }
      };
    }

    // For level 2+ approvals, check if previous levels are approved
    if (approval.approvalLevel > 1) {
      const previousApprovals = await this.prisma.gatePassApproval.findMany({
        where: {
          gatePassId,
          approvalLevel: {
            lt: approval.approvalLevel,
          },
        },
        include: {
          approver: {
            select: { firstName: true, lastName: true, employeeCode: true }
          }
        }
      });

      const unapprovedPrevious = previousApprovals.filter(
        prev => prev.status !== GatePassApprovalStatus.APPROVED
      );

      if (unapprovedPrevious.length > 0) {
        return { 
          canApprove: false, 
          reason: 'Cần hoàn thành duyệt các cấp trước đó',
          details: { 
            currentLevel: approval.approvalLevel,
            unapprovedPrevious: unapprovedPrevious.map(prev => ({
              level: prev.approvalLevel,
              status: prev.status,
              approver: prev.approver
            })),
            passNumber: gatePass.passNumber
          }
        };
      }
    }

    return { canApprove: true };
  }

  // Helper method to check if user can approve/reject cancellation
  async canUserApproveCancellation(gatePassId: string, userId: string): Promise<{
    canApprove: boolean;
    reason?: string;
    details?: any;
  }> {
    const gatePass = await this.prisma.gatePass.findUnique({
      where: { id: gatePassId },
      include: {
        approvals: {
          where: {
            approverId: userId,
            status: 'APPROVED'
          }
        }
      }
    });

    if (!gatePass) {
      return {
        canApprove: false,
        reason: 'Giấy ra vào cổng không tồn tại',
        details: { gatePassId }
      };
    }

    if (gatePass.status !== 'CANCELLATION_REQUESTED') {
      return {
        canApprove: false,
        reason: 'Giấy ra vào cổng không có yêu cầu hủy',
        details: { status: gatePass.status, passNumber: gatePass.passNumber }
      };
    }

    // Check if user was one of the original approvers
    if (gatePass.approvals.length === 0) {
      return {
        canApprove: false,
        reason: 'Bạn không có quyền xử lý yêu cầu hủy giấy ra vào cổng này',
        details: { gatePassId, userId, passNumber: gatePass.passNumber }
      };
    }

    return { canApprove: true };
  }

  // Bulk approve multiple gate passes
  async bulkApprove(approverId: string, bulkApproveDto: BulkApproveGatePassDto) {
    const { gatePassIds, comment } = bulkApproveDto;
    
    // Add debug logging
    console.log('🔄 Bulk approve request:', {
      approverId,
      gatePassIds: gatePassIds,
      gatePassCount: gatePassIds.length,
      comment: comment?.substring(0, 50) + (comment?.length > 50 ? '...' : '')
    });
    
    const results: Array<{ id: string; success: boolean; error?: string; gatePass?: any }> = [];

    for (const gatePassId of gatePassIds) {
      try {
        // Add more detailed logging
        console.log(`📋 Processing gate pass ${gatePassId} for approver ${approverId}`);
        
        // Check if user can approve this gate pass with detailed error info
        const approvalCheck = await this.canUserApproveWithDetails(gatePassId, approverId);
        
        console.log(`🔍 Approval check for ${gatePassId}:`, approvalCheck);
        
        if (!approvalCheck.canApprove) {
          console.log(`❌ Cannot approve ${gatePassId}: ${approvalCheck.reason}`);
          results.push({
            id: gatePassId,
            success: false,
            error: approvalCheck.reason || 'Không có quyền duyệt hoặc giấy đã được xử lý'
          });
          continue;
        }

        // Approve the gate pass
        console.log(`✅ Approving gate pass ${gatePassId}`);
        const approvedGatePass = await this.approve(gatePassId, approverId, { comment });
        results.push({
          id: gatePassId,
          success: true,
          gatePass: approvedGatePass
        });
        console.log(`✅ Successfully approved gate pass ${gatePassId}`);
      } catch (error) {
        console.error(`❌ Error approving gate pass ${gatePassId}:`, error);
        results.push({
          id: gatePassId,
          success: false,
          error: error.message || 'Có lỗi xảy ra khi duyệt'
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    console.log('📊 Bulk approve results:', {
      total: gatePassIds.length,
      success: successCount,
      failure: failureCount,
      failedItems: results.filter(r => !r.success).map(r => ({ id: r.id, error: r.error }))
    });

    return {
      message: `Đã duyệt ${successCount} giấy thành công${failureCount > 0 ? `, ${failureCount} giấy thất bại` : ''}`,
      results,
      summary: {
        total: gatePassIds.length,
        success: successCount,
        failure: failureCount
      }
    };
  }

  // Bulk reject multiple gate passes
  async bulkReject(approverId: string, bulkRejectDto: BulkRejectGatePassDto) {
    const { gatePassIds, comment } = bulkRejectDto;
    const results: Array<{ id: string; success: boolean; error?: string; gatePass?: any }> = [];

    for (const gatePassId of gatePassIds) {
      try {
        // Check if user can reject this gate pass with detailed error info
        const approvalCheck = await this.canUserApproveWithDetails(gatePassId, approverId);
        
        if (!approvalCheck.canApprove) {
          results.push({
            id: gatePassId,
            success: false,
            error: approvalCheck.reason || 'Không có quyền từ chối hoặc giấy đã được xử lý'
          });
          continue;
        }

        // Reject the gate pass
        const rejectedGatePass = await this.reject(gatePassId, approverId, { comment });
        results.push({
          id: gatePassId,
          success: true,
          gatePass: rejectedGatePass
        });
      } catch (error) {
        results.push({
          id: gatePassId,
          success: false,
          error: error.message || 'Có lỗi xảy ra khi từ chối'
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    return {
      message: `Đã từ chối ${successCount} giấy thành công${failureCount > 0 ? `, ${failureCount} giấy thất bại` : ''}`,
      results,
      summary: {
        total: gatePassIds.length,
        success: successCount,
        failure: failureCount
      }
    };
  }

  // Bulk approve cancellation requests
  async bulkApproveCancellation(approverId: string, bulkApproveDto: BulkApproveGatePassDto) {
    const { gatePassIds, comment } = bulkApproveDto;
    
    console.log('🔄 Bulk approve cancellation request:', {
      approverId,
      gatePassIds,
      gatePassCount: gatePassIds.length,
      comment: comment?.substring(0, 50) + (comment?.length > 50 ? '...' : '')
    });
    
    const results: Array<{ id: string; success: boolean; error?: string; gatePass?: any }> = [];

    for (const gatePassId of gatePassIds) {
      try {
        console.log(`📋 Processing cancellation for gate pass ${gatePassId}`);
        
        const approvalCheck = await this.canUserApproveCancellation(gatePassId, approverId);
        
        if (!approvalCheck.canApprove) {
          console.log(`❌ Cannot approve cancellation ${gatePassId}: ${approvalCheck.reason}`);
          results.push({
            id: gatePassId,
            success: false,
            error: approvalCheck.reason || 'Không có quyền duyệt yêu cầu hủy'
          });
          continue;
        }

        const approvedCancellation = await this.approveCancellation(gatePassId, approverId, { comment });
        results.push({
          id: gatePassId,
          success: true,
          gatePass: approvedCancellation.gatePass
        });
        console.log(`✅ Successfully approved cancellation for gate pass ${gatePassId}`);
      } catch (error) {
        console.error(`❌ Error approving cancellation for gate pass ${gatePassId}:`, error);
        results.push({
          id: gatePassId,
          success: false,
          error: error.message || 'Có lỗi xảy ra khi duyệt yêu cầu hủy'
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    console.log('📊 Bulk approve cancellation results:', {
      total: gatePassIds.length,
      success: successCount,
      failure: failureCount,
      failedItems: results.filter(r => !r.success).map(r => ({ id: r.id, error: r.error }))
    });

    return {
      message: `Đã duyệt ${successCount} yêu cầu hủy thành công${failureCount > 0 ? `, ${failureCount} yêu cầu thất bại` : ''}`,
      results,
      summary: {
        total: gatePassIds.length,
        success: successCount,
        failure: failureCount
      }
    };
  }

  // Bulk reject cancellation requests
  async bulkRejectCancellation(approverId: string, bulkRejectDto: BulkRejectGatePassDto) {
    const { gatePassIds, comment } = bulkRejectDto;
    const results: Array<{ id: string; success: boolean; error?: string; gatePass?: any }> = [];

    for (const gatePassId of gatePassIds) {
      try {
        const approvalCheck = await this.canUserApproveCancellation(gatePassId, approverId);
        
        if (!approvalCheck.canApprove) {
          results.push({
            id: gatePassId,
            success: false,
            error: approvalCheck.reason || 'Không có quyền từ chối yêu cầu hủy'
          });
          continue;
        }

        const rejectedCancellation = await this.rejectCancellation(gatePassId, approverId, { comment });
        results.push({
          id: gatePassId,
          success: true,
          gatePass: rejectedCancellation.gatePass
        });
      } catch (error) {
        results.push({
          id: gatePassId,
          success: false,
          error: error.message || 'Có lỗi xảy ra khi từ chối yêu cầu hủy'
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    return {
      message: `Đã từ chối ${successCount} yêu cầu hủy thành công${failureCount > 0 ? `, ${failureCount} yêu cầu thất bại` : ''}`,
      results,
      summary: {
        total: gatePassIds.length,
        success: successCount,
        failure: failureCount
      }
    };
  }

  async approveCancellation(gatePassId: string, approverId: string, approveDto: ApproveCancellationDto) {
    const gatePass = await this.prisma.gatePass.findUnique({
      where: { id: gatePassId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          }
        },
        approvals: {
          include: {
            approver: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              }
            }
          },
          where: {
            status: 'APPROVED'
          }
        }
      }
    });

    if (!gatePass) {
      throw new NotFoundException('Giấy ra vào cổng không tồn tại');
    }

    if (gatePass.status !== 'CANCELLATION_REQUESTED') {
      throw new BadRequestException('Giấy ra vào cổng không có yêu cầu hủy');
    }

    // Check if the current user was one of the approvers who approved this gate pass
    const userApproval = gatePass.approvals.find(approval => approval.approverId === approverId);
    if (!userApproval) {
      throw new ForbiddenException('Bạn không có quyền phê duyệt yêu cầu hủy giấy ra vào cổng này');
    }

    // Update gate pass status to cancelled
    const updatedGatePass = await this.prisma.gatePass.update({
      where: { id: gatePassId },
      data: {
        status: 'REJECTED', // Use REJECTED status to indicate cancelled
        reasonDetail: `${gatePass.reasonDetail}\n\n[ĐÃ HỦY] ${approveDto.comment || 'Không có ghi chú'}`
      }
    });

    // Send notification to user about cancellation approval
    try {
      await this.notificationService.notifyGatePassCancellationApproved(
        gatePassId,
        gatePass.user,
        { id: approverId, firstName: 'Manager', lastName: '', email: '' },
        approveDto.comment
      );
    } catch (error) {
      console.error('Failed to send cancellation approval notification for gate pass:', gatePassId, error.message);
    }

    return {
      message: 'Đã phê duyệt yêu cầu hủy giấy ra vào cổng',
      gatePass: updatedGatePass
    };
  }

  async rejectCancellation(gatePassId: string, approverId: string, rejectDto: RejectCancellationDto) {
    const gatePass = await this.prisma.gatePass.findUnique({
      where: { id: gatePassId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          }
        },
        approvals: {
          include: {
            approver: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              }
            }
          },
          where: {
            status: 'APPROVED'
          }
        }
      }
    });

    if (!gatePass) {
      throw new NotFoundException('Giấy ra vào cổng không tồn tại');
    }

    if (gatePass.status !== 'CANCELLATION_REQUESTED') {
      throw new BadRequestException('Giấy ra vào cổng không có yêu cầu hủy');
    }

    // Check if the current user was one of the approvers who approved this gate pass
    const userApproval = gatePass.approvals.find(approval => approval.approverId === approverId);
    if (!userApproval) {
      throw new ForbiddenException('Bạn không có quyền từ chối yêu cầu hủy giấy ra vào cổng này');
    }

    // Update gate pass status back to approved
    const updatedGatePass = await this.prisma.gatePass.update({
      where: { id: gatePassId },
      data: {
        status: 'APPROVED', // Restore to approved status
        reasonDetail: `${gatePass.reasonDetail}\n\n[TỪ CHỐI HỦY] ${rejectDto.comment || 'Không có ghi chú'}`
      }
    });

    // Send notification to user about cancellation rejection
    try {
      await this.notificationService.notifyGatePassCancellationRejected(
        gatePassId,
        gatePass.user,
        { id: approverId, firstName: 'Manager', lastName: '', email: '' },
        rejectDto.comment
      );
    } catch (error) {
      console.error('Failed to send cancellation rejection notification for gate pass:', gatePassId, error.message);
    }

    return {
      message: 'Đã từ chối yêu cầu hủy giấy ra vào cổng',
      gatePass: updatedGatePass
    };
  }
}