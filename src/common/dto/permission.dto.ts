import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsUUID,
  IsArray,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

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

export class BulkCreatePermissionsDto {
  @ApiProperty({ type: [CreatePermissionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePermissionDto)
  permissions: CreatePermissionDto[];
}

export class BulkDeletePermissionsDto {
  @ApiProperty({ example: ['uuid1', 'uuid2'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ids: string[];
}
