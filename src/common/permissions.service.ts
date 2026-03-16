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

  /**
   * Bulk-create permissions — skips duplicates, returns created count.
   */
  async bulkCreatePermissions(
    items: Array<{ resource: string; action: string; description?: string }>,
  ): Promise<{ created: number; skipped: number; permissions: unknown[] }> {
    const results: unknown[] = [];
    let skipped = 0;

    for (const item of items) {
      const existing = await this.prisma.permission.findUnique({
        where: { resource_action: { resource: item.resource, action: item.action } },
      });
      if (existing) {
        skipped++;
        continue;
      }
      const created = await this.prisma.permission.create({ data: item });
      results.push(created);
    }

    return { created: results.length, skipped, permissions: results };
  }

  /**
   * Bulk-delete permissions by IDs.
   */
  async bulkDeletePermissions(
    ids: string[],
  ): Promise<{ deleted: number }> {
    const result = await this.prisma.permission.deleteMany({
      where: { id: { in: ids } },
    });
    return { deleted: result.count };
  }

  /**
   * Delete ALL permissions (SUPERADMIN only — destructive).
   */
  async deleteAllPermissions(): Promise<{ deleted: number }> {
    const result = await this.prisma.permission.deleteMany({});
    return { deleted: result.count };
  }

  /**
   * Seed default permissions and assign to system roles
   */
  async seedPermissions() {
    const defaultPermissions = [
      // Users
      { resource: 'users', action: 'view', description: 'View users' },
      { resource: 'users', action: 'create', description: 'Create users' },
      { resource: 'users', action: 'update', description: 'Update users' },
      { resource: 'users', action: 'delete', description: 'Delete users' },
      // Roles
      { resource: 'roles', action: 'view', description: 'View roles' },
      { resource: 'roles', action: 'manage', description: 'Manage roles & permissions' },
      // Reports
      { resource: 'reports', action: 'view', description: 'View reports' },
      { resource: 'reports', action: 'create', description: 'Create reports' },
      { resource: 'reports', action: 'update', description: 'Update reports' },
      { resource: 'reports', action: 'delete', description: 'Delete reports' },
      { resource: 'reports', action: 'approve', description: 'Approve reports' },
      // Healthcare
      { resource: 'healthcare', action: 'view', description: 'View healthcare' },
      { resource: 'healthcare', action: 'create', description: 'Create healthcare records' },
      { resource: 'healthcare', action: 'update', description: 'Update healthcare records' },
      { resource: 'healthcare', action: 'delete', description: 'Delete healthcare records' },
      // Gate Pass
      { resource: 'gate-pass', action: 'view', description: 'View gate passes' },
      { resource: 'gate-pass', action: 'create', description: 'Create gate passes' },
      { resource: 'gate-pass', action: 'approve', description: 'Approve gate passes' },
      // Statistics
      { resource: 'statistics', action: 'view', description: 'View statistics' },
      // Organizations (HR structure)
      { resource: 'organizations', action: 'view', description: 'View organization structure' },
      { resource: 'organizations', action: 'create', description: 'Create org units' },
      { resource: 'organizations', action: 'update', description: 'Update org units' },
      { resource: 'organizations', action: 'delete', description: 'Delete org units' },
      { resource: 'organizations', action: 'manage', description: 'Full org management' },
      // Manufacturing
      { resource: 'manufacturing', action: 'view', description: 'View manufacturing data' },
      { resource: 'manufacturing', action: 'manage', description: 'Manage manufacturing' },
      // Worksheets
      { resource: 'worksheets', action: 'view', description: 'View worksheets' },
      { resource: 'worksheets', action: 'create', description: 'Create worksheets' },
      { resource: 'worksheets', action: 'update', description: 'Update worksheets' },
      { resource: 'worksheets', action: 'delete', description: 'Delete worksheets' },
      // Production groups & teams
      { resource: 'groups', action: 'view', description: 'View production groups' },
      { resource: 'groups', action: 'create', description: 'Create production groups' },
      { resource: 'groups', action: 'update', description: 'Update production groups' },
      { resource: 'groups', action: 'assign', description: 'Assign users to groups' },
      { resource: 'groups', action: 'manage', description: 'Manage production groups' },
      { resource: 'teams', action: 'view', description: 'View teams' },
      { resource: 'teams', action: 'create', description: 'Create teams' },
      { resource: 'teams', action: 'update', description: 'Update teams' },
      { resource: 'teams', action: 'delete', description: 'Delete teams' },
      { resource: 'teams', action: 'manage', description: 'Manage teams' },
      // Feedback
      { resource: 'feedback', action: 'view', description: 'View feedback' },
      { resource: 'feedback', action: 'create', description: 'Create feedback' },
      { resource: 'feedback', action: 'manage', description: 'Manage feedback' },
      // Hierarchy reports
      { resource: 'hierarchy-reports', action: 'view', description: 'View hierarchy reports' },
      // Task evaluations
      { resource: 'task-evaluations', action: 'view', description: 'View task evaluations' },
      { resource: 'task-evaluations', action: 'create', description: 'Create task evaluations' },
      { resource: 'task-evaluations', action: 'update', description: 'Update task evaluations' },
      { resource: 'task-evaluations', action: 'delete', description: 'Delete task evaluations' },

      // Companies
      { resource: 'companies', action: 'view', description: 'View companies' },
      { resource: 'companies', action: 'manage', description: 'Create/update/delete companies' },
    ];

    let created = 0;
    for (const perm of defaultPermissions) {
      await this.prisma.permission.upsert({
        where: { resource_action: { resource: perm.resource, action: perm.action } },
        create: perm,
        update: { description: perm.description },
      });
      created++;
    }

    // Assign all permissions to SUPERADMIN role
    const superadminRole = await this.prisma.roleDefinition.findFirst({
      where: { code: 'SUPERADMIN' },
    });

    let roleAssignments: Record<string, number> = {};

    if (superadminRole) {
      const allPerms = await this.prisma.permission.findMany();
      // Clear existing
      await this.prisma.roleDefinitionPermission.deleteMany({
        where: { roleDefinitionId: superadminRole.id },
      });
      // Assign all
      await this.prisma.roleDefinitionPermission.createMany({
        data: allPerms.map((p) => ({
          roleDefinitionId: superadminRole.id,
          permissionId: p.id,
          isGranted: true,
        })),
      });
      roleAssignments['SUPERADMIN'] = allPerms.length;
    }

    // Assign all permissions to ADMIN role (full access)
    await this._assignPermissionsToRole('ADMIN', null, roleAssignments);

    // MEDICAL_STAFF: full healthcare access + organizations:view
    await this._assignPermissionsToRole('MEDICAL_STAFF', ['healthcare'], roleAssignments);
    await this._assignPermissionsToRole('MEDICAL_STAFF', ['organizations'], roleAssignments, ['view']);

    // USER: can view reports/stats/organizations + create reports + submit gate-pass + task-evaluations
    await this._assignPermissionsToRole('USER', null, roleAssignments, ['view']);
    await this._assignPermissionsToRole('USER', ['reports'], roleAssignments, ['create', 'update', 'delete']);
    await this._assignPermissionsToRole('USER', ['gate-pass'], roleAssignments, ['create']);
    await this._assignPermissionsToRole('USER', ['worksheets'], roleAssignments, ['create', 'update']);
    await this._assignPermissionsToRole('USER', ['task-evaluations'], roleAssignments, ['create', 'update', 'delete']);

    return {
      totalPermissions: created,
      roleAssignments,
      message: `Seeded ${created} permissions successfully`,
    };
  }

  /** Helper: assign permissions to a role by code */
  private async _assignPermissionsToRole(
    roleCode: string,
    /** If set, only include permissions whose resource is in this list */
    resources: string[] | null,
    roleAssignments: Record<string, number>,
    /** If set, only include permissions whose action is in this list */
    actions: string[] | null = null,
  ) {
    const role = await this.prisma.roleDefinition.findFirst({ where: { code: roleCode } });
    if (!role) return;

    const whereClause: any = {};
    if (resources) whereClause.resource = { in: resources };
    if (actions) whereClause.action = { in: actions };

    const perms = await this.prisma.permission.findMany({ where: whereClause });

    await this.prisma.roleDefinitionPermission.deleteMany({
      where: { roleDefinitionId: role.id },
    });
    if (perms.length > 0) {
      await this.prisma.roleDefinitionPermission.createMany({
        data: perms.map((p) => ({
          roleDefinitionId: role.id,
          permissionId: p.id,
          isGranted: true,
        })),
      });
    }
    roleAssignments[roleCode] = perms.length;
  }
}
