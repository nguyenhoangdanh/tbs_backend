import { IsString, IsInt, IsOptional, IsEnum, IsBoolean, IsArray, Min, Max } from 'class-validator';

export enum GatePassApproverTypeDto {
  DEPARTMENT_HEAD = 'DEPARTMENT_HEAD',
  SPECIFIC_USER = 'SPECIFIC_USER',
}

export class CreateApprovalConfigDto {
  @IsOptional()
  @IsString()
  officeId?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsInt()
  @Min(1)
  @Max(2)
  level: number;

  @IsEnum(GatePassApproverTypeDto)
  approverType: GatePassApproverTypeDto;

  @IsOptional()
  @IsString()
  approverUserId?: string;

  @IsOptional()
  @IsString()
  substituteUserId?: string;

  @IsOptional()
  @IsString()
  requesterJobName?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requesterJobNames?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requesterFilterIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  overrideApproverIds?: string[];
}

export class UpdateApprovalConfigDto {
  @IsOptional()
  @IsEnum(GatePassApproverTypeDto)
  approverType?: GatePassApproverTypeDto;

  @IsOptional()
  @IsString()
  approverUserId?: string;

  @IsOptional()
  @IsString()
  substituteUserId?: string | null;

  @IsOptional()
  @IsString()
  requesterJobName?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requesterJobNames?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  overrideApproverIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requesterFilterIds?: string[];
}
