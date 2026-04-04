import { IsString, IsDateString, IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class UpdateLeaveRequestDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  startHalfDay?: boolean;

  @IsOptional()
  @IsBoolean()
  endHalfDay?: boolean;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  attachmentUrl?: string;
}
