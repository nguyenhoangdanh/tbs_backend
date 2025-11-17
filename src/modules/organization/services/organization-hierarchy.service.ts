import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';

@Injectable()
export class OrganizationHierarchyService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get complete organization structure
   */
  async getOrganizationStructure() {
    const offices = await this.prisma.office.findMany({
      include: {
        departments: {
          include: {
            jobPositions: {
              where: { isActive: true },
              include: {
                position: true,
                _count: { select: { users: true } },
              },
              orderBy: { position: { level: 'asc' } },
            },
          },
          orderBy: { name: 'asc' },
        },
        factories: {
          where: { isActive: true },
          include: {
            _count: {
              select: {
                lines: true,
                worksheets: true,
              },
            },
          },
          orderBy: { code: 'asc' },
        },
        _count: {
          select: {
            departments: true,
            users: true,
            factories: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return {
      offices,
      summary: {
        totalOffices: offices.length,
        totalDepartments: offices.reduce(
          (sum, office) => sum + office._count.departments,
          0,
        ),
        totalFactories: offices.reduce(
          (sum, office) => sum + office._count.factories,
          0,
        ),
        totalUsers: offices.reduce(
          (sum, office) => sum + office._count.users,
          0,
        ),
      },
    };
  }

  /**
   * Get organization hierarchy for management view
   */
  async getOrganizationHierarchy() {
    const positions = await this.prisma.position.findMany({
      include: {
        jobPositions: {
          where: { isActive: true },
          include: {
            department: {
              include: { office: { select: { name: true, type: true } } },
            },
            users: {
              where: { isActive: true },
              select: {
                id: true,
                employeeCode: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },
          },
        },
      },
      orderBy: [{ level: 'asc' }, { priority: 'asc' }],
    });

    return {
      hierarchy: positions.map((position) => ({
        position,
        jobPositions: position.jobPositions.map((jobPosition) => ({
          ...jobPosition,
          totalUsers: jobPosition.users.length,
        })),
      })),
    };
  }
}
