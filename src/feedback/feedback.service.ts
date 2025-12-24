import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';

interface GetAllFeedbackParams {
  page: number;
  limit: number;
  startDate?: string;
  endDate?: string;
  year?: number;
  month?: number;
}

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Tạo feedback mới (anonymous - không cần đăng nhập)
   */
  async createFeedback(
    dto: CreateFeedbackDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    try {
      const feedback = await this.prisma.feedback.create({
        data: {
          content: dto.content,
          ipAddress,
          userAgent,
        },
      });

      this.logger.log(`New anonymous feedback created: ${feedback.id}`);

      return {
        message: 'Cảm ơn bạn đã gửi góp ý. Chúng tôi sẽ xem xét và phản hồi sớm nhất.',
        feedbackId: feedback.id,
      };
    } catch (error) {
      this.logger.error('Error creating feedback:', error);
      throw error;
    }
  }

  /**
   * Lấy tất cả feedback với filter (chỉ dành cho user có quyền)
   */
  async getAllFeedback(params: GetAllFeedbackParams) {
    const { page, limit, startDate, endDate, year, month } = params;

    const skip = (page - 1) * limit;

    const where: any = {};

    // Filter theo khoảng thời gian cụ thể
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }
    // Filter theo tháng/năm
    else if (year && month) {
      const startOfMonth = new Date(year, month - 1, 1);
      const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
      where.createdAt = {
        gte: startOfMonth,
        lte: endOfMonth,
      };
    }
    // Filter chỉ theo năm
    else if (year) {
      const startOfYear = new Date(year, 0, 1);
      const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999);
      where.createdAt = {
        gte: startOfYear,
        lte: endOfYear,
      };
    }

    const [feedbacks, total] = await Promise.all([
      this.prisma.feedback.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
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

  /**
   * Lấy feedback theo ID
   */
  async getFeedbackById(id: string) {
    const feedback = await this.prisma.feedback.findUnique({
      where: { id },
    });

    if (!feedback) {
      throw new Error('Feedback not found');
    }

    return feedback;
  }

  /**
   * Xóa feedback (chỉ dành cho user có quyền)
   */
  async deleteFeedback(id: string) {
    try {
      await this.prisma.feedback.delete({
        where: { id },
      });

      this.logger.log(`Feedback deleted: ${id}`);

      return {
        message: 'Đã xóa góp ý thành công',
      };
    } catch (error) {
      this.logger.error(`Error deleting feedback ${id}:`, error);
      throw error;
    }
  }

  /**
   * Lấy thống kê feedback
   */
  async getFeedbackStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const [total, thisMonth, lastMonth] = await Promise.all([
      this.prisma.feedback.count(),
      this.prisma.feedback.count({
        where: {
          createdAt: { gte: startOfMonth },
        },
      }),
      this.prisma.feedback.count({
        where: {
          createdAt: {
            gte: startOfLastMonth,
            lte: endOfLastMonth,
          },
        },
      }),
    ]);

    return {
      total,
      thisMonth,
      lastMonth,
    };
  }
}
