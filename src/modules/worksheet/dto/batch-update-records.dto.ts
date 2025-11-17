import { IsArray, ValidateNested, IsUUID, IsInt, IsOptional, IsString, Min, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { WorkRecordStatus } from '@prisma/client';

/**
 * DTO for single worker's output in batch update
 * Nhóm trưởng nhập sản lượng cho 1 công nhân trong giờ đó
 */
export class WorkerOutputDto {
  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'WorkSheetRecord UUID (record của công nhân này trong giờ này)',
  })
  @IsUUID()
  recordId: string;

  @ApiProperty({
    example: 11,
    description: 'SLTH - Sản lượng thực hiện của công nhân này trong giờ',
  })
  @IsInt()
  @Min(0)
  actualOutput: number;

  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Product UUID (nếu công nhân đổi mã túi)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Process UUID (nếu công nhân đổi công đoạn)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  processId?: string;

  @ApiProperty({
    example: 15,
    description: 'SLKH - Override sản lượng kế hoạch cho giờ này (optional)',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  plannedOutput?: number;

  @ApiProperty({
    example: 'VT thiếu',
    description: 'Ghi chú cho công nhân này',
    required: false,
  })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({
    example: 'COMPLETED',
    description: 'Status của record này',
    enum: WorkRecordStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(WorkRecordStatus)
  status?: WorkRecordStatus;
}

/**
 * DTO for batch updating multiple workers' outputs in one hour
 * Nhóm trưởng nhập sản lượng cho 30 công nhân trong 1 giờ, rồi bấm Save 1 lần
 * 
 * Example use case:
 * - Nhóm trưởng vào màn hình "Giờ 1" 
 * - Thấy danh sách 30 công nhân
 * - Nhập sản lượng từng người
 * - Bấm Save → Gọi API này với array 30 records
 */
export class BatchUpdateRecordsDto {
  @ApiProperty({
    type: [WorkerOutputDto],
    description: 'Array of worker outputs to update (typically 30 records for 30 workers)',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkerOutputDto)
  records: WorkerOutputDto[];
}
