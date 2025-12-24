import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateFeedbackDto {
  @ApiProperty({
    description: 'Nội dung góp ý',
    example: 'Tôi mong công ty có thể cải thiện điều kiện làm việc...',
    maxLength: 10000,
  })
  @IsString()
  @IsNotEmpty({ message: 'Nội dung góp ý không được để trống' })
  @MaxLength(10000, { message: 'Nội dung góp ý không được vượt quá 10000 ký tự' })
  content: string;
}
