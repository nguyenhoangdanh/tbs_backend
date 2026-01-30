import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Checking SuperAdmin user...\n');

  // Find user
  const user = await prisma.user.findUnique({
    where: { employeeCode: 'SUPERADMIN' },
    include: {
      roles: {
        include: {
          roleDefinition: true,
        },
      },
      jobPosition: true,
      office: true,
    },
  });

  if (!user) {
    console.log('❌ SuperAdmin user not found!');
    return;
  }

  console.log('✅ User found:');
  console.log('   ID:', user.id);
  console.log('   Employee Code:', user.employeeCode);
  console.log('   Email:', user.email);
  console.log('   Name:', user.firstName, user.lastName);
  console.log('   Active:', user.isActive);
  console.log('   Office:', user.office.name);
  console.log('   Job Position:', user.jobPosition.jobName);
  console.log('   Roles:', user.roles.map(r => r.roleDefinition.name).join(', '));

  // Test password
  const testPassword = 'Admin@123';
  const passwordMatch = await bcrypt.compare(testPassword, user.password);
  console.log('\n🔑 Password Test:');
  console.log('   Testing password:', testPassword);
  console.log('   Password matches:', passwordMatch);

  if (!passwordMatch) {
    console.log('\n🔧 Updating password...');
    const hashedPassword = await bcrypt.hash(testPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        isActive: true,
      },
    });
    console.log('✅ Password updated successfully!');
  }

  console.log('\n📋 Login Credentials:');
  console.log('   Employee Code: SUPERADMIN');
  console.log('   Password: Admin@123');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
