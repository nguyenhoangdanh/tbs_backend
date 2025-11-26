import {
  IsString,
  IsOptional,
  IsUUID,
  Length,
  IsEmail,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role, Sex } from '@prisma/client';

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

  @ApiProperty({ description: 'Date of birth', required: false })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiProperty({ description: 'Address', required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ description: 'Sex', required: false, enum: Sex })
  @IsOptional()
  @IsEnum(Sex)
  sex?: Sex;

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

  @ApiProperty({ description: 'Avatar', required: false })
  @IsOptional()
  @IsString()
  avatar?: string;
}
