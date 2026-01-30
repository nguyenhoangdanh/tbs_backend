import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';

export interface UserPermissions {
  roles: Array<{
    id: string;
    name: string;
    code: string;
    description: string | null;
    isSystem: boolean;
  }>; // Multiple role assignments
  permissions: string[];
  resources: {
    [resource: string]: {
      view: boolean;
      create: boolean;
      update: boolean;
      delete: boolean;
      approve?: boolean;
      manage?: boolean;
      assign?: boolean;
    };
  };
}

export interface PermissionDto {
  resource: string;
  action: string;
  description?: string;
}

@Injectable()
export class PermissionsService {
  constructor(private prisma: PrismaService) {}

  // ========== USER PERMISSIONS ==========

  /**
   * Get all permissions for a user (supports multiple roles)
   */
  async getUserPermissions(userId: string): Promise<UserPermissions> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        roles: {
          where: { isActive: true },
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
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Combine role permissions
    const permissionsMap = new Map<string, boolean>();

    // Get permissions from all assigned roles
    if (user.roles && user.roles.length > 0) {
      user.roles.forEach((userRole) => {
        userRole.roleDefinition.permissions.forEach((rdp) => {
          const key = `${rdp.permission.resource}:${rdp.permission.action}`;
          permissionsMap.set(key, rdp.isGranted);
        });
      });
    }

    // Build permissions array
    const permissions = Array.from(permissionsMap.entries())
      .filter(([_, granted]) => granted)
      .map(([key, _]) => key);

    // Build resources object for easy frontend access
    const resources: any = {};
    permissions.forEach((perm) => {
      const [resource, action] = perm.split(':');
      if (!resources[resource]) {
        resources[resource] = {
          view: false,
          create: false,
          update: false,
          delete: false,
          approve: false,
          manage: false,
          assign: false,
        };
      }
      resources[resource][action] = true;
    });

    // Build roles array from user role assignments
    const roles = user.roles.map((userRole) => ({
      id: userRole.roleDefinition.id,
      name: userRole.roleDefinition.name,
      code: userRole.roleDefinition.code,
      description: userRole.roleDefinition.description,
      isSystem: userRole.roleDefinition.isSystem,
    }));

    return {
      roles,
      permissions,
      resources,
    };
  }

  /**
   * Check if user has specific permission
   */
  async hasPermission(
    userId: string,
    resource: string,
    action: string,
  ): Promise<boolean> {
    const userPerms = await this.getUserPermissions(userId);
    return userPerms.permissions.includes(`${resource}:${action}`);
  }

  /**
   * Check if user can access resource (any action)
   */
  async canAccess(userId: string, resource: string): Promise<boolean> {
    const userPerms = await this.getUserPermissions(userId);
    return userPerms.permissions.some((perm) =>
      perm.startsWith(`${resource}:`),
    );
  }

  // ========== PERMISSION CRUD ==========

  async getAllPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });
  }

  async getPermissionById(id: string) {
    const permission = await this.prisma.permission.findUnique({
      where: { id },
    });

    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    return permission;
  }

  async createPermission(dto: PermissionDto) {
    const existing = await this.prisma.permission.findUnique({
      where: {
        resource_action: {
          resource: dto.resource,
          action: dto.action,
        },
      },
    });

    if (existing) {
      throw new ConflictException('Permission already exists');
    }

    return this.prisma.permission.create({
      data: dto,
    });
  }

  async updatePermission(id: string, dto: Partial<PermissionDto>) {
    await this.getPermissionById(id);

    return this.prisma.permission.update({
      where: { id },
      data: dto,
    });
  }

  async deletePermission(id: string) {
    await this.getPermissionById(id);

    return this.prisma.permission.delete({
      where: { id },
    });
  }
}
