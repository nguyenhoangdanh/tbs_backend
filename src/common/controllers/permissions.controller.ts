import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '@prisma/client';
import {
  CreatePermissionDto,
  UpdatePermissionDto,
  AssignRolePermissionDto,
  AssignUserPermissionDto,
  BulkUpdateRolePermissionsDto,
} from '../dto/permission.dto';
import { PermissionsService } from '../permissions.service'; // ⭐ ADD: import permissions service

@ApiTags('permissions')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  // ========== PERMISSIONS CRUD ==========

  @Get()
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Get all permissions (SUPERADMIN/ADMIN)' })
  @ApiResponse({
    status: 200,
    description: 'Permissions retrieved successfully',
  })
  async getAllPermissions() {
    return this.permissionsService.getAllPermissions();
  }

  @Get(':id')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Get permission by ID (SUPERADMIN/ADMIN)' })
  @ApiResponse({
    status: 200,
    description: 'Permission retrieved successfully',
  })
  async getPermissionById(@Param('id', ParseUUIDPipe) id: string) {
    return this.permissionsService.getPermissionById(id);
  }

  @Post()
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Create new permission (SUPERADMIN only)' })
  @ApiResponse({ status: 201, description: 'Permission created successfully' })
  async createPermission(@Body() dto: CreatePermissionDto) {
    return this.permissionsService.createPermission(dto);
  }

  @Put(':id')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Update permission (SUPERADMIN only)' })
  @ApiResponse({ status: 200, description: 'Permission updated successfully' })
  async updatePermission(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePermissionDto,
  ) {
    return this.permissionsService.updatePermission(id, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Delete permission (SUPERADMIN only)' })
  @ApiResponse({ status: 200, description: 'Permission deleted successfully' })
  async deletePermission(@Param('id', ParseUUIDPipe) id: string) {
    return this.permissionsService.deletePermission(id);
  }

  // ========== ROLES ==========

  @Get('roles/all')
  @ApiOperation({ summary: 'Get all roles' })
  @ApiResponse({ status: 200, description: 'Roles retrieved successfully' })
  async getAllRoles() {
    return this.permissionsService.getAllRoles();
  }

  @Get('roles/:role')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Get role with permissions (SUPERADMIN/ADMIN)' })
  @ApiResponse({ status: 200, description: 'Role retrieved successfully' })
  async getRoleWithPermissions(@Param('role') role: Role) {
    return this.permissionsService.getRoleWithPermissions(role);
  }

  @Get('roles/:role/permissions')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Get role permissions (SUPERADMIN/ADMIN)' })
  @ApiResponse({
    status: 200,
    description: 'Role permissions retrieved successfully',
  })
  async getRolePermissions(@Param('role') role: Role) {
    return this.permissionsService.getRolePermissions(role);
  }

  @Post('roles/:role/permissions')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Assign permission to role (SUPERADMIN only)' })
  @ApiResponse({ status: 201, description: 'Permission assigned successfully' })
  async assignPermissionToRole(
    @Param('role') role: Role,
    @Body() dto: AssignRolePermissionDto,
  ) {
    return this.permissionsService.assignPermissionToRole({
      role,
      permissionId: dto.permissionId,
      isGranted: dto.isGranted ?? true,
    });
  }

  @Delete('roles/:role/permissions/:permissionId')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Remove permission from role (SUPERADMIN only)' })
  @ApiResponse({ status: 200, description: 'Permission removed successfully' })
  async removePermissionFromRole(
    @Param('role') role: Role,
    @Param('permissionId', ParseUUIDPipe) permissionId: string,
  ) {
    return this.permissionsService.removePermissionFromRole(role, permissionId);
  }

  @Put('roles/:role/permissions/bulk')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Bulk update role permissions (SUPERADMIN only)' })
  @ApiResponse({
    status: 200,
    description: 'Role permissions updated successfully',
  })
  async bulkUpdateRolePermissions(
    @Param('role') role: Role,
    @Body() dto: BulkUpdateRolePermissionsDto,
  ) {
    return this.permissionsService.bulkUpdateRolePermissions(
      role,
      dto.permissionIds,
    );
  }

  // ========== USER CUSTOM PERMISSIONS ==========

  @Get('users/:userId')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Get user custom permissions (SUPERADMIN/ADMIN)' })
  @ApiResponse({
    status: 200,
    description: 'User permissions retrieved successfully',
  })
  async getUserCustomPermissions(
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.permissionsService.getUserCustomPermissions(userId);
  }

  @Post('users/:userId')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({
    summary: 'Assign custom permission to user (SUPERADMIN only)',
  })
  @ApiResponse({ status: 201, description: 'Permission assigned successfully' })
  async assignPermissionToUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: AssignUserPermissionDto,
  ) {
    return this.permissionsService.assignPermissionToUser({
      userId,
      permissionId: dto.permissionId,
      isGranted: dto.isGranted ?? true,
    });
  }

  @Delete('users/:userId/permissions/:permissionId')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({
    summary: 'Remove custom permission from user (SUPERADMIN only)',
  })
  @ApiResponse({ status: 200, description: 'Permission removed successfully' })
  async removePermissionFromUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('permissionId', ParseUUIDPipe) permissionId: string,
  ) {
    return this.permissionsService.removePermissionFromUser(
      userId,
      permissionId,
    );
  }
}
