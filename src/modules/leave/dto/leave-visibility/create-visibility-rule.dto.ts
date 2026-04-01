import {
  IsString, IsBoolean, IsOptional, IsEnum, IsNumber, IsUUID,
} from 'class-validator';

export class CreateVisibilityRuleDto {
  @IsUUID()
  companyId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(['OWN', 'TEAM', 'DEPARTMENT', 'OFFICE', 'COMPANY'])
  scope: string;

  @IsOptional()
  @IsUUID()
  viewerRoleId?: string;

  @IsOptional()
  @IsUUID()
  viewerUserId?: string;

  @IsOptional()
  @IsUUID()
  leaveTypeId?: string;

  @IsOptional()
  @IsUUID()
  officeId?: string;

  @IsOptional()
  @IsBoolean()
  canViewDetails?: boolean;

  @IsOptional()
  @IsBoolean()
  canViewDocuments?: boolean;

  @IsOptional()
  @IsNumber()
  priority?: number;
}
