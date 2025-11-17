import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CreateLineDto } from './create-line.dto';

export class UpdateLineDto extends PartialType(CreateLineDto) {
  @ApiProperty({
    example: true,
    description: 'Line active status',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
