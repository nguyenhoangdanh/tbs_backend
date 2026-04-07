import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CloudflareR2Service } from '../common/r2.service';
import { PermissionsService } from '../common/permissions.service';
import { Sex } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as XLSX from 'xlsx';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

interface GetAllUsersParams {
  page: number;
  limit: number;
  search?: string;
  employeeCode?: string;
  officeId?: string;
  departmentId?: string;
  role?: string;
  isActive?: boolean;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private r2Service: CloudflareR2Service,
    private permissionsService: PermissionsService,
  ) {}

  // ========== USER CRUD ==========

  async getAllUsers(params: GetAllUsersParams) {
    const { page, limit, search, employeeCode, officeId, departmentId, role, isActive } =
      params;

    const skip = (page - 1) * limit;

    const where: any = {};

    if (employeeCode) {
      where.employeeCode = { contains: employeeCode.trim(), mode: 'insensitive' };
    } else if (search) {
      // Normalize search to uppercase so lowercase input matches all-caps stored data
      const normalized = search.trim().toLocaleUpperCase('vi');
      const tokens = normalized.split(/\s+/).filter(Boolean);
      if (tokens.length === 1) {
        where.OR = [
          { employeeCode: { contains: tokens[0], mode: 'insensitive' } },
          { firstName: { contains: tokens[0], mode: 'insensitive' } },
          { lastName: { contains: tokens[0], mode: 'insensitive' } },
          { email: { contains: search.trim(), mode: 'insensitive' } },
        ];
      } else {
        // Multi-word: every token must match at least one name field
        where.AND = tokens.map((token) => ({
          OR: [
            { firstName: { contains: token, mode: 'insensitive' } },
            { lastName: { contains: token, mode: 'insensitive' } },
            { employeeCode: { contains: token, mode: 'insensitive' } },
          ],
        }));
      }
    }

    if (officeId) where.officeId = officeId;
    if (role) where.roles = { some: { roleDefinition: { code: role } } };
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

    // Add permissions for each user (including roles)
    const usersWithPermissions = await Promise.all(
      users.map(async ({ password, ...user }) => {
        const permissions = await this.permissionsService.getUserPermissions(
          user.id,
        );
        return { ...user, permissions };
      }),
    );

    return {
      data: usersWithPermissions,
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
        // console.log('✅ [UserService] User manages department (line):', {
        //   userId: user.id,
        //   departmentId: departmentId,
        //   departmentName: managedDept.department.name
        // });
      }
    }

    // Get full permissions (role + custom merged)
    const permissions = await this.permissionsService.getUserPermissions(user.id);

    // Calculate seniority from joinDate
    let yearsOfService: number | null = null;
    let monthsOfService: number | null = null;
    if (user.joinDate) {
      const now = new Date();
      const join = new Date(user.joinDate);
      const totalMonths =
        (now.getFullYear() - join.getFullYear()) * 12 +
        (now.getMonth() - join.getMonth());
      yearsOfService = Math.floor(totalMonths / 12);
      monthsOfService = totalMonths % 12;
    }
    
    return {
      ...userWithoutPassword,
      isManager: user.jobPosition.position.isManagement || user.jobPosition.position.canViewHierarchy || false,
      departmentId, // ⭐ Department ID (= Line ID for production departments)
      permissions, // ⭐ Full merged permissions (role + custom)
      yearsOfService,   // ⭐ Thâm niên (năm)
      monthsOfService,  // ⭐ Thâm niên (tháng lẻ)
    };
  }

  async createUser(createUserDto: CreateUserDto) {
    // Check if employee code already exists
    const existingUser = await this.prisma.user.findFirst({
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

    const office = await this.prisma.office.findUnique({
      where: { id: createUserDto.officeId },
    });

    if (!office) {
      throw new BadRequestException('Office not found');
    }

    // Destructure role out — User model has no `role` scalar, role assigned via UserRole
    const { role, password: _pw, ...userFields } = createUserDto;

    const user = await this.prisma.user.create({
      data: {
        ...userFields,
        password: hashedPassword,
        companyId: office.companyId,
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

    // Assign role via UserRole table
    if (role) {
      const roleDef = await this.prisma.roleDefinition.findUnique({
        where: { code: role },
      });
      if (roleDef) {
        await this.prisma.userRole.create({
          data: { userId: user.id, roleDefinitionId: roleDef.id },
        });
      }
    }

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

    // Destructure role, departmentId, positionId out — not User model fields
    const { role, departmentId: _deptId, positionId: _posId, ...profileFields } = updateProfileDto as any;

    // Check role permission - only SUPERADMIN can change role
    if (role && currentUser.role !== 'SUPERADMIN' && !currentUser.roles?.some?.((r: any) => r?.roleDefinition?.code === 'SUPERADMIN')) {
      throw new ForbiddenException('Only SUPERADMIN can change user roles');
    }

    // Check email uniqueness if changed
    if (profileFields.email && profileFields.email !== user.email) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email: profileFields.email },
      });

      if (existingEmail) {
        throw new ConflictException('Email already exists');
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: {
        ...profileFields,
        ...(profileFields.joinDate ? { joinDate: new Date(profileFields.joinDate) } : {}),
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

    // Update role via UserRole table if provided
    if (role) {
      const roleDef = await this.prisma.roleDefinition.findUnique({
        where: { code: role },
      });
      if (roleDef) {
        // Deactivate existing roles, then upsert new one
        await this.prisma.userRole.updateMany({
          where: { userId: id, isActive: true },
          data: { isActive: false },
        });
        await this.prisma.userRole.upsert({
          where: { userId_roleDefinitionId: { userId: id, roleDefinitionId: roleDef.id } },
          update: { isActive: true },
          create: { userId: id, roleDefinitionId: roleDef.id },
        });
      }
    }

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

  async getDepartments(officeId?: string, companyId?: string) {
    const where: any = {};
    if (officeId) where.officeId = officeId;
    if (companyId) where.office = { companyId };
    return this.prisma.department.findMany({
      where: Object.keys(where).length ? where : undefined,
      select: {
        id: true,
        name: true,
        officeId: true,
        office: {
          select: { name: true, companyId: true },
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

  /**
   * Parse a date string from Excel into ISO format (yyyy-mm-dd).
   * Handles:
   *   - Excel serial number (e.g. 44927)
   *   - dd/mm/yyyy or mm/dd/yyyy (auto-detected: if first part > 12 → day first)
   *   - yyyy/mm/dd or yyyy-mm-dd
   *   - dd-mm-yyyy
   */
  private parseExcelDate(raw: string): string | undefined {
    if (!raw) return undefined;
    const trimmed = raw.trim();

    // Excel serial number
    const num = Number(trimmed);
    if (!isNaN(num) && num > 10000 && num < 100000) {
      const date = new Date((num - 25569) * 86400 * 1000);
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, '0');
      const d = String(date.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    // slash-separated
    const slashParts = trimmed.split('/');
    if (slashParts.length === 3) {
      const [a, b, c] = slashParts.map((s) => s.trim());
      if (a.length === 4) {
        // yyyy/mm/dd
        return `${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}`;
      }
      if (c.length === 4) {
        const aNum = parseInt(a, 10);
        const bNum = parseInt(b, 10);
        let day: string, month: string;
        if (aNum > 12) {
          // a is definitely day → dd/mm/yyyy
          day = a.padStart(2, '0');
          month = b.padStart(2, '0');
        } else if (bNum > 12) {
          // b is definitely day → mm/dd/yyyy
          month = a.padStart(2, '0');
          day = b.padStart(2, '0');
        } else {
          // ambiguous → assume dd/mm/yyyy (Vietnamese default)
          day = a.padStart(2, '0');
          month = b.padStart(2, '0');
        }
        return `${c}-${month}-${day}`;
      }
    }

    // dash-separated
    const dashParts = trimmed.split('-');
    if (dashParts.length === 3) {
      const [a, b, c] = dashParts.map((s) => s.trim());
      if (a.length === 4) {
        return `${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}`;
      }
      if (c.length === 4) {
        return `${c}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
      }
    }

    return undefined;
  }

  async importUsersFromExcel(file: any) {
    try {
      // Read Excel file — parse by column position to avoid header encoding issues
      const workbook = XLSX.read(file.buffer, {
        type: 'buffer',
        cellDates: true,
        raw: false,
      });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      // header:1 → returns raw arrays; first element of each row is col A value
      const allRows: any[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: '',
        raw: false,
      });

      // Skip header row (index 0)
      const dataRows = allRows.slice(1).filter((r) => r.some((c) => String(c).trim() !== ''));

      this.logger.debug(`Total data rows from Excel: ${dataRows.length}`);
      if (dataRows.length > 0) {
        this.logger.debug(`Header row: ${JSON.stringify(allRows[0])}`);
        this.logger.debug(`First data row: ${JSON.stringify(dataRows[0])}`);
      }

      const results = {
        total: dataRows.length,
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

      for (let i = 0; i < dataRows.length; i++) {
        const cols = dataRows[i];
        const rowNumber = i + 2; // Excel row number (1-based + header)

        try {
          this.logger.debug(`Processing row ${rowNumber}: ${JSON.stringify(cols)}`);

          // Column positions (0-indexed): A=0, B=1, C=2, D=3, E=4, F=5, G=6, H=7, I=8, J=9
          // Supports both 10-col (new) and 12-col legacy (3 manager cols at G/H/I, date at J, sex at K)
          const msnv = String(cols[0] ?? '').trim();
          const hoTen = String(cols[1] ?? '').trim();
          const cd = String(cols[2] ?? '').trim();
          const vtcv = String(cols[3] ?? '').trim();
          const phongBan = String(cols[4] ?? '').trim();
          const trucThuoc = String(cols[5] ?? '').trim();
          const sdt = String(cols[6] ?? '').trim() || undefined;

          // Detect layout: 12-col (legacy) has manager cols at index 7/8/9 (skip them)
          // 10-col (new): index 7=Ngày sinh, 8=Ngày vào làm, 9=Giới tính
          // Heuristic: if col[7] looks like a name/code (not a date), it's legacy 12-col
          const col7 = String(cols[7] ?? '').trim();
          const looksLikeDate = (val: string) =>
            /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test(val) ||
            /^\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}$/.test(val) ||
            /^\d{5}$/.test(val); // Excel serial

          let ngaySinhRaw: string | undefined;
          let ngayVaoLamRaw: string | undefined;
          let gioiTinh: string | undefined;

          if (!col7 || looksLikeDate(col7)) {
            // 10-col new layout
            ngaySinhRaw = col7 || undefined;
            ngayVaoLamRaw = String(cols[8] ?? '').trim() || undefined;
            gioiTinh = String(cols[9] ?? '').trim() || undefined;
          } else {
            // 12-col legacy layout: skip cols 7,8,9 (manager codes)
            ngaySinhRaw = String(cols[10] ?? '').trim() || undefined;
            gioiTinh = String(cols[11] ?? '').trim() || undefined;
          }

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
          // CD values (normalized to lowercase):
          // cn           → WORKER
          // tt / tổ trưởng          → TEAM_LEADER
          // tl / ql line / trưởng line → LINE_MANAGER
          // gd / giám đốc / gd nm   → FACTORY_DIRECTOR
          // tp / tpb / tbp / nv-qlr / trưởng phòng / đơn vị → MANAGER
          // others                  → USER
          const cdKey = cd.toLowerCase().trim();
          let role: string;
          if (cdKey === 'cn') {
            role = 'WORKER';
          } else if (['tt', 'tổ trưởng', 'to truong'].includes(cdKey)) {
            role = 'TEAM_LEADER';
          } else if (['tl', 'ql line', 'ql-line', 'trưởng line', 'truong line'].includes(cdKey)) {
            role = 'LINE_MANAGER';
          } else if (['gd', 'gd nm', 'giám đốc', 'giam doc', 'giam doc nha may', 'giám đốc nhà máy'].includes(cdKey)) {
            role = 'FACTORY_DIRECTOR';
          } else if (['tp', 'tpb', 'tbp', 'trưởng phòng', 'truong phong', 'trưởng đơn vị', 'truong don vi', 'ql'].includes(cdKey)) {
            role = 'MANAGER';
          } else {
            role = 'USER';
          }

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
          let jobPosition = jobPositions.find(
            (jp) =>
              jp.positionId === position.id &&
              jp.jobName.toLowerCase() === vtcv.toLowerCase() &&
              jp.departmentId === department.id
          );
          if (!jobPosition) {
            // Auto-create JobPosition if it doesn't exist
            const jpCode = `${cd.toUpperCase()}_${vtcv.toUpperCase().replace(/\s+/g, '_').slice(0, 20)}`;
            const newJp = await this.prisma.jobPosition.create({
              data: {
                jobName: vtcv,
                code: jpCode,
                positionId: position.id,
                departmentId: department.id,
                officeId: office.id,
                isActive: true,
              },
              include: { position: true, department: true, office: true },
            });
            this.logger.log(`Auto-created JobPosition: ${vtcv} (${cd}) in ${phongBan}`);
            jobPositions.push(newJp as any); // cache for subsequent rows
            jobPosition = newJp as any;
          }

          // Parse date of birth and join date using smart format detection
          const dateOfBirthIso = this.parseExcelDate(ngaySinhRaw || '');
          const joinDateIso = this.parseExcelDate(ngayVaoLamRaw || '');

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

          // Upsert user — update if employeeCode+companyId already exists, create otherwise
          const { role: userRole, ...userFields } = createUserDto;
          const hashedPassword = await bcrypt.hash('123456', 10);
          const upsertData = {
            ...userFields,
            dateOfBirth: dateOfBirthIso ? new Date(dateOfBirthIso) : undefined,
            joinDate: joinDateIso ? new Date(joinDateIso) : undefined,
            sex,
            isActive: true,
            companyId: office.companyId,
          };
          const createdUser = await this.prisma.user.upsert({
            where: {
              employeeCode_companyId: {
                employeeCode: msnv,
                companyId: office.companyId,
              },
            },
            create: { ...upsertData, password: hashedPassword },
            update: {
              firstName: upsertData.firstName,
              lastName: upsertData.lastName,
              phone: upsertData.phone,
              jobPositionId: upsertData.jobPositionId,
              officeId: upsertData.officeId,
              dateOfBirth: upsertData.dateOfBirth,
              joinDate: upsertData.joinDate,
              sex: upsertData.sex,
            },
          });

          // Assign role via UserRole table (upsert to avoid duplicates)
          if (userRole) {
            const roleDef = await this.prisma.roleDefinition.findUnique({
              where: { code: userRole },
            });
            if (roleDef) {
              await this.prisma.userRole.upsert({
                where: {
                  userId_roleDefinitionId: {
                    userId: createdUser.id,
                    roleDefinitionId: roleDef.id,
                  },
                },
                create: { userId: createdUser.id, roleDefinitionId: roleDef.id },
                update: {},
              });
            }
          }

          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            row: rowNumber,
            employeeCode: String(cols[0] ?? '').trim(),
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
        'Ngày tháng năm sinh': '01/01/1990',
        'Ngày vào làm': '01/06/2020',
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
        'Ngày tháng năm sinh': '15/05/1995',
        'Ngày vào làm': '10/03/2022',
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
          const existingUser = await tx.user.findFirst({
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

          // Fetch office to get companyId
          const office = await tx.office.findUnique({
            where: { id: userData.officeId },
          });

          if (!office) {
            throw new Error(`Office not found for user ${userData.employeeCode}`);
          }

          // Create user — strip 'role' (not a User scalar field)
          const { role: bulkRole, password: _pw, ...bulkUserFields } = userData as any;
          const newUser = await tx.user.create({
            data: {
              ...bulkUserFields,
              password: hashedPassword,
              companyId: office.companyId,
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

          // Assign role via UserRole table
          if (bulkRole) {
            const roleDef = await tx.roleDefinition.findUnique({
              where: { code: bulkRole },
            });
            if (roleDef) {
              await tx.userRole.create({
                data: { userId: newUser.id, roleDefinitionId: roleDef.id },
              });
            }
          }

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
    const user = await this.prisma.user.findFirst({
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

  // ========== AVATAR MANAGEMENT ==========

  /**
   * Upload avatar for user
   */
  async uploadAvatar(
    userId: string,
    employeeCode: string,
    file: Express.Multer.File,
  ) {
    try {
      // Validate user exists
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Delete old avatar if exists
      if (user.avatar) {
        try {
          await this.r2Service.deleteAvatar(user.avatar);
        } catch (error) {
          this.logger.warn(`Failed to delete old avatar: ${error.message}`);
        }
      }

      // Upload new avatar to R2
      const avatarUrl = await this.r2Service.uploadAvatar(
        file,
        userId,
        employeeCode,
      );

      // Update user with new avatar URL
      await this.prisma.user.update({
        where: { id: userId },
        data: { avatar: avatarUrl },
      });

      return {
        message: 'Avatar uploaded successfully',
        avatarUrl,
      };
    } catch (error) {
      this.logger.error(`Failed to upload avatar: ${error.message}`);
      throw error;
    }
  }

  /**
   * Remove avatar for user
   */
  async removeAvatar(userId: string) {
    try {
      // Validate user exists
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Delete avatar from R2 if exists
      if (user.avatar) {
        try {
          await this.r2Service.deleteAvatar(user.avatar);
        } catch (error) {
          this.logger.warn(`Failed to delete avatar: ${error.message}`);
        }
      }

      // Update user to remove avatar
      await this.prisma.user.update({
        where: { id: userId },
        data: { avatar: null },
      });

      return {
        message: 'Avatar removed successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to remove avatar: ${error.message}`);
      throw error;
    }
  }
}
