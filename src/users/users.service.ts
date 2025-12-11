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
import { Role, Sex } from '@prisma/client';
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
        office: {
          select: { id: true, name: true, type: true }
        },
        jobPosition: {
          include: {
            position: {
              select: { 
                id: true, 
                name: true, 
                description: true, 
                level: true, 
                isManagement: true, 
                canViewHierarchy: true 
              }
            },
            department: {
              select: { id: true, name: true }
            },
          },
        },
        group: {
          include: {
            team: {
              include: {
                department: {
                  include: {
                    office: true,
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
    
    // ⭐ Department ID acts as Line ID for production departments
    let departmentId: string | null = null;
    
    // 1. If user has group, get department from group.team.department
    if (user.group?.team?.department?.id) {
      departmentId = user.group.team.department.id;
    }
    // 2. If user manages departments, use the first managed department as their "line"
    else if (user.managedDepartments && user.managedDepartments.length > 0) {
      const managedDept = user.managedDepartments[0];
      if (managedDept.department) {
        departmentId = managedDept.department.id;
        console.log('✅ [UserService] User manages department (line):', {
          userId: user.id,
          departmentId: departmentId,
          departmentName: managedDept.department.name
        });
      }
    }
    
    return {
      ...userWithoutPassword,
      isManager: user.jobPosition.position.isManagement || user.jobPosition.position.canViewHierarchy || false,
      departmentId, // ⭐ Department ID (= Line ID for production departments)
    };
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
      // Read Excel file with proper options to handle styled headers
      const workbook = XLSX.read(file.buffer, { 
        type: 'buffer',
        cellStyles: true, // Read cell styles
        cellDates: true, // Parse dates
      });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      
      // Parse rows with defval to handle empty cells
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, {
        defval: '', // Default value for empty cells
        raw: false, // Format cell values
      });

      // Debug: Log first row to check headers
      this.logger.debug(`Total rows from Excel: ${rows.length}`);
      if (rows.length > 0) {
        this.logger.debug(`First row keys: ${Object.keys(rows[0]).join(', ')}`);
        this.logger.debug(`First row data: ${JSON.stringify(rows[0])}`);
      }

      const results = {
        total: rows.length,
        success: 0,
        failed: 0,
        errors: [] as any[],
      };

      // Pre-load all offices, departments, positions, jobPositions for lookup
      const [offices, departments, positions, jobPositions] = await Promise.all([
        this.prisma.office.findMany(),
        this.prisma.department.findMany(),
        this.prisma.position.findMany(),
        this.prisma.jobPosition.findMany({
          include: {
            position: true,
            department: true,
            office: true,
          },
        }),
      ]);

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNumber = i + 2; // Excel row number (1-based + header)

        try {
          // Debug: Log raw row data
          this.logger.debug(`Processing row ${rowNumber}: ${JSON.stringify(row)}`);
          
          // Parse 12 columns from Excel (A -> L)
          // Try multiple possible header names in case of encoding issues
          const msnv = String(row['MSNV'] || row['msnv'] || '').trim();
          const hoTen = String(row['HỌ VÀ TÊN'] || row['hoTen'] || '').trim();
          const cd = String(row['CD'] || row['cd'] || '').trim(); // Position
          const vtcv = String(row['VTCV'] || row['vtcv'] || '').trim(); // Job Position
          const phongBan = String(row['Phòng ban'] || row['phongBan'] || '').trim();
          const trucThuoc = String(row['Trực thuộc'] || row['trucThuoc'] || '').trim(); // Office
          const sdt = row['SĐT'] || row['sdt'] ? String(row['SĐT'] || row['sdt']).trim() : undefined;
          const ngaySinh = row['Ngày tháng năm sinh'] || row['ngaySinh'] ? String(row['Ngày tháng năm sinh'] || row['ngaySinh']).trim() : undefined;
          const gioiTinh = row['Giới tính'] || row['gioiTinh'] ? String(row['Giới tính'] || row['gioiTinh']).trim() : undefined;

          this.logger.debug(`Parsed values - MSNV: ${msnv}, Họ tên: ${hoTen}, CD: ${cd}, VTCV: ${vtcv}, Phòng ban: ${phongBan}, Trực thuộc: ${trucThuoc}`);

          // Validate required fields
          if (!msnv || !hoTen || !cd || !vtcv || !phongBan || !trucThuoc) {
            throw new Error('Thiếu thông tin bắt buộc: MSNV, Họ tên, CD, VTCV, Phòng ban, Trực thuộc');
          }

          // Split full name into firstName and lastName
          const nameParts = hoTen.split(' ');
          const lastName = nameParts[nameParts.length - 1];
          const firstName = nameParts.slice(0, -1).join(' ') || lastName;

          // ⭐ Determine role based on Position (CD)
          // CN (Công nhân) = WORKER, others = USER
          const role = cd.toUpperCase() === 'CN' ? Role.WORKER : Role.USER;

          // Lookup Office by name (Trực thuộc)
          const office = offices.find(
            (o) => o.name.toLowerCase() === trucThuoc.toLowerCase()
          );
          if (!office) {
            throw new Error(`Không tìm thấy văn phòng: ${trucThuoc}`);
          }

          // Lookup Department by name and office
          const department = departments.find(
            (d) =>
              d.name.toLowerCase() === phongBan.toLowerCase() &&
              d.officeId === office.id
          );
          if (!department) {
            throw new Error(`Không tìm thấy phòng ban: ${phongBan} thuộc ${trucThuoc}`);
          }

          // Lookup Position by name (CD)
          const position = positions.find(
            (p) => p.name.toLowerCase() === cd.toLowerCase()
          );
          if (!position) {
            throw new Error(`Không tìm thấy chức danh: ${cd}`);
          }

          // Lookup JobPosition by position, jobName, and department
          const jobPosition = jobPositions.find(
            (jp) =>
              jp.positionId === position.id &&
              jp.jobName.toLowerCase() === vtcv.toLowerCase() &&
              jp.departmentId === department.id
          );
          if (!jobPosition) {
            throw new Error(
              `Không tìm thấy vị trí công việc: ${vtcv} (${cd}) trong phòng ban ${phongBan}`
            );
          }

          // Parse date of birth (dd/mm/yyyy)
          let dateOfBirth: string | undefined;
          if (ngaySinh) {
            const parts = ngaySinh.split('/');
            if (parts.length === 3) {
              const [day, month, year] = parts;
              dateOfBirth = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            }
          }

          // Parse sex
          let sex: Sex | undefined;
          if (gioiTinh) {
            const gioiTinhLower = gioiTinh.toLowerCase();
            if (gioiTinhLower === 'nam') {
              sex = Sex.MALE;
            } else if (gioiTinhLower === 'nữ' || gioiTinhLower === 'nu') {
              sex = Sex.FEMALE;
            }
          }

          // Email will be null for workers (they don't need email)
          // Only generate if explicitly provided in Excel
          const email = undefined; // Let email be null/empty

          // Map to CreateUserDto
          const createUserDto: CreateUserDto = {
            employeeCode: msnv,
            firstName,
            lastName,
            email, // Will be undefined -> null in database
            phone: sdt,
            role,
            jobPositionId: jobPosition.id,
            officeId: office.id,
            password: '123456',
          };

          // Create user with additional fields
          const hashedPassword = await bcrypt.hash('123456', 10);
          await this.prisma.user.create({
            data: {
              ...createUserDto,
              password: hashedPassword,
              dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
              sex,
              isActive: true,
            },
          });

          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            row: rowNumber,
            employeeCode: row['MSNV'] || row['msnv'] || '',
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
    // Create Excel template với đúng 12 cột từ A -> L
    const template = [
      {
        'MSNV': 'NV001',
        'HỌ VÀ TÊN': 'Nguyễn Văn A',
        'CD': 'NV',
        'VTCV': 'Nhân viên',
        'Phòng ban': 'Phòng Kinh doanh',
        'Trực thuộc': 'VPĐH TH',
        'SĐT': '0123456789',
        'Cán bộ quản lý trực tiếp Cấp 1': 'NV002',
        'Cán bộ quản lý trực tiếp Cấp 2': 'NV003',
        'Cán bộ quản lý trực tiếp Cấp 3': '',
        'Ngày tháng năm sinh': '01/01/1990',
        'Giới tính': 'Nam',
      },
      {
        'MSNV': 'CN001',
        'HỌ VÀ TÊN': 'Trần Thị B',
        'CD': 'CN',
        'VTCV': 'Công nhân',
        'Phòng ban': 'Phòng Sản xuất',
        'Trực thuộc': 'NM TS1',
        'SĐT': '0987654321',
        'Cán bộ quản lý trực tiếp Cấp 1': 'TT001',
        'Cán bộ quản lý trực tiếp Cấp 2': '',
        'Cán bộ quản lý trực tiếp Cấp 3': '',
        'Ngày tháng năm sinh': '15/05/1995',
        'Giới tính': 'Nữ',
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
                department: {
                  select: {
                    id: true,
                    name: true,
                    office: {
                      select: {
                        id: true,
                        name: true,
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
