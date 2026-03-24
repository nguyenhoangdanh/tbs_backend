import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { UpdateFeedbackStatusDto } from './dto/update-feedback-status.dto';
import { FeedbackStatus } from '@prisma/client';

interface GetAllFeedbackParams {
  page: number;
  limit: number;
  startDate?: string;
  endDate?: string;
  year?: number;
  month?: number;
  status?: FeedbackStatus;
}

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(private prisma: PrismaService) {}

  async createFeedback(
    dto: CreateFeedbackDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const feedback = await this.prisma.feedback.create({
      data: {
        content: dto.content,
        rating: dto.rating ?? null,
        ipAddress,
        userAgent,
      },
    });

    this.logger.log(`New anonymous feedback created: ${feedback.id}`);
    return {
      message: 'Cảm ơn bạn đã gửi góp ý. Chúng tôi sẽ xem xét và phản hồi sớm nhất.',
      feedbackId: feedback.id,
    };
  }

  async getAllFeedback(params: GetAllFeedbackParams) {
    const { page, limit, startDate, endDate, year, month, status } = params;
    const skip = (page - 1) * limit;
    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    } else if (year && month) {
      where.createdAt = {
        gte: new Date(year, month - 1, 1),
        lte: new Date(year, month, 0, 23, 59, 59, 999),
      };
    } else if (year) {
      where.createdAt = {
        gte: new Date(year, 0, 1),
        lte: new Date(year, 11, 31, 23, 59, 59, 999),
      };
    }

    const [feedbacks, total] = await Promise.all([
      this.prisma.feedback.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          resolvedBy: {
            select: { id: true, firstName: true, lastName: true, employeeCode: true },
          },
          views: {
            orderBy: { viewedAt: 'desc' },
            include: {
              viewer: {
                select: { id: true, firstName: true, lastName: true, employeeCode: true },
              },
            },
          },
          _count: { select: { views: true } },
        },
      }),
      this.prisma.feedback.count({ where }),
    ]);

    return {
      data: feedbacks,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getFeedbackById(id: string, viewerId?: string) {
    const feedback = await this.prisma.feedback.findUnique({
      where: { id },
      include: {
        resolvedBy: {
          select: { id: true, firstName: true, lastName: true, employeeCode: true },
        },
        views: {
          orderBy: { viewedAt: 'desc' },
          include: {
            viewer: {
              select: { id: true, firstName: true, lastName: true, employeeCode: true },
            },
          },
        },
        _count: { select: { views: true } },
      },
    });

    if (!feedback) {
      throw new NotFoundException('Feedback not found');
    }

    // Record view if viewerId provided
    if (viewerId) {
      await this.prisma.feedbackView.upsert({
        where: { feedbackId_viewerId: { feedbackId: id, viewerId } },
        create: { feedbackId: id, viewerId },
        update: { viewedAt: new Date() },
      });
    }

    return feedback;
  }

  async updateStatus(id: string, dto: UpdateFeedbackStatusDto, actorId: string) {
    const feedback = await this.prisma.feedback.findUnique({ where: { id } });
    if (!feedback) {
      throw new NotFoundException('Feedback not found');
    }

    const updateData: any = { status: dto.status };

    if (dto.status === FeedbackStatus.IN_PROGRESS) {
      // Track who is currently processing
      updateData.resolvedById = actorId;
      updateData.resolvedAt = null;
    } else if (dto.status === FeedbackStatus.RESOLVED) {
      updateData.resolvedById = actorId;
      updateData.resolvedAt = new Date();
    } else if (dto.status === FeedbackStatus.PENDING) {
      updateData.resolvedById = null;
      updateData.resolvedAt = null;
    }

    const updated = await this.prisma.feedback.update({
      where: { id },
      data: updateData,
      include: {
        resolvedBy: {
          select: { id: true, firstName: true, lastName: true, employeeCode: true },
        },
        _count: { select: { views: true } },
      },
    });

    this.logger.log(`Feedback ${id} status updated to ${dto.status} by ${actorId}`);
    return updated;
  }

  async deleteFeedback(id: string) {
    const feedback = await this.prisma.feedback.findUnique({ where: { id } });
    if (!feedback) {
      throw new NotFoundException('Feedback not found');
    }

    await this.prisma.feedback.delete({ where: { id } });
    this.logger.log(`Feedback deleted: ${id}`);
    return { message: 'Đã xóa góp ý thành công' };
  }

  async getFeedbackStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const [total, thisMonth, lastMonth, pending, inProgress, resolved, ratingGroups] = await Promise.all([
      this.prisma.feedback.count(),
      this.prisma.feedback.count({ where: { createdAt: { gte: startOfMonth } } }),
      this.prisma.feedback.count({ where: { createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } } }),
      this.prisma.feedback.count({ where: { status: FeedbackStatus.PENDING } }),
      this.prisma.feedback.count({ where: { status: FeedbackStatus.IN_PROGRESS } }),
      this.prisma.feedback.count({ where: { status: FeedbackStatus.RESOLVED } }),
      this.prisma.feedback.groupBy({
        by: ['rating'],
        where: { rating: { not: null } },
        _count: { rating: true },
      }),
    ]);

    const ratingMap: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let ratingSum = 0;
    let ratingTotal = 0;
    for (const group of ratingGroups) {
      if (group.rating !== null) {
        ratingMap[group.rating] = group._count.rating;
        ratingSum += group.rating * group._count.rating;
        ratingTotal += group._count.rating;
      }
    }

    return {
      total,
      thisMonth,
      lastMonth,
      pending,
      inProgress,
      resolved,
      ratingStats: {
        star1: ratingMap[1],
        star2: ratingMap[2],
        star3: ratingMap[3],
        star4: ratingMap[4],
        star5: ratingMap[5],
        average: ratingTotal > 0 ? Math.round((ratingSum / ratingTotal) * 10) / 10 : 0,
        total: ratingTotal,
      },
    };
  }
}
