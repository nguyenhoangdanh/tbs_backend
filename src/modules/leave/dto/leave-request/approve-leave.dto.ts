import { IsString, IsOptional, IsEnum, IsUUID } from 'class-validator';

export enum ApprovalDecision {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export class ApproveLeaveDto {
  @IsEnum(ApprovalDecision)
  action: ApprovalDecision;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class CancelLeaveRequestDto {
  @IsOptional()
  @IsString()
  cancelReason?: string;
}

export class AddLeaveCommentDto {
  @IsString()
  content: string;

  @IsOptional()
  isInternal?: boolean = false;
}
