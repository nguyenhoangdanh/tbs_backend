import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const resources = [
  'users',
  'reports',
  'gate-passes',
  'offices',
  'departments',
  'teams',
  'groups',
  'worksheets',
  'products',
  'processes',
  'medicines',
  'medical-records',
  'feedback',
  'roles',
  'permissions',
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

// ⭐ Role codes (matching RoleDefinition.code)
const ROLE_CODES = {
  SUPERADMIN: 'SUPERADMIN',
  ADMIN: 'ADMIN',
  USER: 'USER',
  WORKER: 'WORKER',
  MEDICAL_STAFF: 'MEDICAL_STAFF',
} as const;

// ⭐ Define permissions for each role
const rolePermissionsMap = {
  [ROLE_CODES.SUPERADMIN]: {
    // Full access to everything
    all: ['view', 'create', 'update', 'delete', 'approve', 'manage', 'assign'],
  },

  [ROLE_CODES.ADMIN]: {
    // Office and department management
    offices: ['view', 'create', 'update', 'delete', 'manage'],
    departments: ['view', 'create', 'update', 'delete', 'manage'],
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

    // Feedback management
    feedback: ['view', 'delete'],
  },

  [ROLE_CODES.USER]: {
    // Self profile & department management
    users: ['view', 'update'],

    // Own reports
    reports: ['view', 'create', 'update', 'approve'],

    // Gate passes
    'gate-passes': ['view', 'create', 'approve'],

    // Production (can view and manage if assigned)
    offices: ['view'],
    departments: ['view'],
    teams: ['view'],
    groups: ['view'],
    worksheets: ['view'],
    products: ['view'],
    processes: ['view'],

    // Medical (self only)
    medicines: ['view'],
    'medical-records': ['view'],
  },

  [ROLE_CODES.WORKER]: {
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

  [ROLE_CODES.MEDICAL_STAFF]: {
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

  // 2. Fetch all system roles from database
  console.log('\n🎭 Fetching system roles...');
  const systemRoles = await prisma.roleDefinition.findMany({
    where: { isSystem: true },
  });

  if (systemRoles.length === 0) {
    console.error('❌ No system roles found! Please run "pnpm seed" first to create system roles.');
    process.exit(1);
  }

  console.log(`✅ Found ${systemRoles.length} system roles`);

  // 3. Assign permissions to roles
  console.log('\n🎯 Assigning permissions to roles...');

  for (const [roleCode, resourcePerms] of Object.entries(rolePermissionsMap)) {
    console.log(`\n🎯 Processing role: ${roleCode}`);

    // Find role by code
    const role = systemRoles.find(r => r.code === roleCode);
    if (!role) {
      console.warn(`⚠️  Role ${roleCode} not found, skipping...`);
      continue;
    }

    // SUPERADMIN gets all permissions
    if (roleCode === ROLE_CODES.SUPERADMIN) {
      for (const permission of permissions) {
        await prisma.roleDefinitionPermission.upsert({
          where: {
            roleDefinitionId_permissionId: {
              roleDefinitionId: role.id,
              permissionId: permission.id,
            },
          },
          update: { isGranted: true },
          create: {
            roleDefinitionId: role.id,
            permissionId: permission.id,
            isGranted: true,
          },
        });
      }
      console.log(`  ✅ Granted ALL permissions to ${roleCode}`);
      continue;
    }

    // Other roles get specific permissions
    for (const [resource, allowedActions] of Object.entries(resourcePerms)) {
      for (const action of allowedActions) {
        const permission = permissions.find(
          (p) => p.resource === resource && p.action === action,
        );

        if (permission) {
          await prisma.roleDefinitionPermission.upsert({
            where: {
              roleDefinitionId_permissionId: {
                roleDefinitionId: role.id,
                permissionId: permission.id,
              },
            },
            update: { isGranted: true },
            create: {
              roleDefinitionId: role.id,
              permissionId: permission.id,
              isGranted: true,
            },
          });
          console.log(`  ✅ ${roleCode}: ${resource}.${action}`);
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
