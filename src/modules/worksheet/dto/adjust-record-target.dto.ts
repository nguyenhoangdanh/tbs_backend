import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AdjustRecordTargetDto {
  @ApiProperty({
    example: 150,
    description: 'Expected output total for the group in this hour',
  })
  @IsInt()
  @Min(0)
  expectedOutputTotal: number;
}