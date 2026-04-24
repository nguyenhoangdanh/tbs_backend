import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  Length,
  IsDateString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Sex } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({ example: 'EMP001', description: 'Employee code' })
  @IsString()
  @IsNotEmpty()
  employeeCode: string;

  @ApiProperty({ example: 'user@company.com', required: false })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: '012345678901', required: false })
  @IsString()
  @IsOptional()
  @Length(10, 12, { message: 'Phone number must be between 10 and 12 digits' })
  phone?: string;

  @ApiProperty({ required: false, description: 'Date of birth (ISO string, e.g. 1990-01-15)' })
  @IsDateString()
  @IsOptional()
  dateOfBirth?: string;

  @ApiProperty({ required: false, description: 'Join date (ISO string, e.g. 2020-06-01)' })
  @IsDateString()
  @IsOptional()
  joinDate?: string;

  @ApiProperty({ required: false, enum: Sex })
  @IsOptional()
  @IsEnum(Sex)
  sex?: Sex;

  @ApiProperty({ example: 'USER', description: 'User role code (deprecated — use roleIds)', type: String })
  @IsString()
  @IsOptional()
  role?: string;

  @ApiProperty({ example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' })
  @IsUUID()
  @IsNotEmpty()
  jobPositionId: string;

  @ApiProperty({ example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' })
  @IsUUID()
  @IsNotEmpty()
  officeId: string;

  @ApiProperty({ required: false, description: 'Password (default: Abcd123@)' })
  @IsString()
  @IsOptional()
  password?: string;
}
