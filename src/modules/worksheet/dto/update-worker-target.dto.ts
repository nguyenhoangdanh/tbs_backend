import { IsInt, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for updating worker's planned output per hour
 */
export class UpdateWorkerPlannedOutputDto {
  @ApiProperty({
    example: 180,
    description: 'SLKH - New sản lượng kế hoạch/giờ for this worker',
    minimum: 1,
  })
  @IsInt()
  @IsPositive()
  plannedOutput: number;
}