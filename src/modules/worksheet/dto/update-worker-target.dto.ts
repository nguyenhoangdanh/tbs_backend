import { IsInt, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateWorkerTargetDto {
  @ApiProperty({
    example: 15,
    description: 'New target output per hour for this worker',
    minimum: 1,
  })
  @IsInt()
  @IsPositive()
  targetOutputPerHour: number;
}