import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateJobPositionDto } from './dto/create-job-position.dto';
import { UpdateJobPositionDto } from './dto/update-job-position.dto';

@Injectable()
export class JobPositionsService {
  constructor(private prisma: PrismaService) {}

  async create(createJobPositionDto: CreateJobPositionDto) {
    const { positionId, departmentId, jobName } = createJobPositionDto;

    // Check if combination already exists
    const existing = await this.prisma.jobPosition.findFirst({
      where: { positionId, departmentId, jobName },
    });

    if (existing) {
      throw new ConflictException('Job position combination already exists');
    }

    // Generate unique code
    const position = await this.prisma.position.findUnique({
      where: { id: positionId },
    });
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });

    if (!position || !department) {
      throw new NotFoundException('Position or Department not found');
    }

    const code = this.generateCode(position.name, department.name, jobName);

    return this.prisma.jobPosition.create({
      data: {
        ...createJobPositionDto,
        code,
      },
      include: {
        position: true,
        department: {
          include: {
            office: true,
          },
        },
      },
    });
  }

  async findAll(filters: {
    departmentId?: string;
    positionId?: string;
    isActive?: boolean;
  }) {
    return this.prisma.jobPosition.findMany({
      where: {
        ...(filters.departmentId && { departmentId: filters.departmentId }),
        ...(filters.positionId && { positionId: filters.positionId }),
        ...(filters.isActive !== undefined && { isActive: filters.isActive }),
      },
      include: {
        position: true,
        department: {
          include: {
            office: true,
          },
        },
        _count: {
          select: {
            users: true,
          },
        },
      },
      orderBy: [
        { department: { name: 'asc' } },
        { position: { name: 'asc' } },
        { jobName: 'asc' },
      ],
    });
  }

  async findOne(id: string) {
    const jobPosition = await this.prisma.jobPosition.findUnique({
      where: { id },
      include: {
        position: true,
        department: {
          include: {
            office: true,
          },
        },
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
    });

    if (!jobPosition) {
      throw new NotFoundException('Job position not found');
    }

    return jobPosition;
  }

  async update(id: string, updateJobPositionDto: UpdateJobPositionDto) {
    const jobPosition = await this.findOne(id);

    // If updating core fields, regenerate code
    let code = jobPosition.code;
    if (
      updateJobPositionDto.positionId ||
      updateJobPositionDto.departmentId ||
      updateJobPositionDto.jobName
    ) {
      const positionId =
        updateJobPositionDto.positionId || jobPosition.positionId;
      const departmentId =
        updateJobPositionDto.departmentId || jobPosition.departmentId;
      const jobName = updateJobPositionDto.jobName || jobPosition.jobName;

      const position = await this.prisma.position.findUnique({
        where: { id: positionId },
      });
      const department = await this.prisma.department.findUnique({
        where: { id: departmentId },
      });

      code = this.generateCode(position.name, department.name, jobName);
    }

    return this.prisma.jobPosition.update({
      where: { id },
      data: {
        ...updateJobPositionDto,
        code,
      },
      include: {
        position: true,
        department: {
          include: {
            office: true,
          },
        },
      },
    });
  }

  async remove(id: string) {
    const jobPosition = await this.findOne(id);

    // Check if any users are assigned to this job position
    const userCount = await this.prisma.user.count({
      where: { jobPositionId: id },
    });

    if (userCount > 0) {
      throw new ConflictException(
        `Cannot delete job position. ${userCount} users are assigned to this position.`,
      );
    }

    return this.prisma.jobPosition.delete({
      where: { id },
    });
  }

  private generateCode(
    positionName: string,
    departmentName: string,
    jobName: string,
  ): string {
    const positionCode = positionName.substring(0, 2).toUpperCase();
    const departmentCode = departmentName
      .replace('Phòng ', '')
      .substring(0, 4)
      .toUpperCase();
    const jobCode = jobName.substring(0, 4).toUpperCase();

    return `${positionCode}_${departmentCode}_${jobCode}`;
  }
}
