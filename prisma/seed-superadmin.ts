import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🔐 Creating SuperAdmin user...\n');

  // Hash password
  const password = 'Admin@123'; // Default password - CHANGE THIS IN PRODUCTION
  const hashedPassword = await bcrypt.hash(password, 10);

  // Find SUPERADMIN role
  const superAdminRole = await prisma.roleDefinition.findUnique({
    where: { code: 'SUPERADMIN' },
  });

  if (!superAdminRole) {
    console.error('❌ SUPERADMIN role not found. Please run seed.ts first.');
    process.exit(1);
  }

  // Find or create admin office
  let adminOffice = await prisma.office.findFirst({
    where: { name: 'Admin Office' },
  });

  if (!adminOffice) {
    adminOffice = await prisma.office.create({
      data: {
        name: 'Admin Office',
        type: 'HEAD_OFFICE',
        description: 'Administrative Head Office',
      },
    });
  }

  // Find or create admin department
  let adminDepartment = await prisma.department.findFirst({
    where: { name: 'Administration' },
  });

  if (!adminDepartment) {
    adminDepartment = await prisma.department.create({
      data: {
        name: 'Administration',
        description: 'System Administration Department',
        officeId: adminOffice.id,
      },
    });
  }

  // Find or create admin position
  let adminPosition = await prisma.position.findFirst({
    where: { name: 'System Administrator' },
  });

  if (!adminPosition) {
    adminPosition = await prisma.position.create({
      data: {
        name: 'System Administrator',
        description: 'Full system access',
        level: 0,
        priority: 1,
        isManagement: true,
        canViewHierarchy: true,
      },
    });
  }

  // Find or create admin job position
  let adminJobPosition = await prisma.jobPosition.findFirst({
    where: {
      jobName: 'System Administrator',
      departmentId: adminDepartment.id,
      positionId: adminPosition.id,
    },
  });

  if (!adminJobPosition) {
    adminJobPosition = await prisma.jobPosition.create({
      data: {
        jobName: 'System Administrator',
        code: 'SYSADMIN',
        description: 'System Administrator with full access',
        departmentId: adminDepartment.id,
        positionId: adminPosition.id,
        officeId: adminOffice.id,
        isActive: true,
      },
    });
  }

  // Create or update superadmin user
  const superAdmin = await prisma.user.upsert({
    where: { employeeCode: 'SUPERADMIN' },
    update: {
      password: hashedPassword,
      isActive: true,
    },
    create: {
      employeeCode: 'SUPERADMIN',
      email: 'superadmin@tbs.com',
      password: hashedPassword,
      firstName: 'Super',
      lastName: 'Admin',
      phone: '0000000000',
      isActive: true,
      jobPositionId: adminJobPosition.id,
      officeId: adminOffice.id,
      // Create role assignment
      roles: {
        create: {
          roleDefinitionId: superAdminRole.id,
          isActive: true,
        },
      },
    },
    include: {
      roles: {
        include: {
          roleDefinition: true,
        },
      },
    },
  });

  // If user already exists, ensure role is assigned
  const existingRole = await prisma.userRole.findUnique({
    where: {
      userId_roleDefinitionId: {
        userId: superAdmin.id,
        roleDefinitionId: superAdminRole.id,
      },
    },
  });

  if (!existingRole) {
    await prisma.userRole.create({
      data: {
        userId: superAdmin.id,
        roleDefinitionId: superAdminRole.id,
        isActive: true,
      },
    });
  }

  console.log('✅ SuperAdmin user created successfully!\n');
  console.log('📋 Login Credentials:');
  console.log('   Employee Code: SUPERADMIN');
  console.log('   Email: superadmin@tbs.com');
  console.log('   Password: Admin@123');
  console.log('\n⚠️  IMPORTANT: Change the default password after first login!\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
