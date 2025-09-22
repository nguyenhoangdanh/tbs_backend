import { IsEnum, IsOptional, IsArray, ValidateNested, IsUUID, IsInt, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { WorkRecordStatus } from '@prisma/client';

export class ItemRecordUpdateDto {
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
  @Min(1)
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
    example: 'Worker completed early due to machine efficiency',
    description: 'Notes about this record',
    required: false,
  })
  @IsOptional()
  @IsString()
  note?: string;
}

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
    type: [ItemRecordUpdateDto],
    description: 'Array of item record updates',
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemRecordUpdateDto)
  itemRecords?: ItemRecordUpdateDto[];
}
