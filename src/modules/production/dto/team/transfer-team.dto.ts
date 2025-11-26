import { IsUUID, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TransferTeamDto {
  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Target line UUID to transfer team to',
  })
  @IsUUID()
  @IsNotEmpty()
  targetLineId: string;

  @ApiProperty({
    example: 'TEAM_02',
    description: 'New team code (optional, keep current if not provided)',
    required: false,
  })
  @IsString()
  @IsOptional()
  newCode?: string;
}
