import { IsOptional, IsString } from 'class-validator';

export class ApproveGatePassDto {
  @IsOptional()
  @IsString()
  comment?: string;
}

export class RejectGatePassDto {
  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}
