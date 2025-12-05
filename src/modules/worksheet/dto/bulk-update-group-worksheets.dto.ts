import { IsEnum, IsOptional, IsInt, IsPositive, IsUUID, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ShiftType } from '@prisma/client';

/**
 * DTO for bulk updating all worksheets in a group
 * Updates shift type, product, process, and planned output for entire group
 */
export class BulkUpdateGroupWorksheetsDto {
  @ApiProperty({
    example: '2025-12-05',
    description: 'Date of worksheets to update (YYYY-MM-DD)',
    required: true,
  })
  @IsDateString()
  date: string;

  @ApiProperty({
    example: 'OVERTIME_11H',
    description: 'Ca làm việc (shift type)',
    enum: ShiftType,
    required: false,
  })
  @IsOptional()
  @IsEnum(ShiftType)
  shiftType?: ShiftType;

  @ApiProperty({
    example: 180,
    description: 'SLKH - Sản lượng kế hoạch/giờ/người',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  plannedOutput?: number;

  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Product UUID (mã túi)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Process UUID (công đoạn)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  processId?: string;
}
