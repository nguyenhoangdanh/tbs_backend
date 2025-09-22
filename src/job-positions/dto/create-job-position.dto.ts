import { IsString, IsUUID, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateJobPositionDto {
  @ApiProperty({ description: 'Job name', example: 'Phát triển phần mềm' })
  @IsString()
  jobName: string;

  @ApiProperty({ description: 'Job description', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Position ID' })
  @IsUUID()
  positionId: string;

  @ApiProperty({ description: 'Department ID' })
  @IsUUID()
  departmentId: string;

  @ApiProperty({ description: 'Office ID' })
  @IsUUID()
  officeId: string;

  @ApiProperty({ description: 'Is active', default: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
