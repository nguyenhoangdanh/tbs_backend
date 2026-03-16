import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/swagger';

export class CreateBusinessSectorDto {
  @ApiProperty({ example: 'BAGS' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'Túi xách' })
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

export class UpdateBusinessSectorDto extends PartialType(CreateBusinessSectorDto) {}
