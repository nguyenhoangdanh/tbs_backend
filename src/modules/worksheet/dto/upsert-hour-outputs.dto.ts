import { IsArray, IsInt, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class HourOutputEntryDto {
  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'WorkSheetItem UUID',
  })
  @IsUUID()
  itemId: string;

  @ApiProperty({
    example: 1,
    description: 'Entry index for multiple entries per hour (auto-increment if not provided)',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  entryIndex?: number;

  @ApiProperty({
    example: 25,
    description: 'Actual output produced in this hour',
  })
  @IsInt()
  @Min(0)
  actualOutput: number;

  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Product UUID (if changed from worksheet item)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Process UUID (if changed from worksheet item)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  processId?: string;

  @ApiProperty({
    example: 30,
    description: 'Target output for this worker in this hour',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  targetOutput?: number;

  @ApiProperty({
    example: 'VT',
    description: 'Optional note for this entry',
    required: false,
  })
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpsertHourOutputsDto {
  @ApiProperty({
    type: [HourOutputEntryDto],
    description: 'Array of hour output entries',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HourOutputEntryDto)
  entries: HourOutputEntryDto[];
}