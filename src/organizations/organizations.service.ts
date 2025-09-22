import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class OrganizationsService {
  constructor(private prisma: PrismaService) {}

  // Office Management
  async findAllOffices() {
    return this.prisma.office.findMany({
      include: {
        _count: {
          select: {
            departments: true,
            users: true,
            factories: true, // Include factories count
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOfficeById(id: string) {
    const office = await this.prisma.office.findUnique({
      where: { id },
      include: {
        departments: {
          include: {
            _count: {
              select: { jobPositions: true },
            },
          },
          orderBy: { name: 'asc' },
        },
        factories: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            code: true,
            description: true,
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
    });

    if (!office) {
      throw new NotFoundException('Office not found');
    }

    return office;
  }

  async getOfficeDepartments(id: string) {
    const office = await this.prisma.office.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    if (!office) {
      throw new NotFoundException('Office not found');
    }

    const departments = await this.prisma.department.findMany({
      where: { officeId: id },
      include: {
        jobPositions: {
          where: { isActive: true },
          include: {
            position: { select: { name: true, level: true } },
            _count: { select: { users: true } },
          },
          orderBy: { position: { level: 'asc' } },
        },
        _count: {
          select: { jobPositions: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return { office, departments };
  }

  // Department Management
  async findAllDepartments() {
    return this.prisma.department.findMany({
      include: {
        office: { select: { name: true, type: true } },
        _count: {
          select: { jobPositions: true },
        },
      },
      orderBy: [
        { office: { name: 'asc' } },
        { name: 'asc' },
      ],
    });
  }

  async findDepartmentById(id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
      include: {
        office: true,
        jobPositions: {
          where: { isActive: true },
          include: {
            position: true,
            users: {
              where: { isActive: true },
              select: {
                id: true,
                employeeCode: true,
                firstName: true,
                lastName: true,
                role: true,
              },
              orderBy: { employeeCode: 'asc' },
            },
            _count: { select: { users: true } },
          },
          orderBy: { position: { level: 'asc' } },
        },
        _count: {
          select: { jobPositions: true },
        },
      },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    return department;
  }

  async getDepartmentJobPositions(id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
      select: { id: true, name: true, office: { select: { name: true } } },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    const jobPositions = await this.prisma.jobPosition.findMany({
      where: { departmentId: id, isActive: true },
      include: {
        position: true,
        users: {
          where: { isActive: true },
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            role: true,
            groupId: true, // Include group membership for workers
          },
          orderBy: { employeeCode: 'asc' },
        },
        _count: { select: { users: true } },
      },
      orderBy: { position: { level: 'asc' } },
    });

    return { department, jobPositions };
  }

  // Position Management
  async findAllPositions() {
    return this.prisma.position.findMany({
      include: {
        _count: {
          select: { jobPositions: true },
        },
      },
      orderBy: [
        { level: 'asc' },
        { priority: 'asc' },
        { name: 'asc' },
      ],
    });
  }

  async findPositionById(id: string) {
    const position = await this.prisma.position.findUnique({
      where: { id },
      include: {
        jobPositions: {
          where: { isActive: true },
          include: {
            department: {
              include: { office: { select: { name: true } } },
            },
            _count: { select: { users: true } },
          },
          orderBy: { department: { name: 'asc' } },
        },
        _count: {
          select: { jobPositions: true },
        },
      },
    });

    if (!position) {
      throw new NotFoundException('Position not found');
    }

    return position;
  }

  // Job Position Management
  async findAllJobPositions() {
    return this.prisma.jobPosition.findMany({
      where: { isActive: true },
      include: {
        department: {
          include: { office: { select: { name: true, type: true } } },
        },
        position: true,
        _count: { select: { users: true } },
      },
      orderBy: [
        { department: { office: { name: 'asc' } } },
        { department: { name: 'asc' } },
        { position: { level: 'asc' } },
      ],
    });
  }

  async findJobPositionById(id: string) {
    const jobPosition = await this.prisma.jobPosition.findUnique({
      where: { id },
      include: {
        department: {
          include: { office: true },
        },
        position: true,
        users: {
          where: { isActive: true },
          include: {
            group: {
              select: {
                id: true,
                name: true,
                code: true,
                team: {
                  select: {
                    name: true,
                    line: {
                      select: {
                        name: true,
                        factory: { select: { name: true, code: true } },
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: { employeeCode: 'asc' },
        },
        _count: { select: { users: true } },
      },
    });

    if (!jobPosition) {
      throw new NotFoundException('Job position not found');
    }

    return jobPosition;
  }

  // Organization Structure
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
        totalDepartments: offices.reduce((sum, office) => sum + office._count.departments, 0),
        totalFactories: offices.reduce((sum, office) => sum + office._count.factories, 0),
        totalUsers: offices.reduce((sum, office) => sum + office._count.users, 0),
      },
    };
  }

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
      orderBy: [
        { level: 'asc' },
        { priority: 'asc' },
      ],
    });

    return {
      hierarchy: positions.map(position => ({
        position,
        jobPositions: position.jobPositions.map(jobPosition => ({
          ...jobPosition,
          totalUsers: jobPosition.users.length,
        })),
      })),
    };
  }
}
