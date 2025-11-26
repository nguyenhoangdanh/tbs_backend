import { IsUUID, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TransferGroupDto {
  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Target team UUID to transfer group to',
  })
  @IsUUID()
  @IsNotEmpty()
  targetTeamId: string;

  @ApiProperty({
    example: 'GROUP_02',
    description: 'New group code (optional, keep current if not provided)',
    required: false,
  })
  @IsString()
  @IsOptional()
  newCode?: string;
}
