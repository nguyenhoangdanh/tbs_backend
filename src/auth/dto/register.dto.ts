import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsOptional,
  IsUUID,
  MinLength,
  Length,
  IsEnum,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum UserRole {
  SUPERADMIN = 'SUPERADMIN',
  ADMIN = 'ADMIN',
  USER = 'USER',
  WORKER = 'WORKER',
  MEDICAL_STAFF = 'MEDICAL_STAFF',
}

export class RegisterDto {
  @ApiProperty({
    example: 'EMP001',
    description: 'Employee code',
  })
  @IsString()
  @IsNotEmpty()
  employeeCode: string;

  @ApiProperty({
    example: 'user@company.com',
    description: 'User email address',
    required: false,
  })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({
    example: 'password123',
    description: 'User password',
    minLength: 6,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiProperty({
    example: 'John',
    description: 'User first name',
  })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({
    example: 'Doe',
    description: 'User last name',
  })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({
    example: '012345678901',
    description: 'Phone number',
    required: false,
  })
  @IsString()
  @IsOptional()
  @Length(10, 12, { message: 'Phone number must be between 10 and 12 digits' })
  phone?: string;

  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Job position UUID',
  })
  @IsUUID()
  @IsNotEmpty()
  jobPositionId: string;

  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Office UUID where user belongs',
  })
  @IsUUID()
  @IsNotEmpty()
  officeId: string;

  @ApiProperty({
    example: 'User role',
    description: 'User role',
    required: false,
    default: 'USER',
  })
  @IsEnum(UserRole)
  role: UserRole = UserRole.USER;
}
