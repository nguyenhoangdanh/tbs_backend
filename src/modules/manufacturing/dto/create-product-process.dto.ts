import { IsUUID, IsInt, IsPositive, IsOptional, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProductProcessDto {
  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Process UUID',
  })
  @IsUUID()
  processId: string;

  @ApiProperty({
    example: 45,
    description: 'Standard output per hour for this product-process combination',
  })
  @IsInt()
  @IsPositive()
  standardOutputPerHour: number;

  @ApiProperty({
    example: 1,
    description: 'Sequence number in production flow (must be unique within product, auto-assigned if not provided)',
    required: false,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  sequence?: number;
}
