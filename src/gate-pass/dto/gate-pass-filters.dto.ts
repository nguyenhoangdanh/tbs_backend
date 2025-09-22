import { IsEnum, IsOptional, IsDateString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { GatePassStatus, GatePassReason } from '@prisma/client';
import { Transform } from 'class-transformer';

export class GatePassFiltersDto {
  @ApiProperty({
    description: 'Filter by gate pass status',
    enum: GatePassStatus,
    required: false,
  })
  @IsEnum(GatePassStatus)
  @IsOptional()
  status?: GatePassStatus;

  @ApiProperty({
    description: 'Filter by reason type',
    enum: GatePassReason,
    required: false,
  })
  @IsEnum(GatePassReason)
  @IsOptional()
  reasonType?: GatePassReason;

  @ApiProperty({
    description: 'Filter by user ID (admin only)',
    required: false,
  })
  @IsUUID()
  @IsOptional()
  userId?: string;

  @ApiProperty({
    description: 'Filter by start date (from)',
    required: false,
  })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiProperty({
    description: 'Filter by end date (to)',
    required: false,
  })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiProperty({
    description: 'Page number for pagination',
    default: 1,
    required: false,
  })
  @Transform(({ value }) => parseInt(value))
  @IsOptional()
  page?: number = 1;

  @ApiProperty({
    description: 'Number of items per page',
    default: 10,
    required: false,
  })
  @Transform(({ value }) => parseInt(value))
  @IsOptional()
  limit?: number = 10;
}