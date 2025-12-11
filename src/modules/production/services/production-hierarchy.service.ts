import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';

@Injectable()
export class ProductionHierarchyService {
  private readonly logger = new Logger(ProductionHierarchyService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get complete production structure
   * NEW: Office (FACTORY_OFFICE) → Department → Team → Group
   */
  async getProductionStructure() {
    const offices = await this.prisma.office.findMany({
      where: { 
        type: 'FACTORY_OFFICE'
      },
      include: {
        departments: {
          include: {
            teams: {
              where: { isActive: true },
              include: {
                groups: {
                  where: { isActive: true },
                  include: {
                    leader: {
                      select: {
                        id: true,
                        employeeCode: true,
                        firstName: true,
                        lastName: true,
                      },
                    },
                    _count: {
                      select: { members: true },
                    },
                  },
                  orderBy: { code: 'asc' },
                },
                _count: {
                  select: { groups: true },
                },
              },
              orderBy: { code: 'asc' },
            },
            _count: {
              select: { teams: true },
            },
          },
          orderBy: { name: 'asc' },
        },
        _count: {
          select: {
            departments: true,
            worksheets: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Calculate summary stats
    let totalTeams = 0;
    let totalGroups = 0;
    
    offices.forEach((office) => {
      if (office.departments && Array.isArray(office.departments)) {
        office.departments.forEach((department) => {
          if (department.teams && Array.isArray(department.teams)) {
            totalTeams += department.teams.length;
            department.teams.forEach((team) => {
              if (team.groups && Array.isArray(team.groups)) {
                totalGroups += team.groups.length;
              }
            });
          }
        });
      }
    });

    this.logger.log(`Production structure: ${offices.length} offices, ${totalTeams} teams, ${totalGroups} groups`);

    return {
      offices,
      summary: {
        totalOffices: offices.length,
        totalDepartments: offices.reduce(
          (sum, office) => sum + (office._count?.departments || 0),
          0,
        ),
        totalTeams,
        totalGroups,
        totalWorksheets: offices.reduce(
          (sum, office) => sum + (office._count?.worksheets || 0),
          0,
        ),
      },
    };
  }

  /**
   * Get production hierarchy tree
   */
  async getProductionHierarchy() {
    return this.getProductionStructure();
  }
}
