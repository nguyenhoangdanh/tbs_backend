import {
  IsString,
  IsOptional,
  IsUUID,
  Length,
  IsEmail,
  IsEnum,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class UpdateProfileDto {
  @ApiProperty({ description: 'Employee code', required: false })
  @IsOptional()
  @IsString()
  employeeCode?: string;

  @ApiProperty({ description: 'First name', required: false })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiProperty({ description: 'Last name', required: false })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiProperty({
    description: 'Email address',
    required: false,
    example: 'user@company.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({
    description: 'Phone number',
    required: false,
    example: '012345678901',
  })
  @IsOptional()
  @IsString()
  @Length(10, 12, { message: 'Phone number must be between 10 and 12 digits' })
  phone?: string;

  @ApiProperty({ description: 'Job position ID', required: false })
  @IsOptional()
  @IsUUID()
  jobPositionId?: string;

  @ApiProperty({ description: 'Office ID', required: false })
  @IsOptional()
  @IsUUID()
  officeId?: string;

  @ApiProperty({ description: 'Department ID', required: false })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiProperty({ description: 'Position ID', required: false })
  @IsOptional()
  @IsUUID()
  positionId?: string;

  @ApiProperty({
    description: 'User role',
    required: false,
    enum: Role,
  })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
