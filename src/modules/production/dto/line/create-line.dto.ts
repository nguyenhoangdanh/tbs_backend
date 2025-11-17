import { IsString, IsNotEmpty, IsUUID, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateLineDto {
  @ApiProperty({
    example: 'Line 1',
    description: 'Line name',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: 'LINE_01',
    description: 'Line code (unique within factory)',
  })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({
    example: 'Line 1 - Main production line',
    description: 'Line description',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Factory UUID',
  })
  @IsUUID()
  @IsNotEmpty()
  factoryId: string;
}
