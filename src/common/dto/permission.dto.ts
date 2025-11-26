import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsUUID,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class CreatePermissionDto {
  @ApiProperty({ example: 'users' })
  @IsString()
  @IsNotEmpty()
  resource: string;

  @ApiProperty({ example: 'create' })
  @IsString()
  @IsNotEmpty()
  action: string;

  @ApiProperty({ example: 'Create new users', required: false })
  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdatePermissionDto {
  @ApiProperty({ example: 'users', required: false })
  @IsString()
  @IsOptional()
  resource?: string;

  @ApiProperty({ example: 'create', required: false })
  @IsString()
  @IsOptional()
  action?: string;

  @ApiProperty({ example: 'Create new users', required: false })
  @IsString()
  @IsOptional()
  description?: string;
}

export class AssignRolePermissionDto {
  @ApiProperty({ example: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  permissionId: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  @IsOptional()
  isGranted?: boolean;
}

export class AssignUserPermissionDto {
  @ApiProperty({ example: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  permissionId: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  @IsOptional()
  isGranted?: boolean;
}

export class BulkUpdateRolePermissionsDto {
  @ApiProperty({ example: ['uuid1', 'uuid2'] })
  @IsUUID('4', { each: true })
  @IsNotEmpty()
  permissionIds: string[];
}
