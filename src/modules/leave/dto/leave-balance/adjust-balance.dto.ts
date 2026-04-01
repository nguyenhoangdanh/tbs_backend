import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class AdjustBalanceDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  leaveTypeId: string;

  @IsNumber()
  year: number;

  @IsNumber()
  adjustedDelta: number; // dương = thêm, âm = trừ

  @IsOptional()
  @IsString()
  note?: string;
}
