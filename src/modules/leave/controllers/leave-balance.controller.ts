import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  ParseUUIDPipe, DefaultValuePipe, ParseIntPipe,
  UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { LeaveBalanceService } from '../services/leave-balance.service';
import { LeaveAccrualService } from '../services/leave-accrual.service';
import { AdjustBalanceDto } from '../dto/leave-balance/adjust-balance.dto';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { RequirePermissions } from 'src/common/decorators/permissions.decorator';

@Controller('leave-balances')
export class LeaveBalanceController {
  constructor(
    private readonly balanceService: LeaveBalanceService,
    private readonly accrualService: LeaveAccrualService,
  ) {}

  private resolveCompanyId(user: any): string | undefined {
    const isSuperAdmin = user?.roles?.some((r: any) => r?.roleDefinition?.code === 'SUPERADMIN');
    return isSuperAdmin ? undefined : (user?.companyId ?? undefined);
  }

  /** Lấy số dư phép của bản thân theo năm */
  @Get('my')
  @RequirePermissions('leave-balances:view')
  getMyBalance(
    @GetUser('id') userId: string,
    @Query('year', new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) year: number,
  ) {
    return this.balanceService.getUserBalanceSummary(userId, year);
  }

  /** Admin: xem số dư của user bất kỳ (scoped to same company) */
  @Get('user/:userId')
  @RequirePermissions('leave-balances:manage')
  getUserBalance(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('year', new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) year: number,
  ) {
    return this.balanceService.getUserBalanceSummary(userId, year);
  }

  /** Admin: tìm theo mã nhân viên (scoped to caller's company) */
  @Get('by-employee/:employeeCode')
  @RequirePermissions('leave-balances:manage')
  getBalanceByEmployeeCode(
    @Param('employeeCode') employeeCode: string,
    @Query('year', new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) year: number,
    @GetUser() user: any,
  ) {
    const companyId = this.resolveCompanyId(user);
    return this.balanceService.getBalanceSummaryByEmployeeCode(employeeCode, year, companyId);
  }

  /** Admin: điều chỉnh số dư thủ công */
  @Post('adjust')
  @RequirePermissions('leave-balances:manage')
  adjust(@Body() dto: AdjustBalanceDto) {
    return this.balanceService.adjustBalance(dto);
  }

  /** Admin/HR: trigger tích lũy thủ công cho tháng cụ thể (scoped to caller's company) */
  @Post('trigger-accrual')
  @RequirePermissions('leave-balances:manage')
  triggerAccrual(
    @Query('month', ParseIntPipe) month: number,
    @Query('year', ParseIntPipe) year: number,
    @GetUser() user: any,
  ) {
    const companyId = this.resolveCompanyId(user);
    return this.accrualService.triggerManualAccrual(month, year, companyId);
  }

  /** Admin/HR: Import hàng loạt số dư phép năm từ Excel (scoped to caller's company) */
  @Post('bulk-import')
  @RequirePermissions('leave-balances:manage')
  @UseInterceptors(FileInterceptor('file'))
  bulkImport(
    @UploadedFile() file: Express.Multer.File,
    @Query('year', new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) year: number,
    @GetUser() user: any,
  ) {
    const companyId = this.resolveCompanyId(user);
    return this.balanceService.bulkImportBalances(file, year, companyId);
  }
}
