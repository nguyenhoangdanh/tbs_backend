import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

export interface DirectPermissionInput {
  permissionId: string;
  isGranted: boolean;
  note?: string;
}

@Injectable()
export class UserPermissionsService {
  constructor(private prisma: PrismaService) {}

  /** Get user's assigned roles with their permissions */
  async getUserRolesAndPermissions(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeCode: true,
        roles: {
          where: { isActive: true },
          include: {
            roleDefinition: {
              include: {
                permissions: {
                  where: { isGranted: true },
                  include: { permission: true },
                },
              },
            },
          },
        },
        directPermissions: {
          include: {
            permission: true,
            grantedBy: {
              select: { id: true, firstName: true, lastName: true, employeeCode: true },
            },
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** Replace user's role assignments */
  async setUserRoles(userId: string, roleDefinitionIds: string[], actorId?: string) {
    await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    await this.prisma.userRole.deleteMany({ where: { userId } });

    if (roleDefinitionIds.length > 0) {
      await this.prisma.userRole.createMany({
        data: roleDefinitionIds.map((roleDefinitionId) => ({
          userId,
          roleDefinitionId,
          isActive: true,
        })),
      });
    }

    return this.getUserRolesAndPermissions(userId);
  }

  /** Set direct per-user permission overrides */
  async setDirectPermissions(
    userId: string,
    permissions: DirectPermissionInput[],
    actorId?: string,
  ) {
    await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    // Remove all existing direct permissions first
    await this.prisma.userPermission.deleteMany({ where: { userId } });

    if (permissions.length > 0) {
      await this.prisma.userPermission.createMany({
        data: permissions.map((p) => ({
          userId,
          permissionId: p.permissionId,
          isGranted: p.isGranted,
          grantedById: actorId ?? null,
          note: p.note ?? null,
        })),
      });
    }

    return this.getUserRolesAndPermissions(userId);
  }
}
