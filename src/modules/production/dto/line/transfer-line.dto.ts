import { IsUUID, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TransferLineDto {
  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Target factory UUID to transfer line to',
  })
  @IsUUID()
  @IsNotEmpty()
  targetFactoryId: string;

  @ApiProperty({
    example: 'LINE_02',
    description: 'New line code (optional, keep current if not provided)',
    required: false,
  })
  @IsString()
  @IsOptional()
  newCode?: string;
}
