import { PrismaClient, Role } from '@prisma/client';
const prisma = new PrismaClient();

const resources = [
  'users',
  'reports',
  'gate-passes',
  'factories',
  'lines',
  'teams',
  'groups',
  'worksheets',
  'products',
  'processes',
  'medicines',
  'medical-records',
];

const actions = [
  'view',
  'create',
  'update',
  'delete',
  'approve',
  'manage',
  'assign',
];

// ⭐ Define permissions for each role
const rolePermissionsMap = {
  [Role.SUPERADMIN]: {
    // Full access to everything
    all: ['view', 'create', 'update', 'delete', 'approve', 'manage', 'assign'],
  },

  [Role.ADMIN]: {
    // Factory management
    factories: ['view', 'create', 'update', 'delete', 'manage'],
    lines: ['view', 'create', 'update', 'delete', 'manage'],
    teams: ['view', 'create', 'update', 'delete', 'manage'],
    groups: ['view', 'create', 'update', 'delete', 'manage', 'assign'],

    // User management
    users: ['view', 'create', 'update', 'manage'],

    // Production
    worksheets: ['view', 'create', 'update', 'delete', 'manage'],
    products: ['view', 'create', 'update', 'delete'],
    processes: ['view', 'create', 'update', 'delete'],

    // Reports & Gate passes
    reports: ['view', 'approve', 'manage'],
    'gate-passes': ['view', 'approve', 'manage'],

    // Medical (read-only)
    medicines: ['view'],
    'medical-records': ['view'],
  },

  [Role.USER]: {
    // Self profile & department management
    users: ['view', 'update'],

    // Own reports
    reports: ['view', 'create', 'update', 'approve'],

    // Gate passes
    'gate-passes': ['view', 'create', 'approve'],

    // Production (can view and manage if assigned)
    factories: ['view'],
    lines: ['view'],
    teams: ['view'],
    groups: ['view'],
    worksheets: ['view'],
    products: ['view'],
    processes: ['view'],

    // Medical (self only)
    medicines: ['view'],
    'medical-records': ['view'],
  },

  [Role.WORKER]: {
    // Self profile
    users: ['view'],

    // Worksheets (own only)
    worksheets: ['view', 'update'],

    // Production info
    products: ['view'],
    processes: ['view'],
    groups: ['view'],

    // Gate passes
    'gate-passes': ['view', 'create'],

    // Medical (self only)
    medicines: ['view'],
    'medical-records': ['view'],
  },

  [Role.MEDICAL_STAFF]: {
    // Full medical access
    medicines: ['view', 'create', 'update', 'delete', 'manage'],
    'medical-records': ['view', 'create', 'update', 'delete', 'manage'],

    // User info (for medical purposes)
    users: ['view'],

    // Reports (read-only)
    reports: ['view'],
    'gate-passes': ['view'],
  },
};

async function main() {
  console.log('🔐 Seeding permissions...');

  // 1. Create all possible permissions
  const permissions = [];
  for (const resource of resources) {
    for (const action of actions) {
      const permission = await prisma.permission.upsert({
        where: {
          resource_action: { resource, action },
        },
        update: {
          description: `${action.charAt(0).toUpperCase() + action.slice(1)} ${resource}`,
        },
        create: {
          resource,
          action,
          description: `${action.charAt(0).toUpperCase() + action.slice(1)} ${resource}`,
        },
      });
      permissions.push(permission);
      console.log(`✅ Created permission: ${resource}.${action}`);
    }
  }

  console.log(`\n📋 Total permissions created: ${permissions.length}`);

  // 2. Assign permissions to roles
  console.log('\n🎭 Assigning permissions to roles...');

  for (const [role, resourcePerms] of Object.entries(rolePermissionsMap)) {
    console.log(`\n🎯 Processing role: ${role}`);

    // SUPERADMIN gets all permissions
    if (role === Role.SUPERADMIN) {
      for (const permission of permissions) {
        await prisma.rolePermission.upsert({
          where: {
            role_permissionId: {
              role: role as Role,
              permissionId: permission.id,
            },
          },
          update: { isGranted: true },
          create: {
            role: role as Role,
            permissionId: permission.id,
            isGranted: true,
          },
        });
      }
      console.log(`  ✅ Granted ALL permissions to ${role}`);
      continue;
    }

    // Other roles get specific permissions
    for (const [resource, allowedActions] of Object.entries(resourcePerms)) {
      for (const action of allowedActions) {
        const permission = permissions.find(
          (p) => p.resource === resource && p.action === action,
        );

        if (permission) {
          await prisma.rolePermission.upsert({
            where: {
              role_permissionId: {
                role: role as Role,
                permissionId: permission.id,
              },
            },
            update: { isGranted: true },
            create: {
              role: role as Role,
              permissionId: permission.id,
              isGranted: true,
            },
          });
          console.log(`  ✅ ${role}: ${resource}.${action}`);
        }
      }
    }
  }

  console.log('\n✅ Permissions seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
