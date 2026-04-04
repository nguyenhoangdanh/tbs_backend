import { IsString, IsDateString, IsBoolean, IsOptional, IsUUID, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateLeaveRequestDto {
  @IsUUID()
  leaveTypeId: string;

  @IsDateString()
  startDate: string; // YYYY-MM-DD

  @IsDateString()
  endDate: string; // YYYY-MM-DD

  @IsOptional()
  @IsBoolean()
  startHalfDay?: boolean = false; // ngày đầu tính nửa ngày buổi chiều

  @IsOptional()
  @IsBoolean()
  endHalfDay?: boolean = false; // ngày cuối tính nửa ngày buổi sáng

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  attachmentUrl?: string; // URL file đính kèm (giấy viện, ...)

  /** Nếu true → submit ngay (status = PENDING), false → lưu nháp (DRAFT) */
  @IsOptional()
  @IsBoolean()
  submitImmediately?: boolean = true;
}
