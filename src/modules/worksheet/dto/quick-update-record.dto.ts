import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for quick update by group leader (mobile app)
 * Simplified version of UpdateWorksheetRecordDto for mobile interface
 */
export class QuickUpdateRecordDto {
  @ApiProperty({ 
    description: 'SLTH - Sản lượng thực hiện (actual output)', 
    minimum: 0,
    example: 175 
  })
  @IsInt()
  @Min(0)
  actualOutput: number;

  @ApiProperty({ 
    description: 'Product ID (mã túi - nếu đổi)', 
    required: false,
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
  })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiProperty({ 
    description: 'Process ID (công đoạn - nếu đổi)', 
    required: false,
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
  })
  @IsOptional()
  @IsUUID()
  processId?: string;

  @ApiProperty({ 
    description: 'Ghi chú (VT, CN, CL, MM)', 
    required: false,
    example: 'VT thiếu'
  })
  @IsOptional()
  @IsString()
  note?: string;
}
