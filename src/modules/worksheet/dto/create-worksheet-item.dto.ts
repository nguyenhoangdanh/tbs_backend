import { IsUUID, IsOptional, IsInt, IsPositive, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWorksheetItemDto {
  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Worksheet UUID',
  })
  @IsUUID()
  worksheetId: string;

  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Worker (User) UUID',
  })
  @IsUUID()
  workerId: string;

  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Product UUID',
  })
  @IsUUID()
  productId: string;

  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Process UUID',
  })
  @IsUUID()
  processId: string;

  @ApiProperty({
    example: 15,
    description: 'Individual target output per hour for this worker (optional)',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  targetOutputPerHour?: number;

  @ApiProperty({
    example: true,
    description: 'Whether this worksheet item is active',
    required: false,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateWorksheetItemDto {
  @ApiProperty({
    example: 15,
    description: 'Individual target output per hour for this worker',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  targetOutputPerHour?: number;

  @ApiProperty({
    example: true,
    description: 'Whether this worksheet item is active',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}