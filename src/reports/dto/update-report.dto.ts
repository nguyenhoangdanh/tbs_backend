import {
  IsOptional,
  IsBoolean,
  IsString,
  IsArray,
  ValidateNested,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTaskDto {
  @ApiPropertyOptional({ description: 'Tên công việc' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Tên công việc không được để trống' })
  taskName?: string;

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

export class UpdateReportDto {
  @ApiPropertyOptional({ description: 'Báo cáo đã hoàn thành' })
  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;

  @ApiPropertyOptional({
    description: 'Danh sách công việc',
    type: [UpdateTaskDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateTaskDto)
  tasks?: UpdateTaskDto[];

  @ApiPropertyOptional({ description: 'Cập nhật thời gian' })
  @IsOptional()
  @IsBoolean()
  updatedAt?: boolean;
}
