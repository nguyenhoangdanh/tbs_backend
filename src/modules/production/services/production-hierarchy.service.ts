import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';

@Injectable()
export class ProductionHierarchyService {
  private readonly logger = new Logger(ProductionHierarchyService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get complete production structure
   */
  async getProductionStructure() {
    const factories = await this.prisma.factory.findMany({
      where: { isActive: true },
      include: {
        office: {
          select: { id: true, name: true, type: true },
        },
        lines: {
          where: { isActive: true },
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
          orderBy: { code: 'asc' },
        },
        _count: {
          select: {
            lines: true,
            worksheets: true,
          },
        },
      },
      orderBy: { code: 'asc' },
    });

    // Calculate summary stats
    let totalTeams = 0;
    let totalGroups = 0;
    
    factories.forEach((factory) => {
      if (factory.lines && Array.isArray(factory.lines)) {
        factory.lines.forEach((line) => {
          if (line.teams && Array.isArray(line.teams)) {
            totalTeams += line.teams.length;
            line.teams.forEach((team) => {
              if (team.groups && Array.isArray(team.groups)) {
                totalGroups += team.groups.length;
              }
            });
          }
        });
      }
    });

    this.logger.log(`Production structure: ${factories.length} factories, ${totalTeams} teams, ${totalGroups} groups`);

    return {
      factories,
      summary: {
        totalFactories: factories.length,
        totalLines: factories.reduce(
          (sum, factory) => sum + (factory._count?.lines || 0),
          0,
        ),
        totalTeams,
        totalGroups,
        totalWorksheets: factories.reduce(
          (sum, factory) => sum + (factory._count?.worksheets || 0),
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
