import {
  IsString, IsBoolean, IsOptional, IsEnum, IsNumber,
  IsUUID, ValidateNested, IsArray, Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateLeaveFlowLevelDto {
  @IsNumber()
  @Min(1)
  level: number;

  @IsEnum(['SPECIFIC_USER', 'ROLE_IN_COMPANY', 'ROLE_IN_OFFICE', 'ROLE_IN_DEPARTMENT', 'DEPARTMENT_MANAGERS'])
  approverMode: string;

  @IsOptional()
  @IsUUID()
  specificUserId?: string;

  @IsOptional()
  @IsUUID()
  roleDefinitionId?: string;

  @IsOptional()
  @IsUUID()
  targetDepartmentId?: string;

  @IsOptional()
  @IsUUID()
  substitute1Id?: string;

  @IsOptional()
  @IsUUID()
  substitute2Id?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  timeoutHours?: number;

  @IsOptional()
  @IsEnum(['ESCALATE', 'AUTO_APPROVE', 'AUTO_REJECT', 'NOTIFY_ONLY'])
  timeoutAction?: string;

  @IsOptional()
  @IsBoolean()
  canViewAllRequests?: boolean;
}

export class CreateLeaveFlowDto {
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  leaveTypeId?: string;

  @IsOptional()
  @IsUUID()
  officeId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsNumber()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateLeaveFlowLevelDto)
  levels: CreateLeaveFlowLevelDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requesterJobNames?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  requesterFilterIds?: string[];
}
