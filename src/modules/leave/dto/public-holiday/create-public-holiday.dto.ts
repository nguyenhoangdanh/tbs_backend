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
  @IsBoolean()
  isRecurring?: boolean; // frontend field — not stored (holidays recur by re-seeding each year)

  @IsOptional()
  @IsString()
  description?: string;
}
