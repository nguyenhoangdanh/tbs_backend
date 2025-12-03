import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CloudflareR2Service } from '../common/r2.service';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as XLSX from 'xlsx';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import type { Express } from 'express'; // ⭐ ADD: Import Express namespace

interface GetAllUsersParams {
  page: number;
  limit: number;
  search?: string;
  officeId?: string;
  departmentId?: string;
  role?: Role;
  isActive?: boolean;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private r2Service: CloudflareR2Service,
  ) {}

  // ========== USER CRUD ==========

  async getAllUsers(params: GetAllUsersParams) {
    const { page, limit, search, officeId, departmentId, role, isActive } =
      params;

    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { employeeCode: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (officeId) where.officeId = officeId;
    if (role) where.role = role;
    if (typeof isActive === 'boolean') where.isActive = isActive;

    if (departmentId) {
      where.jobPosition = {
        departmentId: departmentId,
      };
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        include: {
          office: {
            select: { id: true, name: true, type: true },
          },
          jobPosition: {
            include: {
              position: { select: { name: true, level: true } },
              department: { select: { id: true, name: true } },
            },
          },
          group: {
            select: { id: true, name: true, code: true },
          },
        },
        orderBy: [{ isActive: 'desc' }, { firstName: 'asc' }],
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map(({ password, ...user }) => user),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUserById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: true,
          },
        },
        group: {
          include: {
            team: {
              include: {
                line: {
                  include: {
                    factory: true,
                  },
                },
              },
            },
          },
        },
        managedDepartments: {
          include: {
            department: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async createUser(createUserDto: CreateUserDto) {
    // Check if employee code already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { employeeCode: createUserDto.employeeCode },
    });

    if (existingUser) {
      throw new ConflictException('Employee code already exists');
    }

    // Check if email exists (if provided)
    if (createUserDto.email) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email: createUserDto.email },
      });

      if (existingEmail) {
        throw new ConflictException('Email already exists');
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(
      createUserDto.password || '123456',
      10,
    );

    const user = await this.prisma.user.create({
      data: {
        ...createUserDto,
        password: hashedPassword,
      },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: true,
          },
        },
      },
    });

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async updateUser(
    id: string,
    updateProfileDto: UpdateProfileDto,
    currentUser: any,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check role permission - only SUPERADMIN can change role
    if (updateProfileDto.role && currentUser.role !== Role.SUPERADMIN) {
      throw new ForbiddenException('Only SUPERADMIN can change user roles');
    }

    // Check email uniqueness if changed
    if (updateProfileDto.email && updateProfileDto.email !== user.email) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email: updateProfileDto.email },
      });

      if (existingEmail) {
        throw new ConflictException('Email already exists');
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: updateProfileDto,
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: true,
          },
        },
      },
    });

    const { password, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }

  async deleteUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.delete({ where: { id } });

    return { message: 'User deleted successfully' };
  }

  async toggleUserActive(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: { isActive: !user.isActive },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: true,
          },
        },
      },
    });

    const { password, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }

  async resetPassword(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const hashedPassword = await bcrypt.hash('123456', 10);

    await this.prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });

    return { message: 'Password reset to default: 123456' };
  }

  /**
   * Change password for current user
   */
  async changePassword(
    userId: string,
    dto: { currentPassword: string; newPassword: string },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      user.password,
    );
    if (!isPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return { message: 'Password changed successfully' };
  }

  // ========== LOOKUPS ==========

  async getOffices() {
    return this.prisma.office.findMany({
      select: {
        id: true,
        name: true,
        type: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async getDepartments(officeId?: string) {
    return this.prisma.department.findMany({
      where: officeId ? { officeId } : undefined,
      select: {
        id: true,
        name: true,
        officeId: true,
        office: {
          select: { name: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getPositions() {
    return this.prisma.position.findMany({
      select: {
        id: true,
        name: true,
        level: true,
        isManagement: true,
      },
      orderBy: { level: 'asc' },
    });
  }

  async getJobPositions(params: { officeId?: string; departmentId?: string }) {
    return this.prisma.jobPosition.findMany({
      where: {
        ...(params.officeId && { officeId: params.officeId }),
        ...(params.departmentId && { departmentId: params.departmentId }),
      },
      include: {
        position: { select: { name: true } },
        department: { select: { name: true, officeId: true } },
        office: { select: { name: true } },
      },
      orderBy: { jobName: 'asc' },
    });
  }

  // ========== BULK IMPORT FROM EXCEL ==========

  async importUsersFromExcel(file: any) {
    try {
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet);

      const results = {
        total: rows.length,
        success: 0,
        failed: 0,
        errors: [] as any[],
      };

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        try {
          // Map Excel columns to DTO
          const createUserDto: CreateUserDto = {
            employeeCode: String(row['Mã NV'] || row['employeeCode']).trim(),
            firstName: String(row['Họ'] || row['firstName']).trim(),
            lastName: String(row['Tên'] || row['lastName']).trim(),
            email: row['Email'] || row['email'] || undefined,
            phone: row['Số ĐT'] || row['phone'] || undefined,
            jobPositionId: String(
              row['Job Position ID'] || row['jobPositionId'],
            ).trim(),
            officeId: String(row['Office ID'] || row['officeId']).trim(),
            role: (row['Role'] || row['role'] || 'USER') as Role,
            password: row['Mật khẩu'] || row['password'] || '123456',
          };

          await this.createUser(createUserDto);
          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            row: i + 2, // Excel row number (1-indexed + header)
            employeeCode: row['Mã NV'] || row['employeeCode'],
            error: error.message,
          });
        }
      }

      return results;
    } catch (error) {
      throw new BadRequestException(
        `Failed to process Excel file: ${error.message}`,
      );
    }
  }

  async getImportTemplate() {
    // Create Excel template
    const template = [
      {
        'Mã NV': 'NV001',
        Họ: 'Nguyễn',
        Tên: 'Văn A',
        Email: 'nguyenvana@tbsgroup.vn',
        'Số ĐT': '0123456789',
        'Job Position ID': 'uuid-here',
        'Office ID': 'uuid-here',
        Role: 'USER',
        'Mật khẩu': '123456',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(template);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Users Template');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return {
      buffer,
      filename: 'users_import_template.xlsx',
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  // ========== BULK OPERATIONS ==========

  async bulkCreateUsers(users: CreateUserDto[]) {
    const results = {
      total: users.length,
      success: 0,
      failed: 0,
      errors: [] as any[],
      createdUsers: [] as any[],
    };

    // Use transaction for atomic operation
    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < users.length; i++) {
        const userData = users[i];

        try {
          // Validate employee code uniqueness
          const existingUser = await tx.user.findUnique({
            where: { employeeCode: userData.employeeCode },
          });

          if (existingUser) {
            throw new Error(
              `Employee code ${userData.employeeCode} already exists`,
            );
          }

          // Validate email uniqueness (if provided)
          if (userData.email) {
            const existingEmail = await tx.user.findUnique({
              where: { email: userData.email },
            });

            if (existingEmail) {
              throw new Error(`Email ${userData.email} already exists`);
            }
          }

          // Hash password
          const hashedPassword = await bcrypt.hash(
            userData.password || '123456',
            10,
          );

          // Create user
          const newUser = await tx.user.create({
            data: {
              ...userData,
              password: hashedPassword,
            },
            include: {
              office: {
                select: { id: true, name: true },
              },
              jobPosition: {
                select: {
                  id: true,
                  jobName: true,
                  position: { select: { name: true } },
                  department: { select: { name: true } },
                },
              },
            },
          });

          // Remove password from response
          const { password, ...userWithoutPassword } = newUser;
          results.createdUsers.push(userWithoutPassword);
          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            rowIndex: i + 1,
            employeeCode: userData.employeeCode,
            error: error.message,
          });
        }
      }
    });

    return results;
  }

  // ========== SEARCH ==========

  /**
   * Search user by employee code
   */
  async searchByEmployeeCode(employeeCode: string) {
    const user = await this.prisma.user.findUnique({
      where: { employeeCode },
      include: {
        office: {
          select: { id: true, name: true, type: true },
        },
        jobPosition: {
          include: {
            position: { select: { name: true, level: true } },
            department: { select: { id: true, name: true } },
          },
        },
        group: {
          select: {
            id: true,
            name: true,
            code: true,
            team: {
              select: {
                id: true,
                name: true,
                code: true,
                line: {
                  select: {
                    id: true,
                    name: true,
                    code: true,
                    factory: {
                      select: {
                        id: true,
                        name: true,
                        code: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(
        `User with employee code "${employeeCode}" not found`,
      );
    }

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}
