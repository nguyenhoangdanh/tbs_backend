import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/common/prisma.service';

/**
 * LeaveAccrualService
 * Cron job chạy vào ngày 1 hàng tháng lúc 00:05
 * Tích lũy ngày phép năm cho tất cả nhân viên đang hoạt động:
 * - Cứ làm đủ 1 tháng → +1 ngày phép năm (cấu hình qua LeaveType.accrualPerMonth)
 * - Điều kiện: user.joinDate <= ngày cuối tháng vừa qua (đã làm đủ tháng)
 * - Batch 500 users với cursor pagination để không timeout với 30k users
 */
@Injectable()
export class LeaveAccrualService {
  private readonly logger = new Logger(LeaveAccrualService.name);
  private readonly BATCH_SIZE = 500;

  constructor(private readonly prisma: PrismaService) {}

  @Cron('5 0 1 * *') // 00:05 ngày 1 mỗi tháng
  async runMonthlyAccrual() {
    const now = new Date();
    // Tháng vừa qua
    const accrualMonth = now.getMonth() === 0 ? 12 : now.getMonth();
    const accrualYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const currentYear = now.getFullYear();

    this.logger.log(`[Accrual] Bắt đầu tích lũy phép tháng ${accrualMonth}/${accrualYear}`);

    // Lấy tất cả loại phép có accrual
    const accruableTypes = await this.prisma.leaveType.findMany({
      where: { isAccruable: true, isActive: true },
      select: { id: true, accrualPerMonth: true, companyId: true },
    });

    if (!accruableTypes.length) {
      this.logger.log('[Accrual] Không có loại phép nào cần tích lũy');
      return;
    }

    let totalAccrued = 0;
    let cursor: string | undefined = undefined;

    do {
      // Lấy batch users đang active và đã join trước hoặc trong tháng vừa qua
      const lastDayOfPrevMonth = new Date(accrualYear, accrualMonth, 0); // ngày cuối tháng trước
      const users = await this.prisma.user.findMany({
        where: {
          isActive: true,
          OR: [
            { joinDate: { lte: lastDayOfPrevMonth } },
            { joinDate: null },
          ],
        },
        select: { id: true, companyId: true },
        take: this.BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { id: 'asc' },
      });

      if (!users.length) break;
      cursor = users[users.length - 1].id;

      // Process từng user trong batch
      for (const user of users) {
        // Lấy loại phép phù hợp (global hoặc cùng công ty)
        const relevantTypes = accruableTypes.filter(
          (t) => t.companyId === null || t.companyId === user.companyId,
        );

        for (const leaveType of relevantTypes) {
          // Kiểm tra đã tích lũy tháng này chưa
          const balance = await this.prisma.leaveBalance.findUnique({
            where: { userId_leaveTypeId_year: { userId: user.id, leaveTypeId: leaveType.id, year: currentYear } },
            select: { id: true, lastAccrualMonth: true, lastAccrualYear: true },
          });

          // Nếu đã tích lũy tháng này rồi → bỏ qua
          if (
            balance &&
            balance.lastAccrualMonth === accrualMonth &&
            balance.lastAccrualYear === accrualYear
          ) continue;

          const accrualDays = Number(leaveType.accrualPerMonth ?? 1);

          if (balance) {
            await this.prisma.leaveBalance.update({
              where: { id: balance.id },
              data: {
                accrued: { increment: accrualDays },
                lastAccrualMonth: accrualMonth,
                lastAccrualYear: accrualYear,
              },
            });
          } else {
            // Tạo balance mới với carry-over nếu cần
            await this.prisma.leaveBalance.create({
              data: {
                userId: user.id,
                leaveTypeId: leaveType.id,
                year: currentYear,
                companyId: user.companyId,
                accrued: accrualDays,
                carriedOver: 0,
                lastAccrualMonth: accrualMonth,
                lastAccrualYear: accrualYear,
              },
            });
          }

          totalAccrued++;
        }
      }

      this.logger.log(`[Accrual] Đã xử lý ${users.length} users (cursor: ${cursor})`);
    } while (true);

    this.logger.log(`[Accrual] Hoàn thành. Tổng bản ghi được cập nhật: ${totalAccrued}`);
  }

  /** Trigger thủ công — dùng để test hoặc backfill */
  async triggerManualAccrual(month: number, year: number) {
    this.logger.log(`[Accrual] Manual trigger cho tháng ${month}/${year}`);
    // Tạm thời override month/year trong context
    const originalNow = Date.now;
    // Dùng trực tiếp với tháng/năm được truyền vào
    await this.runForMonth(month, year);
  }

  private async runForMonth(accrualMonth: number, accrualYear: number) {
    const currentYear = accrualMonth === 12 ? accrualYear + 1 : accrualYear;
    const lastDayOfMonth = new Date(accrualYear, accrualMonth, 0);

    const accruableTypes = await this.prisma.leaveType.findMany({
      where: { isAccruable: true, isActive: true },
      select: { id: true, accrualPerMonth: true, companyId: true },
    });

    let cursor: string | undefined = undefined;
    let totalAccrued = 0;

    do {
      const users = await this.prisma.user.findMany({
        where: { 
          isActive: true,
          OR: [
            { joinDate: { lte: lastDayOfMonth } },
            { joinDate: null },
          ],
        },
        select: { id: true, companyId: true },
        take: this.BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { id: 'asc' },
      });

      if (!users.length) break;
      cursor = users[users.length - 1].id;

      for (const user of users) {
        const relevantTypes = accruableTypes.filter((t) => !t.companyId || t.companyId === user.companyId);
        for (const lt of relevantTypes) {
          const accrualDays = Number(lt.accrualPerMonth ?? 1);
          await this.prisma.leaveBalance.upsert({
            where: { userId_leaveTypeId_year: { userId: user.id, leaveTypeId: lt.id, year: currentYear } },
            update: {
              accrued: { increment: accrualDays },
              lastAccrualMonth: accrualMonth,
              lastAccrualYear: accrualYear,
            },
            create: {
              userId: user.id, leaveTypeId: lt.id, year: currentYear,
              companyId: user.companyId,
              accrued: accrualDays, carriedOver: 0,
              lastAccrualMonth: accrualMonth, lastAccrualYear: accrualYear,
            },
          });
          totalAccrued++;
        }
      }
    } while (true);

    return totalAccrued;
  }
}
