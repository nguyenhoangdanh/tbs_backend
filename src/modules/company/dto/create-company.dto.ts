import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsBoolean,
  IsUrl,
  IsArray,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCompanyDto {
  @ApiProperty({ example: 'TBS_AN_GIANG' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'TBS An Giang' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'CompanyType ID' })
  @IsUUID()
  @IsNotEmpty()
  typeId: string;

  @ApiPropertyOptional({ description: 'Parent company ID for hierarchy' })
  @IsUUID()
  @IsOptional()
  parentCompanyId?: string;

  @ApiPropertyOptional({ description: 'Region ID' })
  @IsUUID()
  @IsOptional()
  regionId?: string;

  @ApiPropertyOptional({ description: 'BusinessSector IDs (many-to-many)', type: [String] })
  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  sectorIds?: string[];

  @ApiPropertyOptional({ example: '1234567890' })
  @IsString()
  @IsOptional()
  taxCode?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional()
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional()
  @IsUrl()
  @IsOptional()
  logoUrl?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
