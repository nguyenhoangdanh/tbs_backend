import { PrismaClient, Role, OfficeType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: ['error', 'warn'],
});

async function main() {
  try {
    console.log('🌱 Starting database seeding...');

    // Test connection first
    await prisma.$connect();
    console.log('✅ Database connected');

    // Check if admin already exists
    const existingAdmin = await prisma.user.findFirst({
      where: {
        OR: [
          { employeeCode: 'ADMIN001' },
          { email: 'admin@tbsgroup.vn' },
          { role: Role.SUPERADMIN },
        ],
      },
    });

    if (existingAdmin) {
      console.log('⚠️ Admin account already exists');
      console.log(`   Employee Code: ${existingAdmin.employeeCode}`);
      console.log(`   Email: ${existingAdmin.email}`);
      return;
    }

    // Create office
    const office = await prisma.office.upsert({
      where: { name: 'VP Điều Hành' },
      update: {},
      create: {
        name: 'VP Điều Hành',
        type: OfficeType.HEAD_OFFICE,
        description: 'Văn phòng điều hành chính',
      },
    });

    // Create department
    const department = await prisma.department.upsert({
      where: {
        name_officeId: {
          name: 'Ban Giám Đốc',
          officeId: office.id,
        },
      },
      update: {},
      create: {
        name: 'Ban Giám Đốc',
        description: 'Ban Giám Đốc Điều Hành',
        officeId: office.id,
      },
    });

    // Create position
    const position = await prisma.position.upsert({
      where: { name: 'TGĐ' },
      update: {},
      create: {
        name: 'TGĐ',
        description: 'Tổng Giám Đốc',
        level: 0,
        priority: 0,
        isManagement: true,
        isReportable: false,
        canViewHierarchy: true,
      },
    });

    // Create job position
    const jobPosition = await prisma.jobPosition.upsert({
      where: {
        positionId_jobName_departmentId: {
          positionId: position.id,
          jobName: 'Tổng Giám Đốc',
          departmentId: department.id,
        },
      },
      update: {},
      create: {
        jobName: 'Tổng Giám Đốc',
        code: 'TGD_BGD',
        description: 'Tổng Giám Đốc - Ban Giám Đốc',
        positionId: position.id,
        departmentId: department.id,
        officeId: office.id,
      },
    });

    // Create admin user
    const hashedPassword = await bcrypt.hash('admin123456', 10);

    const admin = await prisma.user.create({
      data: {
        employeeCode: 'ADMIN001',
        email: 'admin@tbsgroup.vn',
        password: hashedPassword,
        firstName: 'Admin',
        lastName: 'System',
        phone: '0123456789',
        role: Role.SUPERADMIN,
        isActive: true,
        jobPositionId: jobPosition.id,
        officeId: office.id,
      },
    });

    console.log('✅ Admin account created successfully:');
    console.log(`   Employee Code: ${admin.employeeCode}`);
    console.log(`   Email: ${admin.email}`);
    console.log(`   Password: admin123456`);
    console.log(`   Role: ${admin.role}`);

  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
