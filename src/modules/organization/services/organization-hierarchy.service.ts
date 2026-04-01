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
                    users: {
                      where: { isActive: true },
                      select: {
                        id: true,
                        employeeCode: true,
                        firstName: true,
                        lastName: true,
                        avatar: true,
                        isActive: true,
                      },
                      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
                    },
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

  /**
   * Get full management tree: Company → Offices → Departments → Managers (sorted by rank)
   * One manager can manage multiple departments.
   */
  async getManagementTree(companyId?: string) {
    const whereCompany = companyId ? { id: companyId } : {};

    const [companies, topManagerRows] = await Promise.all([
      this.prisma.company.findMany({
        where: whereCompany,
        include: {
          offices: {
            orderBy: { name: 'asc' },
            include: {
              departments: {
                orderBy: { name: 'asc' },
                include: {
                  managers: {
                    where: { isActive: true },
                    include: {
                      user: {
                        select: {
                          id: true,
                          firstName: true,
                          lastName: true,
                          employeeCode: true,
                          avatar: true,
                          isActive: true,
                          jobPosition: {
                            select: {
                              jobName: true,
                              position: { select: { name: true, level: true, isManagement: true } },
                            },
                          },
                        },
                      },
                    },
                    orderBy: { user: { jobPosition: { position: { level: 'asc' } } } },
                  },
                  _count: { select: { jobPositions: true, managers: { where: { isActive: true } } } },
                },
              },
              _count: { select: { departments: true, users: { where: { isActive: true } } } },
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      // Fetch top-level managers (TGĐ/PTGĐ/GĐ/PGĐ — position.level 0–3) per company
      this.prisma.user.findMany({
        where: {
          isActive: true,
          ...(companyId ? { companyId } : {}),
          jobPosition: { position: { level: { lte: 3 } } },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeCode: true,
          avatar: true,
          companyId: true,
          jobPosition: {
            select: {
              jobName: true,
              position: { select: { name: true, level: true, isManagement: true } },
              department: {
                select: {
                  name: true,
                  office: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
        orderBy: { jobPosition: { position: { level: 'asc' } } },
      }),
    ]);

    // Group top managers by companyId
    const topByCompany = new Map<string, typeof topManagerRows>();
    for (const u of topManagerRows) {
      if (!u.companyId) continue;
      if (!topByCompany.has(u.companyId)) topByCompany.set(u.companyId, []);
      topByCompany.get(u.companyId)!.push(u);
    }

    return companies.map((c) => ({
      ...c,
      topManagers: topByCompany.get(c.id) ?? [],
    }));
  }

  /**
   * Assign a user as manager of a department (flexible many-to-many).
   */
  async assignManager(departmentId: string, userId: string) {
    const [dept, user] = await Promise.all([
      this.prisma.department.findUnique({ where: { id: departmentId }, select: { id: true, name: true } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, firstName: true, lastName: true } }),
    ]);
    if (!dept) throw new Error(`Department ${departmentId} not found`);
    if (!user) throw new Error(`User ${userId} not found`);

    return this.prisma.userDepartmentManagement.upsert({
      where: { userId_departmentId: { userId, departmentId } },
      update: { isActive: true },
      create: { userId, departmentId, isActive: true },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        department: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Remove manager from department.
   */
  async removeManager(departmentId: string, userId: string) {
    const rel = await this.prisma.userDepartmentManagement.findUnique({
      where: { userId_departmentId: { userId, departmentId } },
    });
    if (!rel) throw new Error('Manager assignment not found');
    return this.prisma.userDepartmentManagement.update({
      where: { userId_departmentId: { userId, departmentId } },
      data: { isActive: false },
    });
  }

  /**
   * Get all departments managed by a user.
   */
  async getManagedDepartments(userId: string) {
    return this.prisma.userDepartmentManagement.findMany({
      where: { userId, isActive: true },
      include: {
        department: {
          include: { office: { select: { id: true, name: true } } },
        },
      },
      orderBy: { department: { name: 'asc' } },
    });
  }

  /**
   * Get all managers of a department.
   */
  async getDepartmentManagers(departmentId: string) {
    return this.prisma.userDepartmentManagement.findMany({
      where: { departmentId, isActive: true },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeCode: true,
            avatar: true,
            jobPosition: {
              select: { jobName: true, position: { select: { name: true, level: true } } },
            },
          },
        },
      },
      orderBy: { user: { jobPosition: { position: { level: 'asc' } } } },
    });
  }
}
