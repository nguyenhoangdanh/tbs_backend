import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CreateFactoryDto } from './create-factory.dto';

export class UpdateFactoryDto extends PartialType(CreateFactoryDto) {
  @ApiProperty({
    example: true,
    description: 'Factory active status',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
