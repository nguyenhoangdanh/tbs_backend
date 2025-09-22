import { IsUUID, IsDateString, IsEnum, IsOptional, IsInt, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ShiftType } from '@prisma/client';

export class CreateWorksheetDto {
  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Group UUID for this worksheet',
  })
  @IsUUID()
  groupId: string;

  @ApiProperty({
    example: '2024-01-15',
    description: 'Date for this worksheet (YYYY-MM-DD)',
  })
  @IsDateString()
  date: string;

  @ApiProperty({
    example: 'NORMAL_8H',
    description: 'Type of work shift',
    enum: ShiftType,
  })
  @IsEnum(ShiftType)
  shiftType: ShiftType;

  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Product UUID for this worksheet',
  })
  @IsUUID()
  productId: string;

  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Process UUID for this worksheet',
  })
  @IsUUID()
  processId: string;

  @ApiProperty({
    example: 45,
    description: 'Override target output per hour (optional)',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  targetOutputPerHour?: number;
}
