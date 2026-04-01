import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/common/prisma.service';

/**
 * WorkingDayService
 * Tính số ngày làm việc thực sự giữa 2 ngày:
 * - Chỉ tính T2–T7 (không tính CN)
 * - Loại trừ ngày nghỉ lễ (PublicHoliday)
 * - Hỗ trợ nửa ngày (startHalfDay / endHalfDay)
 * - Giờ làm: 7h30–16h30
 */
@Injectable()
export class WorkingDayService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lấy danh sách ngày nghỉ lễ trong một khoảng thời gian
   */
  async getHolidayDates(
    startDate: Date,
    endDate: Date,
    companyId?: string,
  ): Promise<Set<string>> {
    const holidays = await this.prisma.publicHoliday.findMany({
      where: {
        isActive: true,
        OR: [{ companyId: null }, ...(companyId ? [{ companyId }] : [])],
        date: { gte: startDate, lte: endDate },
      },
      select: { date: true },
    });
    return new Set(holidays.map((h) => this.toDateKey(h.date)));
  }

  /**
   * Tính tổng ngày làm việc (T2–T7, trừ lễ, hỗ trợ nửa ngày)
   */
  async calculateWorkingDays(
    startDate: Date,
    endDate: Date,
    options: {
      startHalfDay?: boolean;
      endHalfDay?: boolean;
      companyId?: string;
      countWorkingDaysOnly?: boolean;
    } = {},
  ): Promise<number> {
    const { startHalfDay = false, endHalfDay = false, companyId, countWorkingDaysOnly = true } = options;

    if (!countWorkingDaysOnly) {
      // Tính tổng ngày lịch (bao gồm CN và lễ)
      const diffMs = endDate.getTime() - startDate.getTime();
      const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
      const halfDayDeduction = (startHalfDay ? 0.5 : 0) + (endHalfDay ? 0.5 : 0);
      return Math.max(0, totalDays - halfDayDeduction);
    }

    const holidaySet = await this.getHolidayDates(startDate, endDate, companyId);
    let totalDays = 0;
    const current = new Date(startDate);

    while (current <= endDate) {
      const dayOfWeek = current.getDay(); // 0 = CN, 6 = T7
      const dateKey = this.toDateKey(current);

      if (dayOfWeek !== 0 && !holidaySet.has(dateKey)) {
        // Ngày làm việc hợp lệ
        const isStart = this.toDateKey(current) === this.toDateKey(startDate);
        const isEnd = this.toDateKey(current) === this.toDateKey(endDate);

        if (isStart && startHalfDay && isEnd && endHalfDay) {
          totalDays += 0.5; // chỉ 1 ngày, cả 2 đầu đều nửa ngày → vẫn là 0.5
        } else if (isStart && startHalfDay) {
          totalDays += 0.5;
        } else if (isEnd && endHalfDay) {
          totalDays += 0.5;
        } else {
          totalDays += 1;
        }
      }

      current.setDate(current.getDate() + 1);
    }

    return totalDays;
  }

  /**
   * Kiểm tra xem ngày có phải ngày làm việc không (T2–T7, không lễ)
   */
  async isWorkingDay(date: Date, companyId?: string): Promise<boolean> {
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0) return false; // Chủ nhật

    const holidaySet = await this.getHolidayDates(date, date, companyId);
    return !holidaySet.has(this.toDateKey(date));
  }

  private toDateKey(date: Date): string {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
