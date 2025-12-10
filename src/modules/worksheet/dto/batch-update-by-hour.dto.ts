import { IsArray, ValidateNested, IsUUID, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * DTO for single product entry within a worker's hour
 * Công nhân có thể làm nhiều mã túi trong 1 giờ
 */
export class ProductEntryDto {
  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Product UUID (mã túi)',
  })
  @IsUUID()
  productId: string;

  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Process UUID (công đoạn)',
  })
  @IsUUID()
  processId: string;

  @ApiProperty({
    example: 180,
    description: 'SLKH - Sản lượng kế hoạch cho entry này (optional, default from worksheet)',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  plannedOutput?: number;

  @ApiProperty({
    example: 5,
    description: 'SLTH - Sản lượng thực hiện cho mã túi này',
  })
  @IsInt()
  @Min(0)
  actualOutput: number;

  @ApiProperty({
    example: 'Túi A màu đỏ',
    description: 'Ghi chú cho entry này',
    required: false,
  })
  @IsOptional()
  @IsString()
  note?: string;
}

/**
 * DTO for single worker's output in hour update
 * Hỗ trợ multiple products per worker per hour
 */
export class HourWorkerOutputDto {
  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Worker ID (User UUID)',
  })
  @IsUUID()
  workerId: string;

  @ApiProperty({
    type: [ProductEntryDto],
    description: 'Array of product entries (công nhân làm bao nhiêu mã túi trong giờ này)',
    example: [
      { productId: 'uuid1', processId: 'uuid1', actualOutput: 5, note: 'Túi A' },
      { productId: 'uuid2', processId: 'uuid1', actualOutput: 6, note: 'Túi B' }
    ]
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductEntryDto)
  entries: ProductEntryDto[];
}

/**
 * DTO for batch updating all workers in a specific hour
 * 
 * Use case: Nhóm trưởng nhập sản lượng giờ 1 cho 30 công nhân
 * 
 * Example Request:
 * POST /api/worksheets/group/:groupId/hour/:workHour/batch-update
 * {
 *   "date": "2025-02-10",
 *   "outputs": [
 *     {
 *       "workerId": "uuid1",
 *       "entries": [
 *         { "productId": "tui-a", "processId": "chat", "plannedOutput": 180, "actualOutput": 5 },
 *         { "productId": "tui-b", "processId": "chat", "plannedOutput": 200, "actualOutput": 6 }
 *       ]
 *     },
 *     {
 *       "workerId": "uuid2",
 *       "entries": [
 *         { "productId": "tui-a", "processId": "chat", "plannedOutput": 180, "actualOutput": 12 }
 *       ]
 *     },
 *     ...30 workers
 *   ]
 * }
 */
export class BatchUpdateByHourDto {
  @ApiProperty({
    example: '2025-02-10',
    description: 'Date of worksheets (YYYY-MM-DD)',
  })
  @IsString()
  date: string;

  @ApiProperty({
    type: [HourWorkerOutputDto],
    description: 'Array of all workers outputs for this hour (typically 30 workers)',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HourWorkerOutputDto)
  outputs: HourWorkerOutputDto[];
}
