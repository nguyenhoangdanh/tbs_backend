import { IsString, IsNotEmpty, IsUUID, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateFactoryDto {
  @ApiProperty({
    example: 'Nhà máy TS1',
    description: 'Factory name',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: 'TS1',
    description: 'Factory code (unique)',
  })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({
    example: 'Nhà máy sản xuất túi xách TS1',
    description: 'Factory description',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Office UUID that owns this factory',
  })
  @IsUUID()
  @IsNotEmpty()
  officeId: string;
}
