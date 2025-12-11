import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { Role } from '@prisma/client';

export interface UserPermissions {
  role: Role;
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

export interface RolePermissionDto {
  role: Role;
  permissionId: string;
  isGranted: boolean;
}

export interface UserPermissionDto {
  userId: string;
  permissionId: string;
  isGranted: boolean;
}

@Injectable()
export class PermissionsService {
  constructor(private prisma: PrismaService) {}

  // ========== USER PERMISSIONS ==========

  /**
   * Get all permissions for a user
   */
  async getUserPermissions(userId: string): Promise<UserPermissions> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        customPermissions: {
          include: { permission: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get role-based permissions
    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: {
        role: user.role,
        isGranted: true,
      },
      include: { permission: true },
    });


    // Combine role permissions with custom user permissions
    const permissionsMap = new Map<string, boolean>();

    // Add role permissions
    rolePermissions.forEach((rp) => {
      const key = `${rp.permission.resource}:${rp.permission.action}`;
      permissionsMap.set(key, true);
    });

    // Override with custom user permissions
    user.customPermissions.forEach((up) => {
      const key = `${up.permission.resource}:${up.permission.action}`;
      permissionsMap.set(key, up.isGranted);
    });

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

    return {
      role: user.role,
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

  // ========== ROLE PERMISSIONS CRUD ==========

  async getRolePermissions(role: Role) {
    return this.prisma.rolePermission.findMany({
      where: { role },
      include: {
        permission: true,
      },
      orderBy: {
        permission: {
          resource: 'asc',
        },
      },
    });
  }

  async assignPermissionToRole(dto: RolePermissionDto) {
    const permission = await this.getPermissionById(dto.permissionId);

    return this.prisma.rolePermission.upsert({
      where: {
        role_permissionId: {
          role: dto.role,
          permissionId: dto.permissionId,
        },
      },
      update: { isGranted: dto.isGranted },
      create: {
        role: dto.role,
        permissionId: dto.permissionId,
        isGranted: dto.isGranted,
      },
      include: {
        permission: true,
      },
    });
  }

  async removePermissionFromRole(role: Role, permissionId: string) {
    const existing = await this.prisma.rolePermission.findUnique({
      where: {
        role_permissionId: { role, permissionId },
      },
    });

    if (!existing) {
      throw new NotFoundException('Role permission not found');
    }

    return this.prisma.rolePermission.delete({
      where: {
        role_permissionId: { role, permissionId },
      },
    });
  }

  async bulkUpdateRolePermissions(role: Role, permissionIds: string[]) {
    // Delete all current permissions for this role
    await this.prisma.rolePermission.deleteMany({
      where: { role },
    });

    // Create new permissions
    const createData = permissionIds.map((permissionId) => ({
      role,
      permissionId,
      isGranted: true,
    }));

    await this.prisma.rolePermission.createMany({
      data: createData,
    });

    return this.getRolePermissions(role);
  }

  // ========== USER CUSTOM PERMISSIONS CRUD ==========

  async getUserCustomPermissions(userId: string) {
    return this.prisma.userPermission.findMany({
      where: { userId },
      include: {
        permission: true,
      },
      orderBy: {
        permission: {
          resource: 'asc',
        },
      },
    });
  }

  async assignPermissionToUser(dto: UserPermissionDto) {
    const permission = await this.getPermissionById(dto.permissionId);

    return this.prisma.userPermission.upsert({
      where: {
        userId_permissionId: {
          userId: dto.userId,
          permissionId: dto.permissionId,
        },
      },
      update: { isGranted: dto.isGranted },
      create: {
        userId: dto.userId,
        permissionId: dto.permissionId,
        isGranted: dto.isGranted,
      },
      include: {
        permission: true,
      },
    });
  }

  async removePermissionFromUser(userId: string, permissionId: string) {
    const existing = await this.prisma.userPermission.findUnique({
      where: {
        userId_permissionId: { userId, permissionId },
      },
    });

    if (!existing) {
      throw new NotFoundException('User permission not found');
    }

    return this.prisma.userPermission.delete({
      where: {
        userId_permissionId: { userId, permissionId },
      },
    });
  }

  // ========== ROLE MANAGEMENT ==========

  async getAllRoles() {
    return Object.values(Role).map((role) => ({
      value: role,
      label: this.getRoleLabel(role),
    }));
  }

  async getRoleWithPermissions(role: Role) {
    const permissions = await this.getRolePermissions(role);

    return {
      role,
      label: this.getRoleLabel(role),
      description: this.getRoleDescription(role),
      permissions: permissions.map((rp) => ({
        id: rp.permission.id,
        resource: rp.permission.resource,
        action: rp.permission.action,
        description: rp.permission.description,
        isGranted: rp.isGranted,
      })),
    };
  }

  private getRoleLabel(role: Role): string {
    const labels: Record<Role, string> = {
      [Role.SUPERADMIN]: 'Super Admin',
      [Role.ADMIN]: 'Admin',
      [Role.USER]: 'User',
      [Role.WORKER]: 'Worker',
      [Role.MEDICAL_STAFF]: 'Medical Staff',
    };
    return labels[role];
  }

  private getRoleDescription(role: Role): string {
    const descriptions: Record<Role, string> = {
      [Role.SUPERADMIN]: 'Full system access',
      [Role.ADMIN]: 'Manage factory operations',
      [Role.USER]: 'Department management',
      [Role.WORKER]: 'Production worker',
      [Role.MEDICAL_STAFF]: 'Medical department',
    };
    return descriptions[role];
  }

  // ========== SEED PERMISSIONS ==========

  /**
   * Seed all permissions and role assignments
   * ⚠️ WARNING: Only for SUPERADMIN - Will reset all role permissions
   */
  async seedPermissions(): Promise<{
    totalPermissions: number;
    roleAssignments: Record<Role, number>;
    message: string;
  }> {
    const resources = [
      'users',
      'reports',
      'gate-passes',
      'offices',
      'departments',
      'teams',
      'groups',
      'worksheets',
      'products',
      'processes',
      'medicines',
      'medical-records',
    ];

    const actions = [
      'view',
      'create',
      'update',
      'delete',
      'approve',
      'manage',
      'assign',
    ];

    // Role permissions map
    const rolePermissionsMap = {
      [Role.SUPERADMIN]: {
        all: [
          'view',
          'create',
          'update',
          'delete',
          'approve',
          'manage',
          'assign',
        ],
      },
      [Role.ADMIN]: {
        offices: ['view', 'create', 'update', 'delete', 'manage'],
        departments: ['view', 'create', 'update', 'delete', 'manage'],
        teams: ['view', 'create', 'update', 'delete', 'manage'],
        groups: ['view', 'create', 'update', 'delete', 'manage', 'assign'],
        users: ['view', 'create', 'update', 'manage'],
        worksheets: ['view', 'create', 'update', 'delete', 'manage'],
        products: ['view', 'create', 'update', 'delete'],
        processes: ['view', 'create', 'update', 'delete'],
        reports: ['view', 'approve', 'manage'],
        'gate-passes': ['view', 'approve', 'manage'],
        medicines: ['view'],
        'medical-records': ['view'],
      },
      [Role.USER]: {
        users: ['view', 'update'],
        reports: ['view', 'create', 'update', 'approve'],
        'gate-passes': ['view', 'create', 'approve'],
        offices: ['view'],
        departments: ['view'],
        teams: ['view'],
        groups: ['view'],
        worksheets: ['view'],
        products: ['view'],
        processes: ['view'],
        medicines: ['view'],
        'medical-records': ['view'],
      },
      [Role.WORKER]: {
        users: ['view'],
        worksheets: ['view', 'update'],
        products: ['view'],
        processes: ['view'],
        groups: ['view'],
        'gate-passes': ['view', 'create'],
        medicines: ['view'],
        'medical-records': ['view'],
      },
      [Role.MEDICAL_STAFF]: {
        medicines: ['view', 'create', 'update', 'delete', 'manage'],
        'medical-records': ['view', 'create', 'update', 'delete', 'manage'],
        users: ['view'],
        reports: ['view'],
        'gate-passes': ['view'],
      },
    };

    // 1. Create all permissions
    const permissions = [];
    for (const resource of resources) {
      for (const action of actions) {
        const permission = await this.prisma.permission.upsert({
          where: {
            resource_action: { resource, action },
          },
          update: {
            description: `${action.charAt(0).toUpperCase() + action.slice(1)} ${resource}`,
          },
          create: {
            resource,
            action,
            description: `${action.charAt(0).toUpperCase() + action.slice(1)} ${resource}`,
          },
        });
        permissions.push(permission);
      }
    }

    // 2. Assign permissions to roles
    const roleAssignments: Record<Role, number> = {
      [Role.SUPERADMIN]: 0,
      [Role.ADMIN]: 0,
      [Role.USER]: 0,
      [Role.WORKER]: 0,
      [Role.MEDICAL_STAFF]: 0,
    };

    for (const [role, resourcePerms] of Object.entries(rolePermissionsMap)) {
      const roleEnum = role as Role;

      // Delete existing role permissions
      await this.prisma.rolePermission.deleteMany({
        where: { role: roleEnum },
      });

      // SUPERADMIN gets all permissions
      if (roleEnum === Role.SUPERADMIN) {
        for (const permission of permissions) {
          await this.prisma.rolePermission.create({
            data: {
              role: roleEnum,
              permissionId: permission.id,
              isGranted: true,
            },
          });
          roleAssignments[roleEnum]++;
        }
        continue;
      }

      // Other roles get specific permissions
      for (const [resource, allowedActions] of Object.entries(resourcePerms)) {
        for (const action of allowedActions) {
          const permission = permissions.find(
            (p) => p.resource === resource && p.action === action,
          );

          if (permission) {
            await this.prisma.rolePermission.create({
              data: {
                role: roleEnum,
                permissionId: permission.id,
                isGranted: true,
              },
            });
            roleAssignments[roleEnum]++;
          }
        }
      }
    }

    return {
      totalPermissions: permissions.length,
      roleAssignments,
      message: 'Permissions seeded successfully',
    };
  }
}
