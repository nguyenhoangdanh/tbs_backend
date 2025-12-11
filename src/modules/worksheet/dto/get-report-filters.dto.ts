import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for filtering worksheets for report export
 * Supports hierarchical filtering: Factory → Line → Team → Group
 */
export class GetReportFiltersDto {
  @ApiProperty({
    example: '2025-02-10',
    description: 'Date for the report (YYYY-MM-DD)',
  })
  @IsDateString()
  date: string;

  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Office UUID (optional - filter by office)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  officeId?: string;

  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Department UUID (optional - filter by department)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Team UUID (optional - filter by team)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  teamId?: string;

  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Group UUID (optional - filter by group)',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  groupId?: string;
}
