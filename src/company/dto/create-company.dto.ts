import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsEmail,
  IsBoolean,
  IsUrl,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CompanyType, BusinessSector } from '@prisma/client';

export class CreateCompanyDto {
  @ApiProperty({ example: 'TBS_AN_GIANG' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'TBS An Giang' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: CompanyType, default: CompanyType.SUBSIDIARY })
  @IsEnum(CompanyType)
  type: CompanyType;

  @ApiPropertyOptional({ description: 'Parent company ID for hierarchy' })
  @IsString()
  @IsOptional()
  parentCompanyId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  regionId?: string;

  @ApiPropertyOptional({ enum: BusinessSector })
  @IsEnum(BusinessSector)
  @IsOptional()
  sector?: BusinessSector;

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
