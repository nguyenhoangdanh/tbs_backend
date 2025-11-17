import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OfficeType } from '@prisma/client';

export class CreateOfficeDto {
  @ApiProperty({ description: 'Office name', example: 'Văn phòng Hà Nội' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Office type',
    enum: OfficeType,
    example: OfficeType.HEAD_OFFICE,
  })
  @IsEnum(OfficeType)
  type: OfficeType;

  @ApiProperty({ description: 'Office description', required: false })
  @IsString()
  @IsOptional()
  description?: string;
}
