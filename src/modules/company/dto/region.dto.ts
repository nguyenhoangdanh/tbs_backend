import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/swagger';

export class CreateRegionDto {
  @ApiProperty({ example: 'AN_GIANG' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'An Giang' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateRegionDto extends PartialType(CreateRegionDto) {}
