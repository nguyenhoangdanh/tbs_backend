import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class LoginDto {
  @ApiProperty({
    example: '00000001',
    description: 'Employee code (MSNV - numeric) or email prefix (letters only)',
    minLength: 1,
    maxLength: 50,
    examples: {
      'MSNV (numeric)': {
        value: '552502356',
        description: 'Login with employee code (all digits)'
      },
      'Email Prefix (letters)': {
        value: 'danhnh',
        description: 'Login with email prefix (letters/alphanumeric, 2-20 chars)'
      }
    }
  })
  @IsString()
  @IsNotEmpty({ message: 'Employee code or email prefix is required' })
  @Transform(({ value }) => value?.toString().trim())
  employeeCode: string;

  @ApiProperty({
    example: 'admin123456',
    description: 'Password',
    minLength: 1,
  })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(1, { message: 'Password cannot be empty' })
  password: string;

  @ApiProperty({
    description: 'Remember me option - false: 7 days, true: 30 days',
    example: true,
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
