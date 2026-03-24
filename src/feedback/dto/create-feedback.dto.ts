import { IsNotEmpty, IsString, MaxLength, IsInt, Min, Max, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

  @ApiPropertyOptional({
    description: 'Mức độ hài lòng (1-5 sao)',
    example: 4,
    minimum: 1,
    maximum: 5,
  })
  @IsOptional()
  @IsInt({ message: 'Đánh giá phải là số nguyên' })
  @Min(1, { message: 'Đánh giá tối thiểu là 1 sao' })
  @Max(5, { message: 'Đánh giá tối đa là 5 sao' })
  rating?: number;
}
