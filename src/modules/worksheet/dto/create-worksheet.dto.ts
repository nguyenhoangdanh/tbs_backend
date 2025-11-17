import { IsUUID, IsDateString, IsEnum, IsOptional, IsInt, IsPositive, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ShiftType } from '@prisma/client';

/**
 * DTO for creating worksheet(s) for a group
 * When groupId is provided, creates worksheets for all workers in that group
 * When workerIds is provided, creates worksheets only for specified workers
 */
export class CreateWorksheetDto {
  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Group UUID - creates worksheets for all members in group',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiProperty({
    example: ['uuid1', 'uuid2'],
    description: 'Array of worker UUIDs - creates worksheets for specific workers',
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  workerIds?: string[];

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
    description: 'Product UUID (mã túi xách)',
  })
  @IsUUID()
  productId: string;

  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Process UUID (công đoạn: chặt, lạng, dán,...)',
  })
  @IsUUID()
  processId: string;

  @ApiProperty({
    example: 180,
    description: 'SLKH - Sản lượng kế hoạch/giờ (planned output per hour per worker)',
  })
  @IsInt()
  @IsPositive()
  plannedOutput: number;
}
