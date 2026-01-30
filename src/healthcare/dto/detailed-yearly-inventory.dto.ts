import { IsInt, Min, Max, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GetDetailedYearlyInventoryDto {
  @ApiProperty({ description: 'Month (1-12)', example: 1, minimum: 1, maximum: 12 })
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @ApiProperty({ description: 'Year', example: 2026 })
  @IsInt()
  year: number;

  @ApiPropertyOptional({ description: 'Category ID filter' })
  @IsOptional()
  categoryId?: string;
}
