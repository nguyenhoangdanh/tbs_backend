import { IsNotEmpty, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({
    example: 'EMP001',
    description: 'Employee code',
  })
  @IsString()
  @IsNotEmpty()
  employeeCode: string;

  @ApiProperty({
    example: '012345678901',
    description: 'Phone number',
  })
  @IsString()
  @IsNotEmpty()
  @Length(10, 12, {
    message: 'Phone number must be between 10 and 12 digits',
  })
  phone: string;
}
