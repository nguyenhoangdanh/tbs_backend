import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// ⭐ 5 System Roles - Seed this FIRST before permissions
const SYSTEM_ROLES = [
  {
    code: 'SUPERADMIN',
    name: 'Super Admin',
    description: 'Full system access with all permissions',
    isSystem: true,
  },
  {
    code: 'ADMIN',
    name: 'Admin',
    description: 'Administrative access to manage users and system settings',
    isSystem: true,
  },
  {
    code: 'USER',
    name: 'User',
    description: 'Standard user access',
    isSystem: true,
  },
  {
    code: 'WORKER',
    name: 'Worker',
    description: 'Production worker with worksheet access',
    isSystem: true,
  },
  {
    code: 'MEDICAL_STAFF',
    name: 'Medical Staff',
    description: 'Healthcare staff with medical records access',
    isSystem: true,
  },
];

async function main() {
  console.log('🎭 Seeding system roles...\n');

  for (const roleData of SYSTEM_ROLES) {
    const role = await prisma.roleDefinition.upsert({
      where: { code: roleData.code },
      update: {
        name: roleData.name,
        description: roleData.description,
        isSystem: roleData.isSystem,
        isActive: true,
      },
      create: roleData,
    });

    console.log(`✅ ${role.code} - ${role.name}`);
  }

  console.log('\n✅ System roles seeded successfully!');
  console.log('💡 Next: Run "pnpm seed:permissions" to assign permissions to roles');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
