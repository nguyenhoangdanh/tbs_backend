import { IsString, IsBoolean, IsOptional, IsDateString, IsUUID } from 'class-validator';

export class CreatePublicHolidayDto {
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsString()
  name: string;

  @IsDateString()
  date: string; // YYYY-MM-DD

  @IsOptional()
  @IsBoolean()
  isLunar?: boolean;

  @IsOptional()
  @IsString()
  description?: string;
}
