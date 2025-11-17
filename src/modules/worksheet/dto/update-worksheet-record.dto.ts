import { IsEnum, IsOptional, IsUUID, IsInt, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { WorkRecordStatus } from '@prisma/client';

/**
 * DTO for updating a single WorkSheetRecord (1 giờ làm việc của 1 công nhân)
 * Nhóm trưởng sử dụng để cập nhật sản lượng theo giờ
 */
export class UpdateWorksheetRecordDto {
  @ApiProperty({
    example: 'COMPLETED',
    description: 'Record status',
    enum: WorkRecordStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(WorkRecordStatus)
  status?: WorkRecordStatus;

  @ApiProperty({
    example: 175,
    description: 'SLTH - Sản lượng thực hiện (actual output produced in this hour)',
  })
  @IsInt()
  @Min(0)
  actualOutput: number;

  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Product UUID (nếu công nhân đổi mã túi trong giờ này)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Process UUID (nếu công nhân đổi công đoạn trong giờ này)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  processId?: string;

  @ApiProperty({
    example: 180,
    description: 'SLKH - Override sản lượng kế hoạch cho giờ này (optional)',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  plannedOutput?: number;

  @ApiProperty({
    example: 'VT thiếu nguyên liệu',
    description: 'Ghi chú về giờ làm việc này',
    required: false,
  })
  @IsOptional()
  @IsString()
  note?: string;
}
