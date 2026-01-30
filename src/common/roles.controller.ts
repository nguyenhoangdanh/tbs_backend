import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRoleDto, AssignRolesToUserDto, AssignUsersToRoleDto } from './dto/role.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Roles Management')
@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Roles('SUPERADMIN', 'ADMIN')
  @ApiOperation({ summary: 'Get all roles' })
  async getAllRoles(
    @Query('includeInactive') includeInactive?: string,
    @Query('includePermissions') includePermissions?: string,
    @Query('includeUserCount') includeUserCount?: string,
  ) {
    return this.rolesService.getAllRoles(
      includeInactive === 'true',
      includePermissions === 'true',
      includeUserCount === 'true',
    );
  }

  @Get(':id')
  @Roles('SUPERADMIN', 'ADMIN')
  @ApiOperation({ summary: 'Get role by ID' })
  async getRoleById(@Param('id') id: string) {
    return this.rolesService.getRoleById(id);
  }

  @Post()
  @Roles('SUPERADMIN')
  @ApiOperation({ summary: 'Create new role' })
  async createRole(@Body() dto: CreateRoleDto) {
    return this.rolesService.createRole(dto);
  }

  @Put(':id')
  @Roles('SUPERADMIN')
  @ApiOperation({ summary: 'Update role' })
  async updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.updateRole(id, dto);
  }

  @Delete(':id')
  @Roles('SUPERADMIN')
  @ApiOperation({ summary: 'Delete role' })
  async deleteRole(@Param('id') id: string) {
    return this.rolesService.deleteRole(id);
  }

  @Put(':id/permissions')
  @Roles('SUPERADMIN')
  @ApiOperation({ summary: 'Assign permissions to role' })
  async assignPermissions(
    @Param('id') id: string,
    @Body() body: { permissionIds: string[] },
  ) {
    return this.rolesService.assignPermissionsToRole(id, body.permissionIds);
  }

  @Get(':id/users')
  @Roles('SUPERADMIN', 'ADMIN')
  @ApiOperation({ summary: 'Get users assigned to role' })
  async getUsersByRole(@Param('id') id: string) {
    return this.rolesService.getUsersByRole(id);
  }

  @Post(':id/users')
  @Roles('SUPERADMIN')
  @ApiOperation({ summary: 'Assign users to role' })
  async assignUsersToRole(
    @Param('id') id: string,
    @Body() dto: AssignUsersToRoleDto,
  ) {
    return this.rolesService.assignUsersToRole(id, dto);
  }

  @Delete(':roleId/users/:userId')
  @Roles('SUPERADMIN')
  @ApiOperation({ summary: 'Remove user from role' })
  async removeUserFromRole(
    @Param('roleId') roleId: string,
    @Param('userId') userId: string,
  ) {
    return this.rolesService.removeUserFromRole(roleId, userId);
  }

  @Put('users/:userId/roles')
  @Roles('SUPERADMIN')
  @ApiOperation({ summary: 'Assign roles to user (replace all)' })
  async assignRolesToUser(
    @Param('userId') userId: string,
    @Body() dto: AssignRolesToUserDto,
  ) {
    return this.rolesService.assignRolesToUser(userId, dto);
  }

  @Get('users/:userId/roles')
  @Roles('SUPERADMIN', 'ADMIN')
  @ApiOperation({ summary: 'Get roles assigned to user' })
  async getUserRoles(@Param('userId') userId: string) {
    return this.rolesService.getUserRoles(userId);
  }
}
