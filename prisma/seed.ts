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
  {
    code: 'TEAM_LEADER',
    name: 'Tổ trưởng',
    description: 'Production team leader (Tổ trưởng) — approve leave for their team',
    isSystem: true,
  },
  {
    code: 'LINE_MANAGER',
    name: 'Trưởng line',
    description: 'Production line manager (Trưởng line) — approve leave for their line',
    isSystem: true,
  },
  {
    code: 'FACTORY_DIRECTOR',
    name: 'Giám đốc nhà máy',
    description: 'Factory director — approve leave for factory staff',
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
  'hierarchy-reports',
  'task-evaluations',
  'leave-requests',
  'leave-types',
  'leave-balances',
  'leave-flows',
  'leave-approvals',
  'leave-visibility',
  'public-holidays',
  'healthcare',
  'organizations',
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
    statistics:       ['view'],
    'hierarchy-reports': ['view'],
    'task-evaluations': ['view', 'update', 'delete', 'manage', 'create'],
    'leave-requests':  ['view', 'create', 'update', 'delete', 'approve', 'manage'],
    'leave-types':     ['view', 'create', 'update', 'delete', 'manage'],
    'leave-balances':  ['view', 'create', 'update', 'manage'],
    'leave-flows':     ['view', 'create', 'update', 'delete', 'manage'],
    'leave-approvals': ['view', 'approve', 'manage'],
    'leave-visibility': ['view', 'create', 'update', 'delete', 'manage'],
    'public-holidays': ['view', 'create', 'update', 'delete', 'manage'],
    healthcare:       ['view', 'manage'],
    organizations:    ['view', 'create', 'update', 'delete', 'manage'],
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
    'hierarchy-reports': ['view'],
    'task-evaluations': ['view', 'update', 'delete', 'manage', 'create'],
    'leave-requests':  ['view', 'approve', 'manage'],
    'leave-types':     ['view'],
    'leave-balances':  ['view'],
    'leave-flows':     ['view'],
    'leave-approvals': ['view', 'approve'],
    'leave-visibility': ['view'],
    'public-holidays': ['view'],
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
    'leave-requests':  ['view', 'create', 'update', 'delete'],
    'leave-types':     ['view'],
    'leave-balances':  ['view'],
    'leave-approvals': ['view'],
    'public-holidays': ['view'],
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
    'leave-requests':  ['view', 'create', 'update', 'delete'],
    'leave-types':     ['view'],
    'leave-balances':  ['view'],
    'public-holidays': ['view'],
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
    healthcare:     ['view', 'create', 'update', 'delete', 'manage'],
  },

  TEAM_LEADER: {
    companies:        ['view'],
    offices:          ['view'],
    departments:      ['view'],
    groups:           ['view', 'assign'],
    users:            ['view', 'update'],
    reports:          ['view', 'create', 'update', 'approve'],
    'gate-passes':    ['view', 'approve'],
    worksheets:       ['view', 'create', 'update'],
    products:         ['view'],
    processes:        ['view'],
    medicines:        ['view'],
    'medical-records': ['view'],
    'leave-requests':  ['view', 'create', 'update', 'approve'],
    'leave-types':     ['view'],
    'leave-balances':  ['view'],
    'leave-approvals': ['view', 'approve'],
    'public-holidays': ['view'],
  },

  LINE_MANAGER: {
    companies:        ['view'],
    offices:          ['view'],
    departments:      ['view'],
    groups:           ['view', 'create', 'update', 'assign'],
    users:            ['view', 'update'],
    reports:          ['view', 'create', 'update', 'approve'],
    'gate-passes':    ['view', 'approve'],
    worksheets:       ['view', 'create', 'update', 'manage'],
    products:         ['view'],
    processes:        ['view'],
    medicines:        ['view'],
    'medical-records': ['view'],
    'leave-requests':  ['view', 'create', 'update', 'approve'],
    'leave-types':     ['view'],
    'leave-balances':  ['view'],
    'leave-approvals': ['view', 'approve'],
    'public-holidays': ['view'],
  },

  FACTORY_DIRECTOR: {
    companies:        ['view'],
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
    'hierarchy-reports': ['view'],
    'leave-requests':  ['view', 'approve', 'manage'],
    'leave-types':     ['view'],
    'leave-balances':  ['view'],
    'leave-flows':     ['view'],
    'leave-approvals': ['view', 'approve'],
    'public-holidays': ['view'],
  },
};

// ─────────────────────────────────────────────────────────────
// SEED FUNCTIONS
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// 7. PUBLIC HOLIDAYS (Vietnamese — 2024–2030)
// ─────────────────────────────────────────────────────────────

// Giỗ tổ Hùng Vương = 10/3 âm lịch, đã tính sẵn lịch dương:
// 2024: 18/4, 2025: 7/4, 2026: 27/3, 2027: 16/4, 2028: 4/4, 2029: 24/3, 2030: 13/4
const PUBLIC_HOLIDAYS_RAW = [
  // Tết Dương Lịch — 1/1 mỗi năm
  ...Array.from({ length: 7 }, (_, i) => ({
    name: 'Tết Dương Lịch', month: 1, day: 1, year: 2024 + i, isLunar: false,
    description: 'Nghỉ lễ Tết Dương lịch (1/1)',
  })),
  // Giỗ tổ Hùng Vương — 10/3 âm lịch (đã tính sang dương lịch)
  { name: 'Giỗ tổ Hùng Vương', month: 4, day: 18, year: 2024, isLunar: true,  description: 'Giỗ tổ Hùng Vương (10/3 âm lịch)' },
  { name: 'Giỗ tổ Hùng Vương', month: 4, day: 7,  year: 2025, isLunar: true,  description: 'Giỗ tổ Hùng Vương (10/3 âm lịch)' },
  { name: 'Giỗ tổ Hùng Vương', month: 4, day: 26, year: 2026, isLunar: true,  description: 'Giỗ tổ Hùng Vương (10/3 âm lịch)' },
  { name: 'Giỗ tổ Hùng Vương', month: 4, day: 16, year: 2027, isLunar: true,  description: 'Giỗ tổ Hùng Vương (10/3 âm lịch)' },
  { name: 'Giỗ tổ Hùng Vương', month: 4, day: 4,  year: 2028, isLunar: true,  description: 'Giỗ tổ Hùng Vương (10/3 âm lịch)' },
  { name: 'Giỗ tổ Hùng Vương', month: 3, day: 24, year: 2029, isLunar: true,  description: 'Giỗ tổ Hùng Vương (10/3 âm lịch)' },
  { name: 'Giỗ tổ Hùng Vương', month: 4, day: 13, year: 2030, isLunar: true,  description: 'Giỗ tổ Hùng Vương (10/3 âm lịch)' },
  // Giải phóng miền Nam — 30/4 mỗi năm
  ...Array.from({ length: 7 }, (_, i) => ({
    name: 'Ngày Giải phóng miền Nam', month: 4, day: 30, year: 2024 + i, isLunar: false,
    description: 'Ngày Giải phóng miền Nam, thống nhất đất nước (30/4)',
  })),
  // Quốc tế Lao Động — 1/5 mỗi năm
  ...Array.from({ length: 7 }, (_, i) => ({
    name: 'Ngày Quốc tế Lao Động', month: 5, day: 1, year: 2024 + i, isLunar: false,
    description: 'Ngày Quốc tế Lao Động (1/5)',
  })),
  // Quốc khánh — 2/9 mỗi năm
  ...Array.from({ length: 7 }, (_, i) => ({
    name: 'Ngày Quốc khánh', month: 9, day: 2, year: 2024 + i, isLunar: false,
    description: 'Quốc khánh nước CHXHCNVN (2/9)',
  })),
];

async function seedPublicHolidays() {
  console.log('\n━━━ [7/8] Seeding public holidays ━━━');
  let count = 0;
  for (const h of PUBLIC_HOLIDAYS_RAW) {
    const date = new Date(Date.UTC(h.year, h.month - 1, h.day));
    await prisma.publicHoliday.upsert({
      where: {
        // Prisma does not support @@unique with nullable companyId easily,
        // use a findFirst + create/update pattern
        id: (await prisma.publicHoliday.findFirst({
          where: { companyId: null, date },
          select: { id: true },
        }))?.id ?? 'NEW_RECORD',
      },
      update: { name: h.name, isLunar: h.isLunar, description: h.description, isActive: true },
      create: {
        companyId: null,
        name: h.name,
        date,
        isLunar: h.isLunar,
        description: h.description,
        isActive: true,
      },
    });
    count++;
  }
  console.log(`  ✓ ${count} public holidays (2024–2030)`);
}

// ─────────────────────────────────────────────────────────────
// 8. LEAVE TYPES — all codes + parent categories
// ─────────────────────────────────────────────────────────────

type LeaveCategorySeed = {
  code: string;
  name: string;
  leaveCategory: 'MEDICAL' | 'SPECIAL' | 'PERSONAL' | 'OTHER';
  requiresDocument?: boolean;
  colorCode?: string;
  sortOrder?: number;
};

type LeaveTypeSeed = {
  code: string;
  categoryCode: string; // maps to LeaveCategorySeed.code
  name: string;
  requiresDocument?: boolean;
  isPaid?: boolean;
  isAccruable?: boolean;
  accrualPerMonth?: number;
  maxDaysPerYear?: number;
  maxCarryOver?: number;
  sortOrder?: number;
};

// Parent categories (LeaveTypeCategory table)
const LEAVE_CATEGORIES: LeaveCategorySeed[] = [
  { code: 'TS', name: 'Thai sản',          leaveCategory: 'MEDICAL',  requiresDocument: true,  colorCode: '#FF8FAB', sortOrder: 10 },
  { code: 'PB', name: 'Phép bệnh',         leaveCategory: 'MEDICAL',  requiresDocument: true,  colorCode: '#FF6B6B', sortOrder: 20 },
  { code: 'KT', name: 'Khám thai',         leaveCategory: 'MEDICAL',  requiresDocument: true,  colorCode: '#FFA94D', sortOrder: 30 },
  { code: 'ST', name: 'Sẩy thai',          leaveCategory: 'MEDICAL',  requiresDocument: true,  colorCode: '#E64980', sortOrder: 40 },
  { code: 'PT', name: 'Phép tang',         leaveCategory: 'SPECIAL',  requiresDocument: false, colorCode: '#495057', sortOrder: 50 },
  { code: 'PC', name: 'Phép cưới',         leaveCategory: 'SPECIAL',  requiresDocument: false, colorCode: '#F06595', sortOrder: 60 },
  { code: 'PK', name: 'Phép khác',         leaveCategory: 'SPECIAL',  requiresDocument: false, colorCode: '#74C0FC', sortOrder: 70 },
  { code: 'PN', name: 'Phép năm',          leaveCategory: 'PERSONAL', colorCode: '#51CF66', sortOrder: 80 },
  { code: 'VR', name: 'Việc riêng',        leaveCategory: 'PERSONAL', colorCode: '#94D82D', sortOrder: 90 },
  { code: 'C',  name: 'Con ốm',            leaveCategory: 'PERSONAL', requiresDocument: true,  colorCode: '#FFD43B', sortOrder: 100 },
  { code: 'NV', name: 'Nghĩa vụ quân sự',  leaveCategory: 'OTHER',    colorCode: '#748FFC', sortOrder: 110 },
];

const LEAVE_TYPES: LeaveTypeSeed[] = [
  // TS — Thai sản
  { code: 'C3', categoryCode: 'TS', name: 'Sinh 1 con (6 tháng)', requiresDocument: true, maxDaysPerYear: 180, sortOrder: 11 },
  { code: 'C4', categoryCode: 'TS', name: 'Sinh 1 con (7 tháng)', requiresDocument: true, maxDaysPerYear: 210, sortOrder: 12 },
  { code: 'C5', categoryCode: 'TS', name: 'Sinh 1 con (8 tháng)', requiresDocument: true, maxDaysPerYear: 240, sortOrder: 13 },
  { code: 'C6', categoryCode: 'TS', name: 'Sinh con làm việc độc hại, nặng nhọc', requiresDocument: true, sortOrder: 14 },
  { code: 'C7', categoryCode: 'TS', name: 'Sinh 1 con (4 tháng)', requiresDocument: true, maxDaysPerYear: 120, sortOrder: 15 },
  { code: 'C8', categoryCode: 'TS', name: 'Sinh 1 con (5 tháng)', requiresDocument: true, maxDaysPerYear: 150, sortOrder: 16 },
  { code: 'C9', categoryCode: 'TS', name: 'Vợ sinh, chồng được nghỉ', requiresDocument: true, sortOrder: 17 },
  // PB — Phép bệnh
  { code: 'B1', categoryCode: 'PB', name: 'Ốm ngắn ngày (<15 năm công tác)', requiresDocument: true, sortOrder: 21 },
  { code: 'B2', categoryCode: 'PB', name: 'Ốm dài ngày', requiresDocument: true, sortOrder: 22 },
  { code: 'B3', categoryCode: 'PB', name: 'Ốm ngắn ngày (nặng nhọc, độc hại <15 năm)', requiresDocument: true, sortOrder: 23 },
  { code: 'B4', categoryCode: 'PB', name: 'Ốm dài ngày (nặng nhọc, độc hại)', requiresDocument: true, sortOrder: 24 },
  { code: 'B5', categoryCode: 'PB', name: 'Ốm ngắn ngày (>30 năm công tác)', requiresDocument: true, sortOrder: 25 },
  { code: 'B6', categoryCode: 'PB', name: 'Ốm ngắn ngày (nặng nhọc, độc hại <30 năm)', requiresDocument: true, sortOrder: 26 },
  { code: 'B7', categoryCode: 'PB', name: 'Ốm ngắn ngày (nặng nhọc, độc hại >30 năm)', requiresDocument: true, sortOrder: 27 },
  { code: 'N1', categoryCode: 'PB', name: 'Dưỡng sức sinh thường tại nhà', requiresDocument: true, sortOrder: 28 },
  { code: 'N2', categoryCode: 'PB', name: 'Dưỡng sinh mổ hoặc tai nạn từ 50%–81% tại nhà', requiresDocument: true, sortOrder: 29 },
  { code: 'N3', categoryCode: 'PB', name: 'Dưỡng sinh song thai hoặc tai nạn từ 51% tại nhà', requiresDocument: true, sortOrder: 30 },
  // KT — Khám thai
  { code: 'K1', categoryCode: 'KT', name: 'Khám thai bình thường', requiresDocument: true, sortOrder: 31 },
  { code: 'K2', categoryCode: 'KT', name: 'Khám thai', requiresDocument: true, sortOrder: 32 },
  // ST — Sẩy thai
  { code: 'S1', categoryCode: 'ST', name: 'Sẩy thai dưới 1 tháng', requiresDocument: true, sortOrder: 41 },
  { code: 'S2', categoryCode: 'ST', name: 'Sẩy thai từ 1–3 tháng', requiresDocument: true, sortOrder: 42 },
  { code: 'S3', categoryCode: 'ST', name: 'Sẩy thai từ 3–dưới 6 tháng', requiresDocument: true, sortOrder: 43 },
  { code: 'S4', categoryCode: 'ST', name: 'Sẩy thai từ 6 tháng trở lên', requiresDocument: true, sortOrder: 44 },
  // PT — Phép tang
  { code: 'V3', categoryCode: 'PT', name: 'Phép tang', requiresDocument: false, sortOrder: 51 },
  // PC — Phép cưới
  { code: 'V4', categoryCode: 'PC', name: 'Phép cưới (bản thân)', requiresDocument: false, sortOrder: 61 },
  { code: 'CC', categoryCode: 'PC', name: 'Phép con cưới', requiresDocument: false, sortOrder: 62 },
  // PK — Phép khác
  { code: 'H1', categoryCode: 'PK', name: 'Đặt vòng', requiresDocument: true,  sortOrder: 71 },
  { code: 'H2', categoryCode: 'PK', name: 'Triệt sản', requiresDocument: true,  sortOrder: 72 },
  { code: 'T1', categoryCode: 'PK', name: 'Tai nạn lỡ, giảm khả năng lao động dưới 21%', requiresDocument: true,  sortOrder: 73 },
  { code: 'T2', categoryCode: 'PK', name: 'Tai nạn lỡ, giảm khả năng lao động trên 21%', requiresDocument: true,  sortOrder: 74 },
  // PN — Phép năm (isAccruable = false ở đây vì parent PN mới có accrual)
  { code: 'V2', categoryCode: 'PN', name: 'Vắng có phép', requiresDocument: false, sortOrder: 81, isAccruable: false },
  { code: 'PN', categoryCode: 'PN', name: 'Phép năm', requiresDocument: false, sortOrder: 82, isAccruable: true, accrualPerMonth: 1, maxCarryOver: 5 },
  // VR — Việc riêng (no sub-codes, parent handles it)
  // C — Con ốm
  { code: 'C1', categoryCode: 'C', name: 'Con dưới 3 tuổi bị bệnh', requiresDocument: true,  sortOrder: 101 },
  { code: 'C2', categoryCode: 'C', name: 'Con từ 3–7 tuổi bị bệnh', requiresDocument: true,  sortOrder: 102 },
  // NV — Nghĩa vụ quân sự
  { code: 'V5', categoryCode: 'NV', name: 'Nghĩa vụ quân sự', requiresDocument: true,  sortOrder: 111 },
];


async function seedLeaveTypes() {
  console.log('\n\u2501\u2501\u2501 [8/8] Seeding leave types \u2501\u2501\u2501');

  // 1. Seed categories into leave_type_categories table
  const categoryMap: Record<string, string> = {}; // code \u2192 id
  for (const cat of LEAVE_CATEGORIES) {
    const existing = await (prisma as any).leaveTypeCategory.findFirst({
      where: { code: cat.code, companyId: null },
      select: { id: true },
    });
    const record = await (prisma as any).leaveTypeCategory.upsert({
      where: { id: existing?.id ?? 'NEW_RECORD' },
      update: { name: cat.name, isActive: true, colorCode: cat.colorCode ?? null, sortOrder: cat.sortOrder ?? 0 },
      create: {
        companyId: null,
        code: cat.code,
        name: cat.name,
        leaveCategory: cat.leaveCategory,
        description: null,
        colorCode: cat.colorCode ?? null,
        sortOrder: cat.sortOrder ?? 0,
        isActive: true,
      },
    });
    categoryMap[cat.code] = record.id;
    console.log(`  \u2713 [CAT]  ${cat.code} \u2014 ${cat.name}`);
  }

  // 2. Seed individual leave type codes into leave_types table
  for (const lt of LEAVE_TYPES) {
    const categoryId = categoryMap[lt.categoryCode];
    if (!categoryId) {
      console.warn(`  ! No category found for code ${lt.categoryCode}, skipping ${lt.code}`);
      continue;
    }
    const existing = await prisma.leaveType.findFirst({
      where: { code: lt.code, companyId: null },
      select: { id: true },
    });
    await prisma.leaveType.upsert({
      where: { id: existing?.id ?? 'NEW_RECORD' },
      update: { name: lt.name, isActive: true, sortOrder: lt.sortOrder ?? 0 },
      create: {
        companyId: null,
        code: lt.code,
        name: lt.name,
        categoryId,
        requiresDocument: lt.requiresDocument ?? false,
        isPaid: lt.isPaid ?? true,
        isAccruable: lt.isAccruable ?? false,
        accrualPerMonth: lt.accrualPerMonth ?? null,
        maxDaysPerYear: lt.maxDaysPerYear ?? null,
        maxCarryOver: lt.maxCarryOver ?? null,
        sortOrder: lt.sortOrder ?? 0,
        isActive: true,
      },
    });
    console.log(`  \u2713 [TYPE] ${lt.code} \u2014 ${lt.name}`);
  }

  console.log(`  \u2713, Total: ${LEAVE_CATEGORIES.length} categories + ${LEAVE_TYPES.length} types`);
}



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

  const regionHCM = await prisma.region.upsert({
    where: { code: 'HCM' },
    update: {},
    create: {
      code: 'HCM',
      name: 'TP. Hồ Chí Minh',
      description: 'Thành phố Hồ Chí Minh — trung tâm kinh tế lớn nhất cả nước',
    },
  });
  console.log(`  ✓ [REGION] ${regionHCM.code} — ${regionHCM.name}`);

  const regionMienDong_HCM = await prisma.region.upsert({
    where: { code: 'MIEN_DONG_HCM' },
    update: {},
    create: {
      code: 'MIEN_DONG_HCM',
      name: 'Miền Đông Sài Gòn',
      description: 'Khu vực Miền Đông Sài Gòn — gồm TP. Thủ Đức và các quận phía Đông TP.HCM',
    },
  });
  console.log(`  ✓ [REGION] ${regionMienDong_HCM.code} — ${regionMienDong_HCM.name}`);

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

  // ── Subsidiary: HANDBAG DIVISION (TBS  GROUP) — ngành túi xách đại diện cho lĩnh vực sản phẩm chính
  const subsidiary = await prisma.company.upsert({
    where: { code: 'HANDBAG_DIVISION' },
    update: {},
    create: {
      code: 'HANDBAG_DIVISION',
      name: 'Handbag Division (TBS Group)',
      typeId: companyTypes['NGANH'].id,
      parentCompanyId: holding.id,
      regionId: regionHCM.id,
      email: 'info@tbsgroup.vn',
      isActive: true,
    },
  });
  console.log(`  ✓ [NGANH]    ${subsidiary.code} — ${subsidiary.name}`);

  // Shoes Division (TBS Group) — ngành giày da đại diện cho lĩnh vực sản phẩm chính
  const shoesDivision = await prisma.company.upsert({
    where: { code: 'SHOES_DIVISION' },
    update: {},
    create: {
      code: 'SHOES_DIVISION',
      name: 'Shoes Division (TBS Group)',
      typeId: companyTypes['NGANH'].id,
      parentCompanyId: holding.id,
      regionId: regionHCM.id,
      email: 'info@tbsgroup.vn',
      isActive: true,
    },
  });
  console.log(`  ✓ [NGANH]    ${shoesDivision.code} — ${shoesDivision.name}`);

  // ── Chuỗi: TBS Handbags — chuỗi điều hành sản phẩm túi xách cụ thể
  const handbagChain = await prisma.company.upsert({
    where: { code: 'TBS_HAND_BAGS' },
    update: {},
    create: {
      code: 'TBS_HAND_BAGS',
      name: 'TBS Handbags',
      typeId: companyTypes['CHUOI'].id,
      parentCompanyId: subsidiary.id,
      regionId: regionMienDong_HCM.id,
      email: 'info@tbsgroup.vn',
      isActive: true,
    },
  });
  console.log(`  ✓ [CHUOI]   ${handbagChain.code} — ${handbagChain.name}`);

  // Chuoi: TBS Shoes — chuỗi điều hành sản phẩm giày da cụ thể
  const shoesChain = await prisma.company.upsert({
    where: { code: 'TBS_SHOES' },
    update: {},
    create: {
      code: 'TBS_SHOES',
      name: 'TBS Shoes',
      typeId: companyTypes['CHUOI'].id,
      parentCompanyId: shoesDivision.id,
      regionId: regionHCM.id,
      email: 'info@tbsgroup.vn',
      isActive: true,
    },
  });
  console.log(`  ✓ [CHUOI]   ${shoesChain.code} — ${shoesChain.name}`);

  // ── Tổ hợp Thoại Sơn
  const complex = await prisma.company.upsert({
    where: { code: 'TOHOP_TUIXACH_THOAISON' },
    update: {},
    create: {
      code: 'TOHOP_TUIXACH_THOAISON',
      name: 'Tổ hợp túi xách Thoại Sơn',
      typeId: companyTypes['TO_HOP'].id,
      parentCompanyId: handbagChain.id,
      regionId: regionAnGiang.id,
      email: 'thoaisonhandbag@tbsgroup.vn',
      isActive: true,
      sectors: { connect: [{ id: sectors['BAGS'].id }] },
    },
  });
  console.log(`  ✓ [TO_HOP]   ${complex.code} — ${complex.name}`);

  // Tổ hợp giày Thoại Sơn
  const shoesComplex = await prisma.company.upsert({
    where: { code: 'TOHOP_GIAY_THOAISON' },
    update: {},
    create: {
      code: 'TOHOP_GIAY_THOAISON',
      name: 'Tổ hợp giày Thoại Sơn',
      typeId: companyTypes['TO_HOP'].id,
      parentCompanyId: shoesChain.id,
      regionId: regionAnGiang.id,
      email: 'angiangshoes@tbsgroup.vn',
      isActive: true,
      sectors: { connect: [{ id: sectors['FOOTWEAR'].id }] },
    },
  });
  console.log(`  ✓ [TO_HOP]   ${shoesComplex.code} — ${shoesComplex.name}`);

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
  await seedPublicHolidays();
  await seedLeaveTypes();

  console.log('\n══════════════════════════════════');
  console.log('✅ Seed completed successfully!\n');
}

main()
  .catch((e) => {
    console.error('\n❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
