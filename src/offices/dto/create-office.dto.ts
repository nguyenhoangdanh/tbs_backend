import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { OfficeType } from '@prisma/client';

export class CreateOfficeDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(OfficeType)
  type: OfficeType;

  @IsString()
  @IsOptional()
  description?: string;
}
