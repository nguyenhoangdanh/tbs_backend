import { IsUUID, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignLeaderDto {
  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'User UUID to assign as group leader',
  })
  @IsUUID()
  @IsNotEmpty()
  leaderId: string;
}
