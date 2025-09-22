import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(private prisma: PrismaService) {}

  async validateOffice(officeId: string) {
    const office = await this.prisma.office.findUnique({
      where: { id: officeId },
    });

    if (!office) {
      throw new NotFoundException('Office not found');
    }
    return office;
  }

  async findByOffice(officeId: string) {
    await this.validateOffice(officeId);

    return this.prisma.department.findMany({
      where: { officeId },
      include: {
        office: true,
        jobPositions: {
          include: {
            _count: {
              select: { users: true },
            },
          },
        },
        _count: {
          select: { jobPositions: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(createDepartmentDto: CreateDepartmentDto) {
    const { officeId, name } = createDepartmentDto;

    await this.validateOffice(officeId);

    // Check if department with same name exists in the office
    const existingDepartment = await this.prisma.department.findFirst({
      where: {
        name,
        officeId,
      },
    });
    if (existingDepartment) {
      throw new BadRequestException(
        'Department with this name already exists in the office',
      );
    }

    return this.prisma.department.create({
      data: createDepartmentDto,
      include: {
        office: true,
        _count: {
          select: { jobPositions: true },
        },
      },
    });
  }

  async findAll() {
    return this.prisma.department.findMany({
      include: {
        office: true,
        _count: {
          select: { jobPositions: true },
        },
      },
      orderBy: [{ office: { name: 'asc' } }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
      include: {
        office: true,
        jobPositions: {
          include: {
            position: true,
            users: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    return department;
  }

  async update(id: string, updateDepartmentDto: UpdateDepartmentDto) {
    const department = await this.prisma.department.findUnique({
      where: { id },
      include: {
        _count: {
          select: { jobPositions: true },
        },
      },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    if (updateDepartmentDto.officeId) {
      await this.validateOffice(updateDepartmentDto.officeId);
    }

    return this.prisma.department.update({
      where: { id },
      data: updateDepartmentDto,
      include: {
        office: true,
        _count: {
          select: { jobPositions: true },
        },
      },
    });
  }

  async remove(id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
      include: {
        _count: {
          select: { jobPositions: true },
        },
      },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    if (department._count.jobPositions > 0) {
      throw new ConflictException(
        'Cannot delete department with existing job positions',
      );
    }

    return this.prisma.department.delete({
      where: { id },
    });
  }
}
