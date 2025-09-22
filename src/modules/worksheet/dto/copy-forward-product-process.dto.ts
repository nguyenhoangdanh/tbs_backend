import { IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CopyForwardProductProcessDto {
  @ApiProperty({
    example: 3,
    description: 'Source work hour to copy from (1-11)',
  })
  @IsInt()
  @Min(1)
  @Max(11)
  fromHour: number;

  @ApiProperty({
    example: 4,
    description: 'Start of target hour range to copy to (1-11)',
  })
  @IsInt()
  @Min(1)
  @Max(11)
  toHourStart: number;

  @ApiProperty({
    example: 8,
    description: 'End of target hour range to copy to (1-11)',
  })
  @IsInt()
  @Min(1)
  @Max(11)
  toHourEnd: number;
}