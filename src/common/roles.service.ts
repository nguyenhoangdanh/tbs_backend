import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { PermissionsService } from './permissions.service';
import { CreateRoleDto, UpdateRoleDto, AssignRolesToUserDto, AssignUsersToRoleDto } from './dto/role.dto';

@Injectable()
export class RolesService {
  constructor(
    private prisma: PrismaService,
    private permissionsService: PermissionsService,
  ) {}

  /**
   * Get all role definitions
   */
  async getAllRoles(
    includeInactive = false,
    includePermissions = false,
    includeUserCount = true,
  ) {
    const where = includeInactive ? {} : { isActive: true };
    
    return this.prisma.roleDefinition.findMany({
      where,
      include: {
        _count: includeUserCount
          ? {
              select: {
                userAssignments: true,
                permissions: true,
              },
            }
          : undefined,
        permissions: includePermissions
          ? {
              where: {
                isGranted: true,  // Only include granted permissions
              },
              include: {
                permission: true,
              },
            }
          : undefined,
      },
      orderBy: [
        { isSystem: 'desc' },
        { name: 'asc' },
      ],
    });
  }

  /**
   * Get role by ID with permissions
   */
  async getRoleById(id: string) {
    const role = await this.prisma.roleDefinition.findUnique({
      where: { id },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
        userAssignments: {
          where: { isActive: true },
          include: {
            user: {
              select: {
                id: true,
                employeeCode: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        _count: {
          select: {
            userAssignments: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return role;
  }

  /**
   * Create new role
   */
  async createRole(dto: CreateRoleDto) {
    // Check if role name or code already exists
    const existing = await this.prisma.roleDefinition.findFirst({
      where: {
        OR: [
          { name: dto.name },
          { code: dto.code },
        ],
      },
    });

    if (existing) {
      throw new ConflictException('Role with this name or code already exists');
    }

    // Create role
    const role = await this.prisma.roleDefinition.create({
      data: {
        name: dto.name,
        code: dto.code,
        description: dto.description,
        isSystem: dto.isSystem || false,
      },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    // Assign permissions if provided
    if (dto.permissionIds && dto.permissionIds.length > 0) {
      await this.assignPermissionsToRole(role.id, dto.permissionIds);
    }

    return this.getRoleById(role.id);
  }

  /**
   * Update role
   */
  async updateRole(id: string, dto: UpdateRoleDto) {
    const role = await this.getRoleById(id);

    // Cannot modify system roles
    if (role.isSystem && (dto.name !== undefined)) {
      throw new BadRequestException('Cannot modify system role name');
    }

    // Update role
    const updated = await this.prisma.roleDefinition.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        isActive: dto.isActive,
      },
    });

    // Update permissions if provided
    if (dto.permissionIds !== undefined) {
      await this.assignPermissionsToRole(id, dto.permissionIds);
    }

    return this.getRoleById(id);
  }

  /**
   * Delete role (only non-system roles)
   */
  async deleteRole(id: string) {
    const role = await this.getRoleById(id);

    if (role.isSystem) {
      throw new BadRequestException('Cannot delete system role');
    }

    // Check if role has users
    if (role._count.userAssignments > 0) {
      throw new BadRequestException('Cannot delete role with assigned users. Remove all users first.');
    }

    await this.prisma.roleDefinition.delete({
      where: { id },
    });

    return { message: 'Role deleted successfully' };
  }

  /**
   * Assign permissions to role (replace all)
   */
  async assignPermissionsToRole(roleId: string, permissionIds: string[]) {
    // Verify role exists
    await this.getRoleById(roleId);

    // Delete existing permissions
    await this.prisma.roleDefinitionPermission.deleteMany({
      where: { roleDefinitionId: roleId },
    });

    // Add new permissions
    if (permissionIds.length > 0) {
      await this.prisma.roleDefinitionPermission.createMany({
        data: permissionIds.map(permissionId => ({
          roleDefinitionId: roleId,
          permissionId,
          isGranted: true,
        })),
      });
    }

    return this.getRoleById(roleId);
  }

  /**
   * Get users assigned to a role
   */
  async getUsersByRole(roleId: string) {
    await this.getRoleById(roleId);

    const userRoles = await this.prisma.userRole.findMany({
      where: { 
        roleDefinitionId: roleId,
        isActive: true,
      },
      include: {
        user: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            email: true,
            jobPosition: {
              include: {
                position: true,
                department: true,
              },
            },
          },
        },
      },
    });

    // Add permissions for each user (including roles array)
    const enrichedUserRoles = await Promise.all(
      userRoles.map(async (userRole) => {
        const permissions = await this.permissionsService.getUserPermissions(
          userRole.user.id,
        );
        return {
          ...userRole,
          user: {
            ...userRole.user,
            permissions,
          },
        };
      }),
    );

    return enrichedUserRoles;
  }

  /**
   * Assign roles to a user (replace all)
   */
  async assignRolesToUser(userId: string, dto: AssignRolesToUserDto) {
    // Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify all roles exist
    const roles = await this.prisma.roleDefinition.findMany({
      where: {
        id: { in: dto.roleDefinitionIds },
        isActive: true,
      },
    });

    if (roles.length !== dto.roleDefinitionIds.length) {
      throw new BadRequestException('One or more roles not found or inactive');
    }

    // Delete existing role assignments
    await this.prisma.userRole.deleteMany({
      where: { userId },
    });

    // Create new assignments
    if (dto.roleDefinitionIds.length > 0) {
      await this.prisma.userRole.createMany({
        data: dto.roleDefinitionIds.map(roleDefinitionId => ({
          userId,
          roleDefinitionId,
          isActive: true,
        })),
      });
    }

    return this.getUserRoles(userId);
  }

  /**
   * Get roles assigned to a user
   */
  async getUserRoles(userId: string) {
    return this.prisma.userRole.findMany({
      where: { 
        userId,
        isActive: true,
      },
      include: {
        roleDefinition: {
          include: {
            permissions: {
              where: { isGranted: true },
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Assign users to a role
   */
  async assignUsersToRole(roleId: string, dto: AssignUsersToRoleDto) {
    await this.getRoleById(roleId);

    // Verify all users exist
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: dto.userIds },
        isActive: true,
      },
    });

    if (users.length !== dto.userIds.length) {
      throw new BadRequestException('One or more users not found or inactive');
    }

    // Create assignments (skip if already exists)
    for (const userId of dto.userIds) {
      await this.prisma.userRole.upsert({
        where: {
          userId_roleDefinitionId: {
            userId,
            roleDefinitionId: roleId,
          },
        },
        create: {
          userId,
          roleDefinitionId: roleId,
          isActive: true,
        },
        update: {
          isActive: true,
        },
      });
    }

    return this.getUsersByRole(roleId);
  }

  /**
   * Remove role from user
   */
  async removeRoleFromUser(userId: string, roleId: string) {
    const assignment = await this.prisma.userRole.findUnique({
      where: {
        userId_roleDefinitionId: {
          userId,
          roleDefinitionId: roleId,
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Role assignment not found');
    }

    await this.prisma.userRole.delete({
      where: {
        userId_roleDefinitionId: {
          userId,
          roleDefinitionId: roleId,
        },
      },
    });

    return { message: 'Role removed from user successfully' };
  }

  /**
   * Remove user from role
   */
  async removeUserFromRole(roleId: string, userId: string) {
    return this.removeRoleFromUser(userId, roleId);
  }
}
