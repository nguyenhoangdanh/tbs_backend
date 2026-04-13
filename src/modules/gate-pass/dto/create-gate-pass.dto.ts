import { IsString, IsDateString, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { GatePassReason } from '@prisma/client';

export class CreateGatePassDto {
  @IsEnum(GatePassReason)
  reasonType: GatePassReason;

  @IsOptional()
  @IsString()
  reasonDetail?: string;

  @IsDateString()
  startDateTime: string;

  @IsOptional()
  @IsDateString()
  endDateTime?: string;

  @IsOptional()
  @IsBoolean()
  draft?: boolean;
}
