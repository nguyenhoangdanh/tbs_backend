import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class UserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  employeeCode: string;

  @ApiProperty({ required: false })
  email?: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty({ required: false })
  phone?: string;

  @ApiProperty({ enum: Role })
  role: Role;

  @ApiProperty()
  officeId: string;

  @ApiProperty()
  jobPositionId: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;

  @ApiProperty({ required: false })
  office?: any;

  @ApiProperty({ required: false })
  jobPosition?: any;
}

export class AuthResponseDto {
  @ApiProperty()
  access_token: string;

  @ApiProperty({ required: false, description: 'Refresh token (optional for cookie mode)' })
  refresh_token?: string;

  @ApiProperty({ type: UserResponseDto })
  user: any;

  @ApiProperty()
  message: string;

  // iOS/Mac specific fields
  @ApiProperty({ required: false, description: 'Access token for iOS/Mac token mode' })
  accessToken?: string;

  @ApiProperty({ required: false, description: 'Refresh token for iOS/Mac token mode' })
  refreshToken?: string;

  @ApiProperty({ required: false, description: 'iOS device detected flag' })
  iosDetected?: boolean;

  @ApiProperty({ required: false, description: 'Fallback token for iOS' })
  fallbackToken?: string;

  @ApiProperty({ required: false, description: 'Device information' })
  deviceInfo?: any;
}
