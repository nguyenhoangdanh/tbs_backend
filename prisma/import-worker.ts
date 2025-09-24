import { PrismaClient, Role, OfficeType, Sex } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import { format, isValid, parse } from 'date-fns';

// Get database URL with proper environment detection
const getDatabaseUrl = () => {
  const dbUrl = process.env.DATABASE_URL;
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  if (dbUrl) {
    console.log('📡 Using DATABASE_URL from environment');
    console.log(`📍 Environment: ${nodeEnv}`);
    
    // Log masked URL for debugging
    const maskedUrl = dbUrl.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
    console.log(`🔗 Database: ${maskedUrl}`);
    
    return dbUrl;
  }
  
  // In production without DATABASE_URL, this is an error
  console.error('❌ No DATABASE_URL configured in production environment');
  console.error('💡 Please set DATABASE_URL environment variable');
  throw new Error('DATABASE_URL is required in production');
};

// Initialize PrismaClient with proper database URL detection
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: getDatabaseUrl()
    }
  },
  log: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['error', 'warn', 'info']
});

interface ExcelRow {
  msnv: string;    // Mã số nhân viên (A)
  hoTen: string;   // Họ và tên (B)
  cd: string;      // Chức danh (C)
  vt: string;      // Vị trí công việc (D)
  pb: string;      // Phòng ban (E)
  tt: string;      // Trực thuộc (F)
  phone?: string;  // Phone (G)
  managementLevel1?: string; // Cán bộ quản lý trực tiếp Cấp 1 (H)
  managementLevel2?: string; // Cán bộ quản lý trực tiếp Cấp 2 (I)
  managementLevel3?: string; // Cán bộ quản lý trực tiếp Cấp 3 (J)
   dateOfBirth?: string | null; // Ngày sinh (Optional) (K)
  sex?: Sex | null; // Giới tính (Optional) (L)
  email?: string;  // Email (auto-generated if missing)
  role?: string;   // Role (Optional: ADMIN, USER, MEDICAL_STAFF)
}

interface ProcessedData {
  offices: Set<string>;
  departments: Map<string, { name: string; office: string }>;
  positions: Set<string>;
  jobPositions: Map<string, { cd: string; vt: string; pb: string; tt: string }>;
  users: ExcelRow[];
  managementRelations: Array<{
    userMsnv: string;
    managerMsnv: string;
    level: number;
  }>; // New field to track management relationships
}

async function testConnection(): Promise<boolean> {
  try {
    console.log('🔍 Testing database connection...');
    
    // Add connection timeout for production
    const connectionPromise = prisma.$connect();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Connection timeout after 15 seconds')), 15000)
    );
    
    await Promise.race([connectionPromise, timeoutPromise]);
    
    // Test with a simple query
    const queryPromise = prisma.$queryRaw`SELECT 1 as test, current_database() as db_name, current_user as user_name`;
    const queryTimeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Query timeout after 10 seconds')), 10000)
    );
    
    const result = await Promise.race([queryPromise, queryTimeoutPromise]) as any[];
    
    console.log('✅ Database connection successful');
    console.log('📊 Connection info:', {
      database: result[0]?.db_name,
      user: result[0]?.user_name,
      environment: process.env.NODE_ENV || 'development'
    });
    
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    
    if (process.env.NODE_ENV === 'production') {
      console.error('🔍 Production debugging info:', {
        hasDbUrl: !!process.env.DATABASE_URL,
        nodeEnv: process.env.NODE_ENV,
        errorType: error.constructor.name,
        errorMessage: error.message
      });
    }
    
    return false;
  }
}

// Function to determine if position is management and can view hierarchy
function getPositionProperties(positionName: string): { isManagement: boolean; canViewHierarchy: boolean; level: number, isReportable: boolean } {

  // Default worker
  return { isManagement: false, canViewHierarchy: false, level: 8, isReportable: false };
}

function convertSex(sexStr: string | undefined): Sex | undefined {
  if (!sexStr) return undefined;
   
  // Normalize Unicode để handle combining characters
  const normalized = sexStr.trim().toLowerCase().normalize('NFC');
  
  if (normalized === 'nam') {
    return Sex.MALE;
  }
  
  // So sánh với cả hai dạng Unicode của "nữ"
  if (normalized === 'nữ' || normalized.normalize('NFD') === 'nữ'.normalize('NFD')) {
    return Sex.FEMALE;
  }
  
  return undefined;
}

function formatDateOfBirth(dob: string | null): string | null {
  if (!dob) return null;
  
  const dobValue = String(dob).trim();
  
  // Check if it's Excel serial number
  if (/^\d+(\.\d+)?$/.test(dobValue)) {
    const serialNumber = Number(dobValue);
    
    // Convert Excel serial to JS Date
   const excelEpoch = new Date(1899, 11, 31); // Try Dec 31 instead of 30
    const jsDate = new Date(
      excelEpoch.getTime() + serialNumber * 24 * 60 * 60 * 1000
    );
    
    if (!isValid(jsDate)) return null;
    
    return format(jsDate, 'yyyy-MM-dd');
  }
  
  // Handle string format DD/MM/YYYY
  if (dobValue.includes('/')) {
    try {
      const parsedDate = parse(dobValue, 'dd/MM/yyyy', new Date());
      if (!isValid(parsedDate)) return null;
      
      return format(parsedDate, 'yyyy-MM-dd');
    } catch (error) {
      console.log('Parse error:', error);
      return null;
    }
  }
  
  return null;
}

async function processExcelData(): Promise<ProcessedData> {
  console.log('📊 Processing Excel data...');
  
  const excelPath = path.join(__dirname, 'data.xlsx');
  
  try {
    const workbook = XLSX.readFile(excelPath);
    const sheetName = workbook.SheetNames[2];
    const sheet = workbook.Sheets[sheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const processed: ProcessedData = {
      offices: new Set<string>(),
      departments: new Map<string, { name: string; office: string }>(),
      positions: new Set<string>(),
      jobPositions: new Map<string, { cd: string; vt: string; pb: string; tt: string }>(),
      users: [],
      managementRelations: [] // Initialize new field
    };

    // Skip header row (first row is header)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[0] || !row[1] || !row[2] || !row[3] || !row[4] || !row[5]) {
        console.warn(`⚠️  Row ${i + 1}: Missing required data, skipping...`);
        continue;
      }

      const msnv = String(row[0]).trim();
      const hoTen = String(row[1]).trim();
      const cd = String(row[2]).trim();
      const vt = String(row[3]).trim();
      const pb = String(row[4]).trim();
      const tt = String(row[5]).trim();
      const phone = row[6] ? String(row[6]).trim() : '';
      
      // NEW: Extract management levels
      const managementLevel1 = row[7] ? String(row[7]).trim() : '';
      const managementLevel2 = row[8] ? String(row[8]).trim() : '';
      const managementLevel3 = row[9] ? String(row[9]).trim() : '';

      // NEW: Extract dateOfBirth and sex
      const dateOfBirth = row[10] ? formatDateOfBirth(String(row[10]).trim()) : null;
      const sex = row[11] ? convertSex(String(row[11]).trim()) : undefined;

      const email =  undefined;
      const role = undefined;

      if (!msnv || !hoTen || !cd || !vt || !pb || !tt) {
        console.warn(`⚠️  Row ${i + 1}: Empty values detected, skipping...`);
        continue;
      }

      // Collect unique offices
      processed.offices.add(tt);

      // Collect unique departments (unique by name + office)
      const deptKey = `${pb}__${tt}`;
      if (!processed.departments.has(deptKey)) {
        processed.departments.set(deptKey, { name: pb, office: tt });
      }

      // Collect unique positions
      processed.positions.add(cd);

      // Collect unique job positions (unique by all 4 fields)
      const jobKey = `${cd}__${vt}__${pb}__${tt}`;
      if (!processed.jobPositions.has(jobKey)) {
        processed.jobPositions.set(jobKey, { cd, vt, pb, tt });
      }

      // Store for user creation with management data
      processed.users.push({ 
        msnv, hoTen, cd, vt, pb, tt, phone, 
        managementLevel1, managementLevel2, managementLevel3,
        dateOfBirth, sex,
        email, role 
      });

      // NEW: Collect management relationships
      if (managementLevel1) {
        processed.managementRelations.push({
          userMsnv: msnv,
          managerMsnv: managementLevel1,
          level: 1
        });
      }
      if (managementLevel2) {
        processed.managementRelations.push({
          userMsnv: msnv,
          managerMsnv: managementLevel2,
          level: 2
        });
      }
      if (managementLevel3) {
        processed.managementRelations.push({
          userMsnv: msnv,
          managerMsnv: managementLevel3,
          level: 3
        });
      }
    }

    console.log(`📈 Data summary:`);
    console.log(`   - Offices: ${processed.offices.size}`);
    console.log(`   - Departments: ${processed.departments.size}`);
    console.log(`   - Positions: ${processed.positions.size}`);
    console.log(`   - Job Positions: ${processed.jobPositions.size}`);
    console.log(`   - Users to create: ${processed.users.length}`);
    console.log(`   - Management relations: ${processed.managementRelations.length}`);

    return processed;
  } catch (error) {
    console.error('❌ Failed to read Excel file:', error.message);
    throw error;
  }
}

async function createOffices(offices: Set<string>): Promise<Map<string, any>> {
  console.log('\n🏢 Creating/updating offices...');
  const officeMap = new Map<string, any>();

  for (const officeName of offices) {
    try {
      let officeType: OfficeType;
      let description: string;
      
      if (officeName.includes('VP') || officeName.includes('Văn phòng') || 
          officeName.includes('VPĐH') || officeName.includes('Điều hành')) {
        officeType = OfficeType.HEAD_OFFICE;
        description = `Văn phòng điều hành ${officeName}`;
      } else {
        officeType = OfficeType.FACTORY_OFFICE;
        description = `Văn phòng điều hành ${officeName}`;
      }

      const office = await prisma.office.upsert({
        where: { name: officeName },
        update: {
          type: officeType,
          description: description,
        },
        create: {
          name: officeName,
          type: officeType,
          description: description,
        },
      });

      officeMap.set(officeName, office);
      console.log(`   ✅ ${officeName} (${officeType})`);
    } catch (error) {
      console.error(`   ❌ Failed to create office ${officeName}:`, error.message);
    }
  }

  return officeMap;
}

async function createDepartments(
  departments: Map<string, { name: string; office: string }>, 
  officeMap: Map<string, any>
): Promise<Map<string, any>> {
  console.log('\n🏬 Creating/updating departments...');
  const departmentMap = new Map<string, any>();

  for (const [deptKey, dept] of departments) {
    try {
      const office = officeMap.get(dept.office);
      if (!office) {
        console.warn(`   ⚠️  Office not found for department: ${dept.name} (${dept.office})`);
        continue;
      }

      const description = `${dept.name} - ${dept.office}`;

      const department = await prisma.department.upsert({
        where: {
          name_officeId: {
            name: dept.name,
            officeId: office.id,
          }
        },
        update: {
          description: description,
        },
        create: {
          name: dept.name,
          description: description,
          officeId: office.id,
        },
      });

      departmentMap.set(deptKey, department);
      console.log(`   ✅ ${dept.name} (${dept.office})`);
    } catch (error) {
      console.error(`   ❌ Failed to create department ${dept.name}:`, error.message);
    }
  }

  return departmentMap;
}

async function createPositions(positions: Set<string>): Promise<Map<string, any>> {
  console.log('\n👔 Creating/updating positions...');
  const positionMap = new Map<string, any>();

  for (const positionName of positions) {
    try {
      let description: string;
      const pos = positionName.toLowerCase();
      
      if (pos === 'nv' || pos === 'nhân viên') {
        description = 'Nhân viên';
      } else if (pos === 'tp' || pos === 'trưởng phòng') {
        description = 'Trưởng phòng';
      } else if (pos === 'pgđ' || pos === 'phó giám đốc') {
        description = 'Phó giám đốc';
      } else if (pos === 't.team' || pos === 'trưởng team') {
        description = 'Trưởng Team';
      } else if (pos === 'gđ' || pos === 'giám đốc') {
        description = 'Giám Đốc';
      } else if (pos === 't.line' || pos === 'trưởng line') {
        description = 'Trưởng Line';
      } else if (pos === 'tl' || pos === 'trợ lý') {
        description = 'Trợ lý';
      } else if (pos === 'đt' || pos === 'đội trưởng') {
        description = 'Đội trưởng';
      } else if (pos === 'tca' || pos === 'trưởng ca') {
        description = 'Trưởng ca';
      } else if (pos === 'tt' || pos === 'tổ trưởng') {
        description = 'Tổ trưởng';
      } else if (pos === 'tgđ' || pos === 'tổng giám đốc') {
        description = 'Tổng Giám Đốc';
      } else {
        description = positionName;
      }

      // Get position properties based on name
      const { isManagement, canViewHierarchy, level } = getPositionProperties(positionName);
      
      // Set isReportable based on level (CEO level 0 không cần nộp báo cáo)
      const isReportable = level > 0;

      const position = await prisma.position.upsert({
        where: { name: positionName },
        update: {
          description: description,
          level: level,
          isManagement: isManagement,
          canViewHierarchy: canViewHierarchy,
          isReportable: isReportable
        },
        create: {
          name: positionName,
          description: description,
          level: level,
          priority: 0,
          isManagement: isManagement,
          isReportable: isReportable,
          canViewHierarchy: canViewHierarchy
        },
      });

      positionMap.set(positionName, position);
      console.log(`   ✅ ${positionName} → ${description} (Level: ${level}, Management: ${isManagement}, CanView: ${canViewHierarchy}, Reportable: ${isReportable})`);
    } catch (error) {
      console.error(`   ❌ Failed to create position ${positionName}:`, error.message);
    }
  }

  return positionMap;
}

async function createJobPositions(
  jobPositions: Map<string, { cd: string; vt: string; pb: string; tt: string }>,
  positionMap: Map<string, any>,
  departmentMap: Map<string, any>,
  officeMap: Map<string, any>  // Add officeMap parameter
): Promise<Map<string, any>> {
  console.log('\n💼 Creating/updating job positions...');
  const jobPositionMap = new Map<string, any>();

  for (const [jobKey, jp] of jobPositions) {
    try {
      const position = positionMap.get(jp.cd);
      const department = departmentMap.get(`${jp.pb}__${jp.tt}`);
      const office = officeMap.get(jp.tt);  // Get office for denormalized officeId

      if (!position) {
        console.warn(`   ⚠️  Position not found: ${jp.cd} for job ${jp.vt}`);
        continue;
      }

      if (!department) {
        console.warn(`   ⚠️  Department not found: ${jp.pb} (${jp.tt}) for job ${jp.vt}`);
        continue;
      }

      if (!office) {
        console.warn(`   ⚠️  Office not found: ${jp.tt} for job ${jp.vt}`);
        continue;
      }

      const code = `${jp.cd.replace(/\s+/g, '').toUpperCase()}_${jp.vt.replace(/\s+/g, '').toUpperCase()}_${jp.pb.replace(/\s+/g, '').toUpperCase()}`;
      const description = `${jp.cd} - ${jp.vt} tại phòng ban ${jp.pb} (${jp.tt})`;

      const jobPosition = await prisma.jobPosition.upsert({
        where: {
          positionId_jobName_departmentId: {
            positionId: position.id,
            jobName: jp.vt,
            departmentId: department.id,
          }
        },
        update: {
          code: code,
          description: description,
          officeId: office.id,  // Update officeId
        },
        create: {
          jobName: jp.vt,
          code: code,
          description: description,
          positionId: position.id,
          departmentId: department.id,
          officeId: office.id,  // Add officeId for denormalized queries
        },
      });

      jobPositionMap.set(jobKey, jobPosition);
      console.log(`   ✅ ${jp.vt} (${jp.cd} - ${jp.pb})`);
    } catch (error) {
      console.error(`   ❌ Failed to create job position ${jp.vt}:`, error.message);
    }
  }

  return jobPositionMap;
}

async function createUsers(
  users: ExcelRow[],
  jobPositionMap: Map<string, any>,
  officeMap: Map<string, any>
): Promise<Map<string, any>> { // Return user map for management relations
  console.log('\n👥 Creating users...');
  
  const hashedPassword = await bcrypt.hash('123456', 10);
  let successCount = 0;
  let errorCount = 0;
  let skipCount = 0;
  const userMap = new Map<string, any>(); // Track created users

  for (let i = 0; i < users.length; i++) {
    const userData = users[i];
    
    try {
      const employeeCode = userData.msnv;
      const fullName = userData.hoTen;
      const phone = userData.phone || '';
      
      const userRole =  Role.WORKER;

      // Check if user already exists by employeeCode only
      const existingUser = await prisma.user.findUnique({
        where: {
          employeeCode: employeeCode
        }
      });

      if (existingUser) {
        console.warn(`   ⚠️  User already exists: ${employeeCode} - ${fullName}`);
        userMap.set(employeeCode, existingUser); // Store existing user
        skipCount++;
        continue;
      }

      // Find job position and office
      const jobKey = `${userData.cd}__${userData.vt}__${userData.pb}__${userData.tt}`;
      const jobPosition = jobPositionMap.get(jobKey);
      const office = officeMap.get(userData.tt);

      if (!jobPosition) {
        console.warn(`   ⚠️  Job position not found for user: ${employeeCode} - ${fullName} (${jobKey})`);
        errorCount++;
        continue;
      }

      if (!office) {
        console.warn(`   ⚠️  Office not found for user: ${employeeCode} - ${fullName} (${userData.tt})`);
        errorCount++;
        continue;
      }

      // Split fullName to firstName and lastName
      const nameParts = fullName.split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ') || '';
        const dateOfBirth = userData.dateOfBirth ? new Date(userData.dateOfBirth) : null;
      const sex = userData.sex || null;

      // Create user with proper email and role
      const newUser = await prisma.user.create({
        data: {
          employeeCode,
          email: undefined,
          password: hashedPassword,
          firstName,
          lastName,
          phone,
          dateOfBirth,
          sex,
          role: userRole,
          jobPositionId: jobPosition.id,
          officeId: office.id,
        },
      });

      userMap.set(employeeCode, newUser); // Store created user
      successCount++;
      console.log(`   ✅ ${employeeCode} - ${fullName} (${userData.vt}) [${userRole}]`);

    } catch (error) {
      console.error(`   ❌ Error creating user ${userData.msnv} - ${userData.hoTen}:`, error.message);
      errorCount++;
    }
  }

  console.log('\n📊 Users creation summary:');
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ⚠️  Skipped (already exists): ${skipCount}`);
  console.log(`   ❌ Failed: ${errorCount}`);
  
  // Show role distribution
  console.log('\n👥 Role Distribution:');
  const roleStats = await prisma.user.groupBy({
    by: ['role'],
    _count: { role: true },
  });
  
  roleStats.forEach(stat => {
    console.log(`   ${stat.role}: ${stat._count.role} users`);
  });

  // Show email examples
  console.log('\n📧 Email Examples:');
  const sampleUsers = await prisma.user.findMany({
    take: 5,
    select: {
      firstName: true,
      lastName: true,
      email: true,
    }
  });
  
  sampleUsers.forEach(user => {
    console.log(`   ${user.firstName} ${user.lastName} → ${user.email}`);
  });

  return userMap;
}

// NEW: Function to create management relationships
async function createManagementRelations(
  managementRelations: Array<{ userMsnv: string; managerMsnv: string; level: number }>,
  userMap: Map<string, any>
): Promise<void> {
  console.log('\n👔 Creating management relationships...');
  
  let successCount = 0;
  let errorCount = 0;
  let skipCount = 0;

  // Group by manager to find departments they manage
  const managerDepartments = new Map<string, Set<string>>();

  for (const relation of managementRelations) {
    const user = userMap.get(relation.userMsnv);
    const manager = userMap.get(relation.managerMsnv);

    if (!user) {
      console.warn(`   ⚠️  User not found: ${relation.userMsnv}`);
      errorCount++;
      continue;
    }

    if (!manager) {
      console.warn(`   ⚠️  Manager not found: ${relation.managerMsnv}`);
      errorCount++;
      continue;
    }

    // Get user's department
    const userWithJobPosition = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        jobPosition: {
          include: { department: true }
        }
      }
    });

    if (!userWithJobPosition?.jobPosition?.department) {
      console.warn(`   ⚠️  Department not found for user: ${relation.userMsnv}`);
      errorCount++;
      continue;
    }

    const departmentId = userWithJobPosition.jobPosition.department.id;
    
    // Track departments this manager manages
    if (!managerDepartments.has(relation.managerMsnv)) {
      managerDepartments.set(relation.managerMsnv, new Set());
    }
    managerDepartments.get(relation.managerMsnv)!.add(departmentId);
  }

  // Create UserDepartmentManagement records
  for (const [managerMsnv, departments] of managerDepartments) {
    const manager = userMap.get(managerMsnv);
    if (!manager) continue;

    for (const departmentId of departments) {
      try {
        // Check if relationship already exists
        const existingRelation = await prisma.userDepartmentManagement.findUnique({
          where: {
            userId_departmentId: {
              userId: manager.id,
              departmentId: departmentId
            }
          }
        });

        if (existingRelation) {
          console.warn(`   ⚠️  Management relation already exists: ${managerMsnv} -> Dept ${departmentId}`);
          skipCount++;
          continue;
        }

        await prisma.userDepartmentManagement.create({
          data: {
            userId: manager.id,
            departmentId: departmentId,
            isActive: true
          }
        });

        successCount++;
        
        // Get department name for logging
        const department = await prisma.department.findUnique({
          where: { id: departmentId },
          select: { name: true }
        });
        
        console.log(`   ✅ ${managerMsnv} manages department: ${department?.name || departmentId}`);

      } catch (error) {
        console.error(`   ❌ Error creating management relation ${managerMsnv} -> ${departmentId}:`, error.message);
        errorCount++;
      }
    }
  }

  console.log('\n📊 Management relationships summary:');
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ⚠️  Skipped (already exists): ${skipCount}`);
  console.log(`   ❌ Failed: ${errorCount}`);

  // Show management statistics
  console.log('\n👥 Management Statistics:');
  const managementStats = await prisma.userDepartmentManagement.findMany({
    include: {
      user: {
        select: {
          employeeCode: true,
          firstName: true,
          lastName: true,
          jobPosition: {
            include: {
              position: { select: { name: true } }
            }
          }
        }
      },
      department: {
        select: { name: true }
      }
    }
  });

  const managerCounts = new Map<string, number>();
  managementStats.forEach(stat => {
    const managerKey = `${stat.user.employeeCode} - ${stat.user.firstName} ${stat.user.lastName} (${stat.user.jobPosition?.position?.name})`;
    managerCounts.set(managerKey, (managerCounts.get(managerKey) || 0) + 1);
  });

  console.log(`   Total managers: ${managerCounts.size}`);
  console.log(`   Total department management relations: ${managementStats.length}`);
  
  // Show top managers by department count
  const sortedManagers = Array.from(managerCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
    
  console.log('\n🏆 Top Managers by Department Count:');
  sortedManagers.forEach(([manager, count]) => {
    console.log(`   ${manager}: ${count} departments`);
  });
}

async function main() {
  console.log('🚀 Starting complete data import from Excel...\n');
  
  const nodeEnv = process.env.NODE_ENV || 'development';
  const dbUrl = process.env.DATABASE_URL;
  
  if (dbUrl) {
    const maskedUrl = dbUrl.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
    
    if (dbUrl.includes('flycast') || dbUrl.includes('fly.dev')) {
      console.log('🌐 Detected: Production environment (Fly.io)');
    } else if (dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1')) {
      console.log('🏠 Detected: Local environment');
    } else {
      console.log('🔍 Detected: External database');
    }
  } else {
    console.log('❌ No DATABASE_URL configured');
  }

  try {
    // Test database connection first
    console.log('\n🔄 Step 1: Testing database connection...');
    const connected = await testConnection();
    if (!connected) {
      console.error('❌ Cannot connect to database. Import aborted.');
      
      if (nodeEnv === 'production') {
        console.error('\n💡 Production troubleshooting:');
        console.error('   1. Check if DATABASE_URL secret is set correctly');
        console.error('   2. Verify database is running: flyctl status -a weekly-report-backend-db');
        console.error('   3. Test connection: flyctl ssh console -C "npx prisma db pull"');
        console.error('   4. Check database logs: flyctl logs -a weekly-report-backend-db');
      }
      
      process.exit(1);
    }

    // Check if Excel file exists
    const excelPath = path.join(__dirname, 'data.xlsx');
    console.log(`\n🔄 Step 2: Checking Excel file at: ${excelPath}`);
    
    try {
      if (!fs.existsSync(excelPath)) {
        console.error('❌ Excel file not found at:', excelPath);
        console.error('💡 Expected file: prisma/data.xlsx');
        
        console.log('📁 Current directory contents:');
        try {
          const files = fs.readdirSync(__dirname);
          files.forEach(file => console.log(`   ${file}`));
        } catch (err) {
          console.error('❌ Cannot list directory contents:', err.message);
        }
        
        process.exit(1);
      }
      
      const stats = fs.statSync(excelPath);
      console.log('✅ Excel file found');
      console.log(`📊 File size: ${(stats.size / 1024).toFixed(2)} KB`);
      console.log(`📅 Last modified: ${stats.mtime.toISOString()}`);
    } catch (error) {
      console.error('❌ Error checking Excel file:', error.message);
      process.exit(1);
    }

    // Process Excel data
    console.log('\n🔄 Step 3: Processing Excel data...');
    const processedData = await processExcelData();

    // Create database entities step by step
    console.log('\n🔄 Step 4: Creating database entities...');
    
    const officeMap = await createOffices(processedData.offices);
    const departmentMap = await createDepartments(processedData.departments, officeMap);
    const positionMap = await createPositions(processedData.positions);
    const jobPositionMap = await createJobPositions(
      processedData.jobPositions, 
      positionMap, 
      departmentMap,
      officeMap
    );
    
    const userMap = await createUsers(processedData.users, jobPositionMap, officeMap);

    // NEW: Step 5 - Create management relationships
    console.log('\n🔄 Step 5: Creating management relationships...');
    await createManagementRelations(processedData.managementRelations, userMap);

    console.log('\n🎉 Complete data import finished successfully!');
    console.log('\n📋 Final summary:');
    console.log(`   🏢 Offices: ${processedData.offices.size}`);
    console.log(`   🏬 Departments: ${processedData.departments.size}`);
    console.log(`   👔 Positions: ${processedData.positions.size}`);
    console.log(`   💼 Job Positions: ${processedData.jobPositions.size}`);
    console.log(`   👥 Users: ${processedData.users.length} processed`);
    console.log(`   🔗 Management Relations: ${processedData.managementRelations.length} processed`);
    
    console.log('\n🔧 Environment summary:');
    console.log(`   Environment: ${nodeEnv}`);
    console.log(`   Database: ${dbUrl ? 'Connected' : 'Fallback'}`);
    console.log(`   Excel file: Found and processed`);

  } catch (error) {
    console.error('\n❌ Import failed:', error.message);
    console.error('Stack trace:', error.stack);
    
    if (nodeEnv === 'production') {
      console.error('\n🔍 Production error details:', {
        environment: nodeEnv,
        hasDbUrl: !!process.env.DATABASE_URL,
        errorType: error.constructor.name,
        timestamp: new Date().toISOString()
      });
    }
    
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error('❌ Critical import error:', e.message);
    console.error('Stack:', e.stack);
    process.exit(1);
  })
  .finally(async () => {
    try {
      await prisma.$disconnect();
      console.log('🔄 Database connection closed');
    } catch (error) {
      console.error('❌ Error closing database connection:', error.message);
    }
  });