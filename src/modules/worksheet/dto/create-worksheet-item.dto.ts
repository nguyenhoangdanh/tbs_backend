// ❌ DEPRECATED: WorkSheetItem has been removed from schema
// Worksheets are now directly linked to workers (1 worksheet = 1 worker)
// This file is kept for backward compatibility but should not be used

import { IsInt, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * @deprecated Use UpdateWorksheetDto to update plannedOutput instead
 */
export class UpdateWorkerPlannedOutputDto {
  @ApiProperty({
    example: 180,
    description: 'Updated planned output per hour for this worksheet',
  })
  @IsInt()
  @IsPositive()
  plannedOutput: number;
}