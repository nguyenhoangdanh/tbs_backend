/**
 * prisma/import-workers.ts
 *
 * Import nhân viên từ file data.xlsx vào database.
 *
 * Usage:
 *   pnpm db:import [--company <COMPANY_CODE>]
 *
 * Mặc định company: TOHOP_TUIXACH_THOAISON
 *
 * Excel structure (prisma/data.xlsx):
 *   Sheet 1 (index 1): "DSTH (CBQL, NV)" — cán bộ quản lý + nhân viên
 *   Sheet 2 (index 2): "DSTH(CN)"        — công nhân sản xuất
 *
 * Columns (0-indexed):
 *   0  MSNV           — Mã số nhân viên
 *   1  HỌ VÀ TÊN     — Họ và tên
 *   2  CD             — Chức danh (Position)
 *   3  VTCV           — Vị trí công việc (JobTitle)
 *   4  PHÒNG BAN      — Phòng ban (Department)
 *   5  TRỰC THUỘC     — Trực thuộc (Office)
 *   6  SĐT            — Số điện thoại
 *   7  Manager Cấp 1  — Mã MSNV của người quản lý trực tiếp cấp 1
 *   8  Manager Cấp 2
 *   9  Manager Cấp 3
 *   10 Ngày sinh      — Excel serial or DD/MM/YYYY
 *   11 Giới tính      — NAM / NỮ
 *   12 (trống)
 *   13 MÃ PB          — Mã phòng ban (department code)
 *   14 TÊN TỔ         — Tên tổ (CN sheet only)
 */

import { PrismaClient, OfficeType, Sex } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as XLSX from 'xlsx';
import * as path from 'path';
import { format, parse, isValid } from 'date-fns';

// ─── Init ─────────────────────────────────────────────────────────────────────

const prisma = new PrismaClient({ log: ['error', 'warn'] });

// ─── CLI args ─────────────────────────────────────────────────────────────────

function getCompanyCode(): string {
  const idx = process.argv.indexOf('--company');
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return process.env.COMPANY_CODE ?? 'TOHOP_TUIXACH_THOAISON';
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface StaffRow {
  msnv: string;
  hoTen: string;
  cd: string;   // Chức danh (Position name)
  vt: string;   // Vị trí công việc (JobTitle)
  pb: string;   // Phòng ban (Department)
  tt: string;   // Trực thuộc (Office)
  phone: string;
  mgr1: string;
  mgr2: string;
  mgr3: string;
  dob: Date | null;
  sex: Sex | null;
  tenTo?: string; // CN sheet only — Tên tổ (Team name)
  isWorker: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseExcelDate(raw: unknown): Date | null {
  if (!raw) return null;
  const str = String(raw).trim();
  if (/^\d{5,}$/.test(str)) {
    // Excel serial
    const epoch = new Date(1899, 11, 31);
    const d = new Date(epoch.getTime() + Number(str) * 86400000);
    return isValid(d) ? d : null;
  }
  if (str.includes('/')) {
    try {
      const d = parse(str, 'dd/MM/yyyy', new Date());
      return isValid(d) ? d : null;
    } catch { return null; }
  }
  return null;
}

function parseSex(raw: unknown): Sex | null {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase().normalize('NFC');
  if (s === 'nam') return Sex.MALE;
  if (s === 'nữ' || s.normalize('NFD') === 'nữ'.normalize('NFD')) return Sex.FEMALE;
  return null;
}

/** Generates email: lastName + firstLetterOfFirstName + firstLettersOfMiddle @tbsgroup.vn */
function generateEmail(hoTen: string): string {
  const normalized = hoTen
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z\s]/g, '')
    .trim();
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const firstName = parts[0];
    const lastName = parts[parts.length - 1];
    const middle = parts.slice(1, -1).map(p => p[0]).join('');
    return `${lastName}${firstName[0]}${middle}@tbsgroup.vn`;
  }
  return `${normalized.replace(/\s+/g, '')}@tbsgroup.vn`;
}

/** Role: ADMIN for TGĐ; MANAGER for GĐ/TP/TT/TL; WORKER for CN; USER otherwise */
function determineRole(cd: string, isWorker: boolean): string {
  if (isWorker) return 'WORKER';
  const p = cd.toLowerCase().trim();
  if (p === 'tgđ' || p.includes('tổng giám đốc')) return 'ADMIN';
  if (
    p === 'gđ' || p.includes('giám đốc') ||
    p === 'pgđ' || p.includes('phó giám đốc') ||
    p === 'tp' || p.includes('trưởng phòng') ||
    p === 'tt' || p === 'tổ trưởng' || p === 'đội trưởng' ||
    p === 't.team' || p.includes('trưởng team') ||
    p === 't.line' || p.includes('trưởng line')
  ) return 'MANAGER';
  if (p === 'tl' || p.includes('trợ lý')) return 'USER';
  if (p === 'cn' || p.includes('công nhân')) return 'WORKER';
  return 'USER';
}

function getPositionProps(cd: string): { isManagement: boolean; canViewHierarchy: boolean; level: number } {
  const p = cd.toLowerCase().trim();
  if (p === 'tgđ' || p.includes('tổng giám đốc')) return { isManagement: true, canViewHierarchy: true, level: 0 };
  if (p === 'ptgđ' || p.includes('phó tổng giám đốc')) return { isManagement: true, canViewHierarchy: true, level: 1 };
  if ((p === 'gđ' || p.includes('giám đốc')) && !p.includes('phó') && !p.includes('tổng')) return { isManagement: true, canViewHierarchy: true, level: 2 };
  if (p === 'pgđ' || p.includes('phó giám đốc')) return { isManagement: true, canViewHierarchy: true, level: 3 };
  if (p === 'tp' || p.includes('trưởng phòng') || p.includes('trưởng ban') ||
      p === 't.team' || p.includes('trưởng team') || p.includes('team leader') ||
      p === 't.line' || p.includes('trưởng line') || p.includes('line leader') ||
      p.includes('trưởng nhóm') || p.includes('group leader')) return { isManagement: true, canViewHierarchy: true, level: 4 };
  if (p === 'tl' || p.includes('trợ lý')) return { isManagement: false, canViewHierarchy: false, level: 5 };
  if (p === 'tt' || p === 'tổ trưởng' || p === 'đội trưởng' || p === 'trưởng ca') return { isManagement: true, canViewHierarchy: true, level: 6 };
  if (p === 'nv' || p.includes('nhân viên')) return { isManagement: false, canViewHierarchy: false, level: 7 };
  return { isManagement: false, canViewHierarchy: false, level: 8 };
}

// ─── Excel parsing ─────────────────────────────────────────────────────────────

function parseSheet(sheet: XLSX.WorkSheet, isWorkerSheet: boolean): StaffRow[] {
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const result: StaffRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0] || !row[1] || !row[2] || !row[3] || !row[4] || !row[5]) continue;

    const msnv = String(row[0]).trim();
    const hoTen = String(row[1]).trim();
    const cd = String(row[2]).trim();
    const vt = String(row[3]).trim();
    const pb = String(row[4]).trim();
    const tt = String(row[5]).trim();
    if (!msnv || !hoTen || !cd || !vt || !pb || !tt) continue;

    result.push({
      msnv,
      hoTen,
      cd,
      vt,
      pb,
      tt,
      phone: row[6] ? String(row[6]).trim() : '',
      mgr1: row[7] ? String(Math.floor(Number(row[7]))).trim() : '',
      mgr2: row[8] ? String(Math.floor(Number(row[8]))).trim() : '',
      mgr3: row[9] ? String(Math.floor(Number(row[9]))).trim() : '',
      dob: parseExcelDate(row[10]),
      sex: parseSex(row[11]),
      tenTo: isWorkerSheet && row[14] ? String(row[14]).trim() : undefined,
      isWorker: isWorkerSheet,
    });
  }
  return result;
}

// ─── Database operations ───────────────────────────────────────────────────────

async function ensureOffices(
  officNames: Set<string>,
  companyId: string,
): Promise<Map<string, string>> {
  console.log('\n🏢 [1/7] Ensuring offices...');
  const map = new Map<string, string>();

  await Promise.all(Array.from(officNames).map(async name => {
    const type: OfficeType = (
      name.includes('VP') || name.includes('Văn phòng') ||
      name.includes('VPĐH') || name.includes('Điều hành')
    ) ? OfficeType.HEAD_OFFICE : OfficeType.FACTORY_OFFICE;

    const office = await prisma.office.upsert({
      where: { name_companyId: { name, companyId } },
      update: {},
      create: { companyId, name, type },
    });
    map.set(name, office.id);
    console.log(`  ✓ [${type}] ${name}`);
  }));
  return map;
}

async function ensureDepartments(
  rows: StaffRow[],
  officeMap: Map<string, string>,
): Promise<Map<string, string>> {
  console.log('\n🏬 [2/7] Ensuring departments...');
  const map = new Map<string, string>();
  const seen = new Set<string>();
  const unique: Array<{ key: string; name: string; officeId: string }> = [];

  for (const row of rows) {
    const key = `${row.pb}__${row.tt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const officeId = officeMap.get(row.tt);
    if (!officeId) { console.warn(`  ⚠  Office not found: ${row.tt}`); continue; }
    unique.push({ key, name: row.pb, officeId });
  }

  await Promise.all(unique.map(async ({ key, name, officeId }) => {
    const dept = await prisma.department.upsert({
      where: { name_officeId: { name, officeId } },
      update: {},
      create: { name, officeId },
    });
    map.set(key, dept.id);
    console.log(`  ✓ ${name}`);
  }));
  return map;
}

async function ensurePositions(rows: StaffRow[]): Promise<Map<string, string>> {
  console.log('\n👔 [3/7] Ensuring positions...');
  const map = new Map<string, string>();
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const row of rows) {
    if (!seen.has(row.cd)) { seen.add(row.cd); unique.push(row.cd); }
  }

  await Promise.all(unique.map(async cd => {
    const props = getPositionProps(cd);
    const pos = await prisma.position.upsert({
      where: { name: cd },
      update: {},
      create: { name: cd, ...props },
    });
    map.set(cd, pos.id);
    console.log(`  ✓ ${cd}`);
  }));
  return map;
}

async function ensureJobPositions(
  rows: StaffRow[],
  posMap: Map<string, string>,
  deptMap: Map<string, string>,
  officeMap: Map<string, string>,
): Promise<Map<string, string>> {
  console.log('\n💼 [4/7] Ensuring job positions...');
  const map = new Map<string, string>();
  const seen = new Set<string>();
  const unique: Array<{ key: string; row: StaffRow }> = [];

  for (const row of rows) {
    const key = `${row.cd}__${row.vt}__${row.pb}__${row.tt}`;
    if (!seen.has(key)) { seen.add(key); unique.push({ key, row }); }
  }

  await Promise.all(unique.map(async ({ key, row }) => {
    const positionId = posMap.get(row.cd);
    const deptKey = `${row.pb}__${row.tt}`;
    const departmentId = deptMap.get(deptKey);
    const officeId = officeMap.get(row.tt);

    if (!positionId || !departmentId || !officeId) {
      console.warn(`  ⚠  Missing refs for job position: ${key}`);
      return;
    }

    const existing = await prisma.jobPosition.findFirst({
      where: { positionId, jobName: row.vt, departmentId },
    });

    const jp = existing ?? await prisma.jobPosition.create({
      data: {
        jobName: row.vt,
        code: row.vt.replace(/\s+/g, '_').toUpperCase().slice(0, 50),
        positionId,
        departmentId,
        officeId,
      },
    });
    map.set(key, jp.id);
    console.log(`  ✓ ${row.vt} (${row.cd})`);
  }));
  return map;
}

async function ensureTeams(
  rows: StaffRow[],
  deptMap: Map<string, string>,
): Promise<Map<string, string>> {
  console.log('\n🔧 [5/7] Ensuring teams (CN only)...');
  const map = new Map<string, string>();
  const seen = new Set<string>();
  const unique: Array<{ mapKey: string; tenTo: string; departmentId: string }> = [];

  for (const row of rows) {
    if (!row.tenTo) continue;
    const deptKey = `${row.pb}__${row.tt}`;
    const mapKey = `${row.tenTo}__${deptKey}`;
    if (seen.has(mapKey)) continue;
    seen.add(mapKey);
    const departmentId = deptMap.get(deptKey);
    if (!departmentId) { console.warn(`  ⚠  Dept not found: ${deptKey}`); continue; }
    unique.push({ mapKey, tenTo: row.tenTo, departmentId });
  }

  await Promise.all(unique.map(async ({ mapKey, tenTo, departmentId }) => {
    const code = tenTo.replace(/\s+/g, '_').toUpperCase().slice(0, 30);
    const team = await prisma.team.upsert({
      where: { code_departmentId: { code, departmentId } },
      update: {},
      create: { name: tenTo, code, departmentId },
    });
    map.set(mapKey, team.id);
    console.log(`  ✓ ${tenTo}`);
  }));
  return map;
}

async function createUsers(
  rows: StaffRow[],
  companyId: string,
  officeMap: Map<string, string>,
  jpMap: Map<string, string>,
  roleMap: Map<string, string>,
): Promise<Map<string, string>> {
  console.log('\n👥 [6/7] Creating users...');
  const userMap = new Map<string, string>(); // msnv → userId
  const hashedPassword = await bcrypt.hash('123456', 10);
  let ok = 0, skip = 0, fail = 0;

  // ── 1. Batch-load all existing users for this company ──────────────────────
  const existingUsers = await prisma.user.findMany({
    where: { companyId },
    select: { id: true, employeeCode: true, email: true },
  });
  const existingByCode = new Map(existingUsers.map(u => [u.employeeCode, u]));
  const existingEmails = new Set(existingUsers.map(u => u.email));
  // ──────────────────────────────────────────────────────────────────────────

  // ── 2. Prepare new users (fully in-memory, no DB queries) ─────────────────
  type NewUserRow = {
    msnv: string; hoTen: string;
    data: Parameters<typeof prisma.user.create>[0]['data'];
    roleDefinitionId: string;
  };
  const toCreate: NewUserRow[] = [];

  for (const row of rows) {
    const officeId = officeMap.get(row.tt);
    if (!officeId) { console.warn(`  ⚠  No office for ${row.msnv}`); fail++; continue; }

    const jpKey = `${row.cd}__${row.vt}__${row.pb}__${row.tt}`;
    const jobPositionId = jpMap.get(jpKey);
    if (!jobPositionId) { console.warn(`  ⚠  No jobPosition for ${row.msnv}: ${jpKey}`); fail++; continue; }

    const existing = existingByCode.get(row.msnv);
    if (existing) {
      userMap.set(row.msnv, existing.id);
      skip++;
      continue;
    }

    // Deduplicate emails in-memory (no DB round-trip)
    let email = generateEmail(row.hoTen);
    if (existingEmails.has(email)) {
      let suffix = 1;
      const base = email.replace('@tbsgroup.vn', '');
      while (existingEmails.has(`${base}${suffix}@tbsgroup.vn`) && suffix <= 20) suffix++;
      email = suffix <= 20 ? `${base}${suffix}@tbsgroup.vn` : `${row.msnv.toLowerCase()}@tbsgroup.vn`;
    }
    existingEmails.add(email); // reserve so next duplicate gets a different suffix

    const nameParts = row.hoTen.split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || '';
    const roleCode = determineRole(row.cd, row.isWorker);
    const roleDefinitionId = roleMap.get(roleCode) ?? roleMap.get('USER')!;

    toCreate.push({
      msnv: row.msnv, hoTen: row.hoTen,
      roleDefinitionId,
      data: {
        companyId,
        employeeCode: row.msnv,
        email,
        password: hashedPassword,
        firstName,
        lastName,
        phone: row.phone || undefined,
        dateOfBirth: row.dob ?? undefined,
        sex: row.sex ?? undefined,
        jobPositionId,
        officeId,
        isActive: true,
      },
    });
  }

  // ── 3. Batch create users then roles in two transactions ──────────────────
  if (toCreate.length > 0) {
    // createMany returns count only — then fetch created users by employeeCode
    await prisma.user.createMany({
      data: toCreate.map(u => u.data),
      skipDuplicates: true,
    });

    const created = await prisma.user.findMany({
      where: { companyId, employeeCode: { in: toCreate.map(u => u.msnv) } },
      select: { id: true, employeeCode: true },
    });
    const createdByCode = new Map(created.map(u => [u.employeeCode, u.id]));

    // Batch create roles
    const rolesToCreate = toCreate
      .map(u => ({ userId: createdByCode.get(u.msnv), roleDefinitionId: u.roleDefinitionId }))
      .filter((r): r is { userId: string; roleDefinitionId: string } => !!r.userId);

    if (rolesToCreate.length > 0) {
      await prisma.userRole.createMany({ data: rolesToCreate, skipDuplicates: true });
    }

    for (const u of toCreate) {
      const id = createdByCode.get(u.msnv);
      if (id) { userMap.set(u.msnv, id); ok++; }
      else fail++;
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  console.log(`\n  ✅ Created: ${ok}  ⚠ Skipped: ${skip}  ✗ Failed: ${fail}`);
  return userMap;
}

async function createManagementRelations(
  rows: StaffRow[],
  userMap: Map<string, string>,
): Promise<void> {
  console.log('\n🔗 [7/7] Creating management relations...');
  let ok = 0, skip = 0;

  // ── 1. Batch-load user→departmentId mapping ────────────────────────────────
  const allUserIds = Array.from(userMap.values());
  const usersWithDept = await prisma.user.findMany({
    where: { id: { in: allUserIds } },
    select: { id: true, jobPosition: { select: { departmentId: true } } },
  });
  const userDeptMap = new Map<string, string>();
  for (const u of usersWithDept) {
    if (u.jobPosition?.departmentId) userDeptMap.set(u.id, u.jobPosition.departmentId);
  }
  // ──────────────────────────────────────────────────────────────────────────

  // ── 2. Build desired (managerId, departmentId) pairs in memory ────────────
  const desired = new Map<string, Set<string>>(); // managerId → Set<departmentId>
  for (const row of rows) {
    const userId = userMap.get(row.msnv);
    if (!userId) continue;
    const departmentId = userDeptMap.get(userId);
    if (!departmentId) continue;

    for (const mgrMsnv of [row.mgr1, row.mgr2, row.mgr3].filter(Boolean)) {
      const managerId = userMap.get(mgrMsnv!);
      if (!managerId) continue;
      if (!desired.has(managerId)) desired.set(managerId, new Set());
      desired.get(managerId)!.add(departmentId);
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  // ── 3. Batch-load existing relations, then createMany new ones ───────────
  const managerIds = Array.from(desired.keys());
  if (managerIds.length === 0) {
    console.log(`  ✅ Created: 0  ⚠ Skipped: 0`);
    return;
  }

  const existingRelations = await prisma.userDepartmentManagement.findMany({
    where: { userId: { in: managerIds } },
    select: { userId: true, departmentId: true },
  });
  const existingSet = new Set(existingRelations.map(r => `${r.userId}:${r.departmentId}`));

  const toCreate: Array<{ userId: string; departmentId: string; isActive: boolean }> = [];
  for (const [managerId, deptIds] of desired) {
    for (const departmentId of deptIds) {
      if (existingSet.has(`${managerId}:${departmentId}`)) { skip++; continue; }
      toCreate.push({ userId: managerId, departmentId, isActive: true });
    }
  }

  if (toCreate.length > 0) {
    await prisma.userDepartmentManagement.createMany({ data: toCreate, skipDuplicates: true });
    ok = toCreate.length;
  }
  // ──────────────────────────────────────────────────────────────────────────

  console.log(`  ✅ Created: ${ok}  ⚠ Skipped: ${skip}`);
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const companyCode = getCompanyCode();
  console.log(`\n🚀 TBS Worker Import — company: ${companyCode}`);
  console.log('══════════════════════════════════════════\n');

  // Find company
  const company = await prisma.company.findUnique({ where: { code: companyCode } });
  if (!company) {
    console.error(`❌ Company not found: ${companyCode}`);
    console.error('   Run `pnpm db:seed` first, or pass --company <CODE>');
    process.exit(1);
  }
  console.log(`📋 Company: ${company.name} (${company.code})`);

  // Load roles
  const roles = await prisma.roleDefinition.findMany({ select: { id: true, code: true } });
  const roleMap = new Map(roles.map(r => [r.code, r.id]));

  // Read Excel
  const excelPath = path.join(__dirname, 'data.xlsx');
  if (!require('fs').existsSync(excelPath)) {
    console.error(`❌ File not found: ${excelPath}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(excelPath);
  console.log(`📊 Sheets: ${wb.SheetNames.join(', ')}`);

  const staffRows = parseSheet(wb.Sheets[wb.SheetNames[1]], false);
  const workerRows = parseSheet(wb.Sheets[wb.SheetNames[2]], true);
  const allRows = [...staffRows, ...workerRows];

  console.log(`\n📈 Parsed: ${staffRows.length} staff + ${workerRows.length} workers = ${allRows.length} total`);

  // Collect office/dept names
  const officeNames = new Set(allRows.map(r => r.tt));

  // Step by step
  const officeMap = await ensureOffices(officeNames, company.id);
  const deptMap = await ensureDepartments(allRows, officeMap);
  const posMap = await ensurePositions(allRows);
  const jpMap = await ensureJobPositions(allRows, posMap, deptMap, officeMap);
  await ensureTeams(workerRows, deptMap);
  const userMap = await createUsers(allRows, company.id, officeMap, jpMap, roleMap);
  await createManagementRelations(allRows, userMap);

  console.log('\n══════════════════════════════════════════');
  console.log('✅ Import completed successfully!');
  console.log(`   Staff: ${staffRows.length} | Workers: ${workerRows.length}`);
}

main()
  .catch(e => { console.error('❌ Fatal:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
