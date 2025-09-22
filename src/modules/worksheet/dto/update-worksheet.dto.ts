import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsInt, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CreateWorksheetDto } from './create-worksheet.dto';
import { WorkSheetStatus } from '@prisma/client';

export class UpdateWorksheetDto extends PartialType(CreateWorksheetDto) {
  @ApiProperty({
    example: 'COMPLETED',
    description: 'Worksheet status',
    enum: WorkSheetStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(WorkSheetStatus)
  status?: WorkSheetStatus;

  @ApiProperty({
    example: 20,
    description: 'Updated total workers count',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  totalWorkers?: number;
}
