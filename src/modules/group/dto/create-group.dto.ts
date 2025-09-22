import { IsString, IsNotEmpty, IsUUID, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateGroupDto {
  @ApiProperty({
    example: 'Nhóm 1',
    description: 'Group name',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: 'GROUP_01',
    description: 'Group code (unique within team)',
  })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({
    example: 'Nhóm 1 - Nhóm sản xuất chính',
    description: 'Group description',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Team UUID',
  })
  @IsUUID()
  @IsNotEmpty()
  teamId: string;

  // @ApiProperty({
  //   example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  //   description: 'Group leader UUID',
  //   required: false,
  // })
  // @IsUUID()
  // @IsOptional()
  // leaderId?: string;
}
