import { IsInt, IsPositive, IsOptional, Min, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateProductProcessDto {
  @ApiProperty({
    example: 50,
    description: 'Standard output per hour for this product-process combination',
    required: false,
  })
  @IsInt()
  @IsPositive()
  @IsOptional()
  standardOutputPerHour?: number;

  @ApiProperty({
    example: 2,
    description: 'Sequence number in production flow (must be unique within product)',
    required: false,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  sequence?: number;

  @ApiProperty({
    example: true,
    description: 'Whether this product-process relationship is active',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
