import { IsArray, IsEnum, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum CauseType {
  MATERIALS = 'MATERIALS',   // VT = Vật tư
  TECHNOLOGY = 'TECHNOLOGY', // CN = Công nghệ (quy trình)
  QUALITY = 'QUALITY',       // CL = Chất lượng
  MACHINERY = 'MACHINERY',   // MM = Máy móc - thiết bị
  OTHER = 'OTHER'
}

export class RecordCauseDto {
  @ApiProperty({
    example: 'MATERIALS',
    description: 'Type of cause affecting production',
    enum: CauseType,
  })
  @IsEnum(CauseType)
  cause: CauseType;

  @ApiProperty({
    example: -5,
    description: 'Positive or negative impact on output',
  })
  @IsInt()
  delta: number;

  @ApiProperty({
    example: 'Material shortage caused delay',
    description: 'Optional note about the cause',
    required: false,
  })
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpsertRecordCausesDto {
  @ApiProperty({
    type: [RecordCauseDto],
    description: 'Array of causes affecting this record',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecordCauseDto)
  causes: RecordCauseDto[];
}