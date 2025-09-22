import {
  IsInt,
  IsOptional,
  IsBoolean,
  IsString,
  IsArray,
  ValidateNested,
  Min,
  Max,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTaskDto {
  @ApiProperty({ description: 'Tên công việc' })
  @IsString()
  @IsNotEmpty({ message: 'Tên công việc không được để trống' })
  taskName: string;

  @ApiPropertyOptional({ description: 'Làm việc thứ Hai' })
  @IsOptional()
  @IsBoolean()
  monday?: boolean;

  @ApiPropertyOptional({ description: 'Làm việc thứ Ba' })
  @IsOptional()
  @IsBoolean()
  tuesday?: boolean;

  @ApiPropertyOptional({ description: 'Làm việc thứ Tư' })
  @IsOptional()
  @IsBoolean()
  wednesday?: boolean;

  @ApiPropertyOptional({ description: 'Làm việc thứ Năm' })
  @IsOptional()
  @IsBoolean()
  thursday?: boolean;

  @ApiPropertyOptional({ description: 'Làm việc thứ Sáu' })
  @IsOptional()
  @IsBoolean()
  friday?: boolean;

  @ApiPropertyOptional({ description: 'Làm việc thứ Bảy' })
  @IsOptional()
  @IsBoolean()
  saturday?: boolean;

  @ApiPropertyOptional({ description: 'Công việc đã hoàn thành' })
  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;

  @ApiPropertyOptional({ description: 'Lý do chưa hoàn thành' })
  @IsOptional()
  @IsString()
  reasonNotDone?: string;
}

export class CreateWeeklyReportDto {
  @ApiProperty({ description: 'Số tuần', minimum: 1, maximum: 53 })
  @IsInt()
  @Min(1)
  @Max(53)
  weekNumber: number;

  @ApiProperty({ description: 'Năm', minimum: 2020, maximum: 2030 })
  @IsInt()
  @Min(2020)
  @Max(2030)
  year: number;

  @ApiProperty({ description: 'Danh sách công việc', type: [CreateTaskDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTaskDto)
  tasks: CreateTaskDto[];
}
