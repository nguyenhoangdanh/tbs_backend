import { IsEnum, IsOptional, IsInt, IsPositive, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { WorkSheetStatus, ShiftType } from '@prisma/client';

/**
 * DTO for updating worksheet
 * Allows updating planned output, product, process, shift type, or status
 */
export class UpdateWorksheetDto {
  @ApiProperty({
    example: 'COMPLETED',
    description: 'Worksheet status',
    enum: WorkSheetStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(WorkSheetStatus)
  status?: WorkSheetStatus;

  @ApiProperty({
    example: 'OVERTIME_11H',
    description: 'Ca làm việc',
    enum: ShiftType,
    required: false,
  })
  @IsOptional()
  @IsEnum(ShiftType)
  shiftType?: ShiftType;

  @ApiProperty({
    example: 180,
    description: 'SLKH - Updated sản lượng kế hoạch/giờ',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  plannedOutput?: number;

  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Updated Product UUID (mã túi)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Updated Process UUID (công đoạn)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  processId?: string;
}
