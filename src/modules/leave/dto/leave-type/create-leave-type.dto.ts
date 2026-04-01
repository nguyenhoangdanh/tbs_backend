import {
  IsString, IsBoolean, IsOptional, IsEnum, IsNumber,
  IsDecimal, Min, IsUUID, IsHexColor,
} from 'class-validator';

export class CreateLeaveTypeDto {
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsString()
  code: string;

  @IsString()
  categoryId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  nameVi?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  requiresDocument?: boolean;

  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;

  @IsOptional()
  @IsBoolean()
  isAccruable?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  accrualPerMonth?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDaysPerYear?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxCarryOver?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minNoticeDays?: number;

  @IsOptional()
  @IsBoolean()
  countWorkingDaysOnly?: boolean;

  @IsOptional()
  @IsBoolean()
  isAutoApproved?: boolean;

  @IsOptional()
  @IsBoolean()
  allowHalfDay?: boolean;

  @IsOptional()
  @IsString()
  colorCode?: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}
