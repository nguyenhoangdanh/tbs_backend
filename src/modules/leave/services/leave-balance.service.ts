import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/common/prisma.service';
import { AdjustBalanceDto } from '../dto/leave-balance/adjust-balance.dto';
import { Decimal } from '@prisma/client/runtime/library';
import * as XLSX from 'xlsx';

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

  async getBalanceSummaryByEmployeeCode(employeeCode: string, year: number, companyId?: string) {
    const user = await this.prisma.user.findFirst({
      where: { employeeCode, ...(companyId ? { companyId } : {}) },
      select: { id: true, firstName: true, lastName: true, employeeCode: true },
    });
    if (!user) throw new Error(`Không tìm thấy nhân viên với mã: ${employeeCode}`);

    const balances = await this.getUserBalanceSummary(user.id, year);
    return { user, balances };
  }

  // ── Import hàng loạt số dư phép năm (PN) từ Excel ──────────────

  async bulkImportBalances(file: Express.Multer.File, year: number, companyId?: string) {
    if (!file?.buffer) throw new BadRequestException('Không có file');

    const wb = XLSX.read(file.buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rows.length) throw new BadRequestException('File không có dữ liệu');

    // Find PN leave type scoped to company (or global if no company)
    const pnLeaveType = await this.prisma.leaveType.findFirst({
      where: {
        code: 'PN',
        isActive: true,
        OR: [{ companyId: null }, ...(companyId ? [{ companyId }] : [])],
      },
      select: { id: true, code: true, name: true },
    });
    if (!pnLeaveType) throw new BadRequestException('Không tìm thấy loại phép PN trong hệ thống');

    const results: Array<{
      row: number;
      employeeCode: string;
      fullName: string;
      annualDays: number;
      success: boolean;
      error?: string;
    }> = [];

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      // Support flexible column names (Vietnamese headers)
      const employeeCode = String(raw['MSNV'] ?? raw['msnv'] ?? raw['Mã NV'] ?? raw['employee_code'] ?? '').trim();
      const fullNameRaw = String(raw['HỌ TÊN'] ?? raw['Họ tên'] ?? raw['ho_ten'] ?? raw['fullName'] ?? '').trim();
      const annualDaysRaw = raw['SỐ PN CÒN LẠI'] ?? raw['Số PN còn lại'] ?? raw['so_pn'] ?? raw['annual_days'] ?? '';
      const annualDays = parseFloat(String(annualDaysRaw));

      if (!employeeCode) {
        // Skip blank rows and instruction/note rows silently
        continue;
      }

      if (isNaN(annualDays)) {
        results.push({ row: i + 2, employeeCode, fullName: fullNameRaw, annualDays: 0, success: false, error: 'Số PN không hợp lệ' });
        continue;
      }

      try {
        const user = await this.prisma.user.findFirst({
          where: { employeeCode, ...(companyId ? { companyId } : {}) },
          select: { id: true, companyId: true, firstName: true, lastName: true },
        });

        if (!user) {
          results.push({ row: i + 2, employeeCode, fullName: fullNameRaw, annualDays, success: false, error: 'Không tìm thấy nhân viên' });
          continue;
        }

        // Upsert: ghi đè toàn bộ số dư PN, giữ nguyên used & pending (từ đơn thực tế)
        const existing = await this.prisma.leaveBalance.findUnique({
          where: { userId_leaveTypeId_year: { userId: user.id, leaveTypeId: pnLeaveType.id, year } },
        });

        if (existing) {
          await this.prisma.leaveBalance.update({
            where: { userId_leaveTypeId_year: { userId: user.id, leaveTypeId: pnLeaveType.id, year } },
            data: {
              // Set accrued = target + used + pending so that available = target after minus used/pending
              accrued: annualDays + Number(existing.used) + Number(existing.pending),
              carriedOver: 0,
              adjusted: 0,
              expired: 0,
              note: `Import từ Excel ${new Date().toLocaleDateString('vi-VN')}`,
            },
          });
        } else {
          await this.prisma.leaveBalance.create({
            data: {
              userId: user.id,
              leaveTypeId: pnLeaveType.id,
              year,
              companyId: user.companyId,
              accrued: annualDays,
              carriedOver: 0,
              adjusted: 0,
              used: 0,
              pending: 0,
              expired: 0,
              note: `Import từ Excel ${new Date().toLocaleDateString('vi-VN')}`,
            },
          });
        }

        results.push({
          row: i + 2,
          employeeCode,
          fullName: `${user.firstName} ${user.lastName}`.trim() || fullNameRaw,
          annualDays,
          success: true,
        });
      } catch (err: any) {
        results.push({ row: i + 2, employeeCode, fullName: fullNameRaw, annualDays, success: false, error: err?.message ?? 'Lỗi không xác định' });
      }
    }

    const success = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    return { total: rows.length, success, failed, year, leaveType: pnLeaveType.name, results };
  }
}
