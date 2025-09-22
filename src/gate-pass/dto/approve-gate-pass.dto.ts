import { IsString, IsOptional, IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ApproveGatePassDto {
  @ApiProperty({
    description: 'Optional comment for the approval',
    required: false,
  })
  @IsString()
  @IsOptional()
  comment?: string;
}

export class RejectGatePassDto {
  @ApiProperty({
    description: 'Reason for rejection',
    required: false,
  })
  @IsString()
  @IsOptional()
  comment?: string;
}

export class BulkApproveGatePassDto {
  @ApiProperty({
    description: 'Array of gate pass IDs to approve',
    type: [String],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  gatePassIds: string[];

  @ApiProperty({
    description: 'Optional comment for all approvals',
    required: false,
  })
  @IsString()
  @IsOptional()
  comment?: string;
}

export class BulkRejectGatePassDto {
  @ApiProperty({
    description: 'Array of gate pass IDs to reject',
    type: [String],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  gatePassIds: string[];

  @ApiProperty({
    description: 'Reason for bulk rejection',
    required: false,
  })
  @IsString()
  @IsOptional()
  comment?: string;
}

export class RequestCancellationDto {
  @ApiProperty({
    description: 'Reason for requesting cancellation of approved gate pass',
    required: true,
  })
  @IsString()
  reason: string;
}

export class ApproveCancellationDto {
  @ApiProperty({
    description: 'Optional comment for approving the cancellation',
    required: false,
  })
  @IsString()
  @IsOptional()
  comment?: string;
}

export class RejectCancellationDto {
  @ApiProperty({
    description: 'Reason for rejecting the cancellation request',
    required: false,
  })
  @IsString()
  @IsOptional()
  comment?: string;
}