import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  Length,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class CreateUserDto {
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
    description: 'User phone number',
    required: false,
  })
  @IsString()
  @IsOptional()
  @Length(10, 12, { message: 'Phone number must be between 10 and 12 digits' })
  phone?: string;

  @ApiProperty({
    example: 'USER',
    description: 'User role',
    enum: Role,
  })
  @IsEnum(Role)
  @IsOptional()
  role?: Role;

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
}
