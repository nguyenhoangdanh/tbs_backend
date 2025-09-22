import { IsArray, ValidateNested, IsUUID, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { WorkRecordStatus } from '@prisma/client';
import { ItemRecordUpdateDto } from './update-worksheet-record.dto';

export class BatchRecordUpdateDto {
  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'WorkSheetRecord UUID',
  })
  @IsUUID()
  recordId: string;

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

export class BatchUpdateRecordsDto {
  @ApiProperty({
    type: [BatchRecordUpdateDto],
    description: 'Array of record updates to process',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchRecordUpdateDto)
  records: BatchRecordUpdateDto[];
}
