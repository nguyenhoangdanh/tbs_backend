import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';

@Injectable()
export class OrganizationHierarchyService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get complete organization structure grouped by company
   */
  async getOrganizationStructure() {
    const companies = await this.prisma.company.findMany({
      include: {
        offices: {
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
            _count: {
              select: {
                departments: true,
                users: true,
              },
            },
          },
          orderBy: { name: 'asc' },
        },
        _count: {
          select: { offices: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const totalOffices = companies.reduce(
      (sum, c) => sum + c.offices.length,
      0,
    );
    const totalDepartments = companies.reduce(
      (sum, c) =>
        sum + c.offices.reduce((s, o) => s + (o._count?.departments || 0), 0),
      0,
    );
    const totalUsers = companies.reduce(
      (sum, c) =>
        sum + c.offices.reduce((s, o) => s + (o._count?.users || 0), 0),
      0,
    );

    return {
      companies,
      // legacy flat offices list for backward compat
      offices: companies.flatMap((c) => c.offices),
      summary: {
        totalCompanies: companies.length,
        totalOffices,
        totalDepartments,
        totalUsers,
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
                // role removed
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
