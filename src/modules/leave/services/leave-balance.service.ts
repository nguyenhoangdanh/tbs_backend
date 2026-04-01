import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/common/prisma.service';
import { AdjustBalanceDto } from '../dto/leave-balance/adjust-balance.dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class LeaveBalanceService {
  private readonly logger = new Logger(LeaveBalanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Lấy hoặc tạo balance ───────────────────────────────────────

  async getOrCreateBalance(
    userId: string,
    leaveTypeId: string,
    year: number,
    companyId: string,
  ) {
    const existing = await this.prisma.leaveBalance.findUnique({
      where: { userId_leaveTypeId_year: { userId, leaveTypeId, year } },
    });
    if (existing) return existing;

    // Tính carry-over từ năm trước
    const prevYear = year - 1;
    const prevBalance = await this.prisma.leaveBalance.findUnique({
      where: { userId_leaveTypeId_year: { userId, leaveTypeId, year: prevYear } },
    });
    const leaveType = await this.prisma.leaveType.findUnique({ where: { id: leaveTypeId } });

    let carriedOver = 0;
    if (prevBalance && leaveType) {
      const prevAvailable = this.calcAvailable(prevBalance);
      const maxCarry = leaveType.maxCarryOver ? Number(leaveType.maxCarryOver) : Infinity;
      carriedOver = Math.min(prevAvailable, maxCarry);
    }

    return this.prisma.leaveBalance.create({
      data: {
        userId, leaveTypeId, year, companyId,
        accrued: 0, carriedOver, adjusted: 0,
        used: 0, pending: 0, expired: 0,
      },
    });
  }

  // ── Tính số ngày còn lại ────────────────────────────────────────

  calcAvailable(balance: {
    accrued: Decimal | number;
    carriedOver: Decimal | number;
    adjusted: Decimal | number;
    used: Decimal | number;
    pending: Decimal | number;
    expired: Decimal | number;
  }): number {
    const toNum = (v: Decimal | number) => Number(v);
    return (
      toNum(balance.accrued) + toNum(balance.carriedOver) + toNum(balance.adjusted)
      - toNum(balance.used) - toNum(balance.pending) - toNum(balance.expired)
    );
  }

  // ── Tăng/giảm số ngày pending ───────────────────────────────────

  async adjustPending(
    userId: string,
    leaveTypeId: string,
    year: number,
    companyId: string,
    delta: number,
  ) {
    await this.getOrCreateBalance(userId, leaveTypeId, year, companyId);
    return this.prisma.leaveBalance.update({
      where: { userId_leaveTypeId_year: { userId, leaveTypeId, year } },
      data: { pending: { increment: delta } },
    });
  }

  // ── Xác nhận ngày đã dùng (pending → used) ─────────────────────

  async confirmUsed(
    userId: string,
    leaveTypeId: string,
    year: number,
    companyId: string,
    days: number,
  ) {
    return this.prisma.leaveBalance.update({
      where: { userId_leaveTypeId_year: { userId, leaveTypeId, year } },
      data: {
        pending: { decrement: days },
        used: { increment: days },
      },
    });
  }

  // ── Điều chỉnh thủ công (admin) ─────────────────────────────────

  async adjustBalance(dto: AdjustBalanceDto) {
    const year = dto.year;
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: dto.userId }, select: { companyId: true } });
    await this.getOrCreateBalance(dto.userId, dto.leaveTypeId, year, user.companyId);
    return this.prisma.leaveBalance.update({
      where: { userId_leaveTypeId_year: { userId: dto.userId, leaveTypeId: dto.leaveTypeId, year } },
      data: {
        adjusted: { increment: dto.adjustedDelta },
        note: dto.note ?? undefined,
      },
    });
  }

  // ── Lấy balance tổng hợp của user ──────────────────────────────

  async getUserBalanceSummary(userId: string, year: number) {
    const balances = await this.prisma.leaveBalance.findMany({
      where: { userId, year },
      include: {
        leaveType: {
          select: { id: true, code: true, name: true, nameVi: true, colorCode: true, isAccruable: true, category: { select: { code: true, name: true, leaveCategory: true } } },
        },
      },
    });

    return balances.map((b) => ({
      ...b,
      available: this.calcAvailable(b),
    }));
  }

  async getBalanceSummaryByEmployeeCode(employeeCode: string, year: number) {
    const user = await this.prisma.user.findFirst({
      where: { employeeCode },
      select: { id: true, firstName: true, lastName: true, employeeCode: true },
    });
    if (!user) throw new Error(`Không tìm thấy nhân viên với mã: ${employeeCode}`);

    const balances = await this.getUserBalanceSummary(user.id, year);
    return { user, balances };
  }
}
