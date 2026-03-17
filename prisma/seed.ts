/**
 * prisma/seed.ts
 *
 * Unified seed — runs in strict sequence:
 * 1. System Roles
 * 2. Permissions (all resources × actions)
 * 3. Assign permissions to roles
 * 4. Default Company (TBS Group)
 * 5. SuperAdmin infrastructure (office, department, position, jobPosition)
 * 6. SuperAdmin user account
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────
// 1. SYSTEM ROLES
// ─────────────────────────────────────────────────────────────

const SYSTEM_ROLES = [
  {
    code: 'SUPERADMIN',
    name: 'Super Admin',
    description: 'Full system access — all permissions across all companies',
    isSystem: true,
  },
  {
    code: 'ADMIN',
    name: 'Admin',
    description: 'Company-level admin — manage users, offices, departments, production',
    isSystem: true,
  },
  {
    code: 'MANAGER',
    name: 'Manager',
    description: 'Department/line manager — manage teams, groups, worksheets, reports',
    isSystem: true,
  },
  {
    code: 'USER',
    name: 'User',
    description: 'Standard office employee — reports, gate passes, self-service',
    isSystem: true,
  },
  {
    code: 'WORKER',
    name: 'Worker',
    description: 'Production floor worker — worksheets, gate passes',
    isSystem: true,
  },
  {
    code: 'MEDICAL_STAFF',
    name: 'Medical Staff',
    description: 'Healthcare staff — full medical records and inventory access',
    isSystem: true,
  },
] as const;

type RoleCode = (typeof SYSTEM_ROLES)[number]['code'];

// ─────────────────────────────────────────────────────────────
// 2. RESOURCES & ACTIONS (Permission matrix)
// ─────────────────────────────────────────────────────────────

const RESOURCES = [
  'companies',
  'company-types',
  'business-sectors',
  'regions',
  'offices',
  'departments',
  'teams',
  'groups',
  'positions',
  'job-positions',
  'users',
  'reports',
  'gate-passes',
  'worksheets',
  'products',
  'processes',
  'medicines',
  'medical-records',
  'inventory',
  'feedback',
  'roles',
  'permissions',
  'statistics',
] as const;

const ACTIONS = ['view', 'create', 'update', 'delete', 'approve', 'manage', 'assign'] as const;

// ─────────────────────────────────────────────────────────────
// 3. PERMISSION MAP per role
// ─────────────────────────────────────────────────────────────

type Resource = (typeof RESOURCES)[number];
type Action = (typeof ACTIONS)[number];
type RolePermissionMap = Partial<Record<Resource, Action[]>>;

const ROLE_PERMISSIONS: Record<RoleCode, RolePermissionMap | 'ALL'> = {
  SUPERADMIN: 'ALL',

  ADMIN: {
    companies:        ['view', 'create', 'update', 'delete', 'manage'],
    'company-types':  ['view', 'create', 'update', 'delete', 'manage'],
    'business-sectors': ['view', 'create', 'update', 'delete', 'manage'],
    regions:          ['view', 'create', 'update', 'delete', 'manage'],
    offices:          ['view', 'create', 'update', 'delete', 'manage'],
    departments:      ['view', 'create', 'update', 'delete', 'manage'],
    teams:            ['view', 'create', 'update', 'delete', 'manage'],
    groups:           ['view', 'create', 'update', 'delete', 'manage', 'assign'],
    positions:        ['view', 'create', 'update', 'delete'],
    'job-positions':  ['view', 'create', 'update', 'delete'],
    users:            ['view', 'create', 'update', 'delete', 'manage', 'assign'],
    reports:          ['view', 'approve', 'manage'],
    'gate-passes':    ['view', 'approve', 'manage'],
    worksheets:       ['view', 'create', 'update', 'delete', 'manage'],
    products:         ['view', 'create', 'update', 'delete'],
    processes:        ['view', 'create', 'update', 'delete'],
    medicines:        ['view', 'create', 'update'],
    'medical-records': ['view'],
    inventory:        ['view'],
    feedback:         ['view', 'manage', 'delete'],
    roles:            ['view'],
    permissions:      ['view'],
  },

  MANAGER: {
    companies:        ['view'],
    'company-types':  ['view'],
    'business-sectors': ['view'],
    regions:          ['view'],
    offices:          ['view'],
    departments:      ['view', 'update'],
    teams:            ['view', 'create', 'update'],
    groups:           ['view', 'create', 'update', 'assign'],
    positions:        ['view'],
    'job-positions':  ['view'],
    users:            ['view', 'update'],
    reports:          ['view', 'create', 'update', 'approve', 'manage'],
    'gate-passes':    ['view', 'approve'],
    worksheets:       ['view', 'create', 'update', 'manage'],
    products:         ['view'],
    processes:        ['view'],
    medicines:        ['view'],
    'medical-records': ['view'],
    inventory:        ['view'],
    feedback:         ['view', 'manage'],
  },

  USER: {
    companies:        ['view'],
    'company-types':  ['view'],
    'business-sectors': ['view'],
    regions:          ['view'],
    offices:          ['view'],
    departments:      ['view'],
    teams:            ['view'],
    groups:           ['view'],
    positions:        ['view'],
    'job-positions':  ['view'],
    users:            ['view', 'update'],
    reports:          ['view', 'create', 'update'],
    'gate-passes':    ['view', 'create'],
    worksheets:       ['view'],
    products:         ['view'],
    processes:        ['view'],
    medicines:        ['view'],
    'medical-records': ['view'],
    inventory:        ['view'],
    feedback:         ['view', 'create'],
    statistics:       ['view'],
  },

  WORKER: {
    users:          ['view', 'update'],
    groups:         ['view'],
    worksheets:     ['view', 'update'],
    products:       ['view'],
    processes:      ['view'],
    'gate-passes':  ['view', 'create'],
    medicines:      ['view'],
    'medical-records': ['view'],
  },

  MEDICAL_STAFF: {
    companies:      ['view'],
    offices:        ['view'],
    users:          ['view'],
    reports:        ['view'],
    'gate-passes':  ['view'],
    medicines:      ['view', 'create', 'update', 'delete', 'manage'],
    'medical-records': ['view', 'create', 'update', 'delete', 'manage'],
    inventory:      ['view', 'create', 'update', 'delete', 'manage'],
  },
};

// ─────────────────────────────────────────────────────────────
// SEED FUNCTIONS
// ─────────────────────────────────────────────────────────────

async function seedRoles() {
  console.log('\n━━━ [1/6] Seeding system roles ━━━');
  for (const roleData of SYSTEM_ROLES) {
    await prisma.roleDefinition.upsert({
      where: { code: roleData.code },
      update: { name: roleData.name, description: roleData.description, isActive: true },
      create: { ...roleData, isActive: true },
    });
    console.log(`  ✓ ${roleData.code}`);
  }
}

async function seedPermissions() {
  console.log('\n━━━ [2/6] Seeding permissions ━━━');
  const allPermissions: { id: string; resource: string; action: string }[] = [];

  for (const resource of RESOURCES) {
    for (const action of ACTIONS) {
      const perm = await prisma.permission.upsert({
        where: { resource_action: { resource, action } },
        update: { description: `${action} ${resource}` },
        create: { resource, action, description: `${action} ${resource}` },
      });
      allPermissions.push(perm);
    }
  }
  console.log(`  ✓ ${allPermissions.length} permissions (${RESOURCES.length} resources × ${ACTIONS.length} actions)`);
  return allPermissions;
}

async function assignPermissionsToRoles(
  allPermissions: { id: string; resource: string; action: string }[],
) {
  console.log('\n━━━ [3/6] Assigning permissions to roles ━━━');

  const roles = await prisma.roleDefinition.findMany({ where: { isSystem: true } });

  for (const role of roles) {
    const permMap = ROLE_PERMISSIONS[role.code as RoleCode];
    if (!permMap) continue;

    let assigned = 0;
    const permsToGrant: typeof allPermissions =
      permMap === 'ALL'
        ? allPermissions
        : allPermissions.filter((p) => {
            const resourcePerms = permMap[p.resource as Resource];
            return resourcePerms?.includes(p.action as Action) ?? false;
          });

    for (const perm of permsToGrant) {
      await prisma.roleDefinitionPermission.upsert({
        where: {
          roleDefinitionId_permissionId: {
            roleDefinitionId: role.id,
            permissionId: perm.id,
          },
        },
        update: { isGranted: true },
        create: { roleDefinitionId: role.id, permissionId: perm.id, isGranted: true },
      });
      assigned++;
    }
    console.log(`  ✓ ${role.code}: ${assigned} permissions`);
  }
}

async function seedDefaultCompany() {
  console.log('\n━━━ [4/6] Seeding company hierarchy ━━━');

  // ── Seed CompanyTypes
  const companyTypesData = [
    { code: 'HOLDING',    name: 'Tập đoàn',   level: 0, description: 'Tập đoàn mẹ (holding company)' },
    { code: 'NGANH',      name: 'Ngành',       level: 1, description: 'Ngành sản xuất — đại diện lĩnh vực sản phẩm' },
    { code: 'CHUOI',      name: 'Chuỗi',       level: 2, description: 'Chuỗi điều hành sản phẩm/khách hàng cụ thể' },
    { code: 'TO_HOP',     name: 'Tổ hợp',      level: 3, description: 'Cụm nhà máy sản xuất thực tế' },
    { code: 'NHA_MAY',    name: 'Nhà máy',     level: 4, description: 'Nhà máy sản xuất' },
    { code: 'CHI_NHANH',  name: 'Chi nhánh',   level: 4, description: 'Chi nhánh / văn phòng đại diện' },
  ];
  const companyTypes: Record<string, { id: string }> = {};
  for (const ct of companyTypesData) {
    const record = await prisma.companyType.upsert({
      where: { code: ct.code },
      update: { name: ct.name, level: ct.level, description: ct.description, isActive: true },
      create: { ...ct, isActive: true },
    });
    companyTypes[ct.code] = record;
    console.log(`  ✓ [TYPE]   level ${ct.level}  ${ct.code} — ${ct.name}`);
  }

  // ── Seed BusinessSectors
  const sectorsData = [
    { code: 'BAGS',        name: 'Túi xách',         description: 'Sản xuất và xuất khẩu túi xách' },
    { code: 'FOOTWEAR',    name: 'Giày da',           description: 'Sản xuất và xuất khẩu giày da' },
    { code: 'REAL_ESTATE', name: 'Bất động sản',      description: 'Kinh doanh bất động sản nhà ở' },
    { code: 'APARTMENT',   name: 'Chung cư',          description: 'Đầu tư và vận hành chung cư' },
    { code: 'LOGISTICS',   name: 'Logistics',         description: 'Dịch vụ logistics và vận chuyển' },
    { code: 'EDUCATION',   name: 'Giáo dục',          description: 'Đào tạo và giáo dục nghề nghiệp' },
    { code: 'OTHER',       name: 'Khác',              description: 'Lĩnh vực khác' },
  ];
  const sectors: Record<string, { id: string }> = {};
  for (const s of sectorsData) {
    const record = await prisma.businessSector.upsert({
      where: { code: s.code },
      update: { name: s.name, description: s.description, isActive: true },
      create: { ...s, isActive: true },
    });
    sectors[s.code] = record;
    console.log(`  ✓ [SECTOR] ${s.code} — ${s.name}`);
  }

  // ── Seed Regions
  const regionAnGiang = await prisma.region.upsert({
    where: { code: 'AN_GIANG' },
    update: {},
    create: {
      code: 'AN_GIANG',
      name: 'An Giang',
      description: 'Tỉnh An Giang — khu vực Đồng bằng sông Cửu Long',
    },
  });
  console.log(`  ✓ [REGION] ${regionAnGiang.code} — ${regionAnGiang.name}`);

  // ── Root holding: TBS Group
  const holding = await prisma.company.upsert({
    where: { code: 'TBS' },
    update: { name: 'TBS Group', typeId: companyTypes['HOLDING'].id, isActive: true },
    create: {
      code: 'TBS',
      name: 'TBS Group',
      typeId: companyTypes['HOLDING'].id,
      email: 'contact@tbsgroup.vn',
      isActive: true,
    },
  });
  console.log(`  ✓ [HOLDING]  ${holding.code} — ${holding.name}`);

  // ── Subsidiary: TBS An Giang
  const subsidiary = await prisma.company.upsert({
    where: { code: 'TBS_AN_GIANG' },
    update: {},
    create: {
      code: 'TBS_AN_GIANG',
      name: 'Công ty CP TBS An Giang',
      typeId: companyTypes['NGANH'].id,
      parentCompanyId: holding.id,
      regionId: regionAnGiang.id,
      email: 'info@tbs-angiang.vn',
      isActive: true,
    },
  });
  console.log(`  ✓ [NGANH]    ${subsidiary.code} — ${subsidiary.name}`);

  // ── Tổ hợp Thoại Sơn
  const complex = await prisma.company.upsert({
    where: { code: 'TOHOP_TUIXACH_THOAISON' },
    update: {},
    create: {
      code: 'TOHOP_TUIXACH_THOAISON',
      name: 'Tổ hợp túi xách Thoại Sơn',
      typeId: companyTypes['TO_HOP'].id,
      parentCompanyId: subsidiary.id,
      regionId: regionAnGiang.id,
      email: 'thoaison@tbs-angiang.vn',
      isActive: true,
      sectors: { connect: [{ id: sectors['BAGS'].id }] },
    },
  });
  console.log(`  ✓ [TO_HOP]   ${complex.code} — ${complex.name}`);

  // Return holding as default company for SuperAdmin infra
  return holding;
}

async function seedSuperAdminInfrastructure(companyId: string) {
  console.log('\n━━━ [5/6] Seeding SuperAdmin infrastructure ━━━');

  // Office
  const office = await prisma.office.upsert({
    where: { name_companyId: { name: 'Head Office', companyId } },
    update: {},
    create: {
      companyId,
      name: 'Head Office',
      type: 'HEAD_OFFICE',
      description: 'TBS Group Headquarters',
    },
  });
  console.log(`  ✓ Office: ${office.name}`);

  // Department
  const department = await prisma.department.upsert({
    where: { name_officeId: { name: 'Administration', officeId: office.id } },
    update: {},
    create: {
      name: 'Administration',
      description: 'System Administration Department',
      officeId: office.id,
    },
  });
  console.log(`  ✓ Department: ${department.name}`);

  // Position
  const position = await prisma.position.upsert({
    where: { name: 'System Administrator' },
    update: {},
    create: {
      name: 'System Administrator',
      description: 'Full system access',
      level: 0,
      priority: 1,
      isManagement: true,
      canViewHierarchy: true,
    },
  });
  console.log(`  ✓ Position: ${position.name}`);

  // JobPosition
  const existing = await prisma.jobPosition.findFirst({
    where: { positionId: position.id, departmentId: department.id },
  });
  const jobPosition = existing
    ? existing
    : await prisma.jobPosition.create({
        data: {
          jobName: 'System Administrator',
          code: 'SYSADMIN',
          description: 'System Administrator — full access',
          positionId: position.id,
          departmentId: department.id,
          officeId: office.id,
          isActive: true,
        },
      });
  console.log(`  ✓ JobPosition: ${jobPosition.code}`);

  return { office, jobPosition };
}

async function seedSuperAdminUser(
  companyId: string,
  officeId: string,
  jobPositionId: string,
) {
  console.log('\n━━━ [6/6] Seeding SuperAdmin user ━━━');

  const superAdminRole = await prisma.roleDefinition.findUniqueOrThrow({
    where: { code: 'SUPERADMIN' },
  });

  const password = 'Admin@123456';
  const hashedPassword = await bcrypt.hash(password, 12);

  // Upsert by unique (employeeCode, companyId)
  const existing = await prisma.user.findFirst({
    where: { employeeCode: 'SUPERADMIN', companyId },
  });

  const superAdmin = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { password: hashedPassword, isActive: true },
      })
    : await prisma.user.create({
        data: {
          companyId,
          employeeCode: 'SUPERADMIN',
          email: 'superadmin@tbsgroup.vn',
          password: hashedPassword,
          firstName: 'Super',
          lastName: 'Admin',
          isActive: true,
          jobPositionId,
          officeId,
        },
      });

  // Ensure role assignment
  await prisma.userRole.upsert({
    where: {
      userId_roleDefinitionId: {
        userId: superAdmin.id,
        roleDefinitionId: superAdminRole.id,
      },
    },
    update: { isActive: true },
    create: {
      userId: superAdmin.id,
      roleDefinitionId: superAdminRole.id,
      isActive: true,
    },
  });

  console.log(`  ✓ SuperAdmin created`);
  console.log('\n  ┌─────────────────────────────────────┐');
  console.log('  │         LOGIN CREDENTIALS           │');
  console.log('  ├─────────────────────────────────────┤');
  console.log('  │  Employee Code : SUPERADMIN         │');
  console.log('  │  Email         : superadmin@tbsgroup.vn │');
  console.log(`  │  Password      : ${password}  │`);
  console.log('  ├─────────────────────────────────────┤');
  console.log('  │  ⚠  Change password after first login │');
  console.log('  └─────────────────────────────────────┘');
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 TBS Management — Database Seed');
  console.log('══════════════════════════════════\n');

  await seedRoles();
  const allPermissions = await seedPermissions();
  await assignPermissionsToRoles(allPermissions);
  const company = await seedDefaultCompany();
  const { office, jobPosition } = await seedSuperAdminInfrastructure(company.id);
  await seedSuperAdminUser(company.id, office.id, jobPosition.id);

  console.log('\n══════════════════════════════════');
  console.log('✅ Seed completed successfully!\n');
}

main()
  .catch((e) => {
    console.error('\n❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
