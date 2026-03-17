import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { FeedbackStatus } from '@prisma/client';

export class UpdateFeedbackStatusDto {
  @ApiProperty({ enum: FeedbackStatus, example: FeedbackStatus.IN_PROGRESS })
  @IsEnum(FeedbackStatus)
  status: FeedbackStatus;
}
