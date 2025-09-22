import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProcessDto {
  @ApiProperty({
    example: 'Cắt chặt vải',
    description: 'Process name',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: 'CD-01',
    description: 'Process code (unique)',
  })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({
    example: 'Công đoạn cắt chặt vải theo pattern',
    description: 'Process description',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;
}
