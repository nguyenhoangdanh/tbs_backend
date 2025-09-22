import { IsEnum, IsString, IsOptional, IsDateString, IsNotEmpty, ValidateIf, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { GatePassReason } from '@prisma/client';
import { Transform } from 'class-transformer';

export class CreateGatePassDto {
  @ApiProperty({
    description: 'Lý do xin ra vào cổng',
    enum: GatePassReason,
    example: 'BUSINESS',
  })
  @IsEnum(GatePassReason)
  @IsNotEmpty()
  reasonType: GatePassReason;

  @ApiProperty({
    description: 'Lý do chi tiết (nếu chọn OTHER)',
    required: false,
    example: 'Đi khám bệnh định kỳ',
  })
  @IsString()
  @IsOptional()
  reasonDetail?: string;

  @ApiProperty({
    description: 'Thời gian ra (từ) - định dạng: YYYY-MM-DDTHH:mm:ss.sssZ',
    example: '2024-01-15T14:00:00.000Z',
  })
  @IsDateString()
  @IsNotEmpty()
  startDateTime: string;

  @ApiProperty({
    description: 'Thời gian vào (đến) - định dạng: YYYY-MM-DDTHH:mm:ss.sssZ',
    example: '2024-01-15T16:30:00.000Z',
  })
  @IsDateString()
  @IsNotEmpty()
  endDateTime: string;
}

export class CreateGatePassFlexibleDto {
  @ApiProperty({
    description: 'Lý do xin ra vào cổng',
    enum: GatePassReason,
    example: 'BUSINESS',
  })
  @IsEnum(GatePassReason)
  @IsNotEmpty()
  reasonType: GatePassReason;

  @ApiProperty({
    description: 'Lý do chi tiết (nếu chọn OTHER)',
    required: false,
    example: 'Đi khám bệnh định kỳ',
  })
  @IsString()
  @IsOptional()
  reasonDetail?: string;


  @ApiProperty({
    description: 'Ngày ra vào (YYYY-MM-DD). Nếu không điền sẽ lấy ngày hiện tại',
    required: false,
    example: '2024-01-15',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date must be in YYYY-MM-DD format' })
  @IsOptional()
  date?: string;

  @ApiProperty({
    description: 'Giờ ra (HH:mm)',
    example: '14:00',
  })
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, { message: 'Start time must be in HH:mm format' })
  @IsNotEmpty()
  startTime: string;

  @ApiProperty({
    description: 'Giờ vào (HH:mm)',
    example: '16:30',
  })
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, { message: 'End time must be in HH:mm format' })
  @IsNotEmpty()
  endTime: string;

  @ApiProperty({
    description: 'Có phải xin ra cả ngày không? (true: cả ngày, false: theo giờ)',
    default: false,
    required: false,
  })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsOptional()
  isFullDay?: boolean = false;
}