import { IsString, IsOptional, IsBoolean, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRoleDto {
  @ApiProperty({ example: 'TEAM_LEADER' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'TEAM_LEADER' })
  @IsString()
  code: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ default: false, required: false })
  @IsOptional()
  @IsBoolean()
  isSystem?: boolean;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  permissionIds?: string[];
}

export class UpdateRoleDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  permissionIds?: string[];
}

export class AssignRolesToUserDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  roleDefinitionIds: string[];
}

export class AssignUsersToRoleDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  userIds: string[];
}
