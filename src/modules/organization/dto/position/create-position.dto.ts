import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsBoolean,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePositionDto {
  @ApiProperty({ description: 'Position name', example: 'Giám đốc' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Position description', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'Position level', example: 1, default: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  level?: number;

  @ApiProperty({ description: 'Position priority', example: 1, default: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  priority?: number;

  @ApiProperty({
    description: 'Is management position',
    example: true,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  isManagement?: boolean;

  @ApiProperty({
    description: 'Is reportable position',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isReportable?: boolean;

  @ApiProperty({
    description: 'Can view hierarchy',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  canViewHierarchy?: boolean;
}
