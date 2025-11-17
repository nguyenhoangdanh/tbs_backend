import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for adjusting planned output for a specific hour
 */
export class AdjustRecordTargetDto {
  @ApiProperty({
    example: 180,
    description: 'SLKH - Sản lượng kế hoạch mới cho giờ này',
  })
  @IsInt()
  @Min(0)
  plannedOutput: number;
}