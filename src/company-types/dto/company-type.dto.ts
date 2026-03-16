import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/swagger';

export class CreateCompanyTypeDto {
  @ApiProperty({ example: 'NGANH' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'Ngành' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 1, description: '0=top (Tập đoàn), higher=deeper' })
  @IsInt()
  @Min(0)
  level: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateCompanyTypeDto extends PartialType(CreateCompanyTypeDto) {}
