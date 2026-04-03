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
 *   Sheet 0 (index 0): "DSTH (TỔNG)" — danh sách tổng hợp tất cả nhân viên
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
 *   11 Ngày vào làm  — Excel serial or DD/MM/YYYY
 *   12 Giới tính     — NAM / NỮ
 *   13 (trống)
 *   14 MÃ PB          — Mã phòng ban (department code)
 *   15 TÊN TỔ         — Tên tổ (CN sheet only)
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

function getSheetIndex(flag: string, defaultVal: number): number {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1]) return parseInt(process.argv[idx + 1], 10);
  return defaultVal;
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
  dob: Date | null;
  joinDate: Date | null;
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

/** CD rank — lower number = higher authority */
function cdRank(cd: string): number {
  const p = cd.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (p === 'tgd' || p.includes('tong giam doc')) return 0;
  if (p === 'ptgd' || p === 'p.tgd' || p.includes('pho tong giam doc')) return 1;
}
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
function determineRole(cd: string, isWorker: boolean, tt = ''): string {
  const rank = getCdRank(cd);
  // Even on worker sheet, management-rank CD (0-5) overrides isWorker flag
  if (isWorker && rank >= 6) return 'WORKER';
  if (rank === 0) return 'ADMIN';       // TGĐ
  if (rank === 1 || rank === 3) return 'MANAGER'; // PTGĐ, PGĐ
  if (rank === 2) {
    // GĐ tại văn phòng (VPĐH) → MANAGER; tại nhà máy → FACTORY_DIRECTOR
    const tNorm = tt.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/Đ/g, 'D');
    return (tNorm === 'VPDH TH' || tNorm.startsWith('VPDH') || tNorm.includes('VAN PHONG'))
      ? 'MANAGER' : 'FACTORY_DIRECTOR';
  }
  if (rank === 4) {
    // TP / ĐT → MANAGER; T.LINE / Trưởng Line → LINE_MANAGER
    const p = cd.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
    return (p === 't.line' || p.includes('truong line') || p.includes('line leader'))
      ? 'LINE_MANAGER' : 'MANAGER';
  }
  if (rank === 5) {
    // T.TEAM / TL / TCA / TT / Tổ trưởng — tất cả rank 5 đều là TEAM_LEADER (ngang cấp)
    return 'TEAM_LEADER';
  }
  if (rank === 7) return 'WORKER';      // CN
  return 'USER';
}

/**
 * CD hierarchy rank — lower = higher seniority
 * 0  TGĐ
 * 1  PTGĐ
 * 2  GĐ
 * 3  PGĐ
 * 4  TP / ĐT / T.LINE          (Trưởng phòng, Đội trưởng, Trưởng Line)
 * 5  T.TEAM / TL / TCA / TT    (Trưởng team, Trợ lý, Trưởng ca, Tổ trưởng)
 * 6  NV                        (Nhân viên)
 * 7  CN                        (Công nhân)
 * 99 Unknown
 */
function getCdRank(cd: string): number {
  const p = cd.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
  if (p === 'tgd' || p.includes('tong giam doc')) return 0;
  if (p === 'ptgd' || p === 'p.tgd' || p.includes('pho tong giam doc')) return 1;
  if ((p === 'gd' || p.includes('giam doc')) && !p.includes('pho') && !p.includes('tong')) return 2;
  if (p === 'pgd' || p.includes('pho giam doc')) return 3;
  if (
    p === 'tp' || p.includes('truong phong') || p.includes('truong ban') ||
    p === 'dt' || p.includes('doi truong') ||
    p === 't.line' || p.includes('truong line') || p.includes('line leader')
  ) return 4;
  if (
    p === 't.team' || p.includes('truong team') || p.includes('team leader') ||
    p === 'tl' || p.includes('tro ly') ||
    p === 'tca' || p.includes('truong ca') ||
    p === 'tt' || p === 't.t' || p === 't.tt' ||
    p.includes('to truong') || p.includes('truong to')
  ) return 5;
  if (p === 'nv' || p.includes('nhan vien')) return 6;
  if (p === 'cn' || p.includes('cong nhan')) return 7;
  return 99;
}

/**
 * Grouping strategy determines how we identify "the same management unit":
 *   pb_only  — VPĐH TH: group by phòng ban only (cross-office VPs handled at company level)
 *   tt_pb    — LINE PHỤ TRỢ: group by trực thuộc + phòng ban
 *   tt_pb_vt — Factories (NM TS1/TS2/TS3...): group by trực thuộc + phòng ban + vị trí CV
 */
type GroupStrategy = 'pb_only' | 'tt_pb' | 'tt_pb_vt';

function getGroupStrategy(tt: string): GroupStrategy {
  const t = tt.trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/Đ/g, 'D');
  if (t === 'VPDH TH' || t.startsWith('VPDH') || t.includes('VAN PHONG')) return 'pb_only';
  if (t.includes('LINE PHU TRO') || t.includes('LPT') || t.startsWith('LINE PT')) return 'tt_pb';
  return 'tt_pb_vt'; // NM TS1, TS2, TS3, etc.
}

function makeGroupKey(row: StaffRow): string {
  switch (getGroupStrategy(row.tt)) {
    case 'pb_only':  return row.pb;
    case 'tt_pb':    return `${row.tt}||${row.pb}`;
    case 'tt_pb_vt': return `${row.tt}||${row.pb}||${row.vt}`;
  }
}

function getPositionProps(cd: string): { isManagement: boolean; canViewHierarchy: boolean; level: number } {
  const rank = getCdRank(cd);
  if (rank <= 3) return { isManagement: true,  canViewHierarchy: true,  level: rank };
  if (rank === 4) return { isManagement: true,  canViewHierarchy: true,  level: 4 };
  if (rank === 5) return { isManagement: true,  canViewHierarchy: true,  level: 5 };
  if (rank === 6) return { isManagement: false, canViewHierarchy: false, level: 6 };
  return { isManagement: false, canViewHierarchy: false, level: 7 }; // CN / unknown
}

// ─── Excel parsing ─────────────────────────────────────────────────────────────

function parseSheet(sheet: XLSX.WorkSheet, isWorkerSheet: boolean): StaffRow[] {
  if (!sheet) return [];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const result: StaffRow[] = [];
  console.log(`  ℹ  Total raw rows (incl header): ${rows.length}`);

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
      dob: parseExcelDate(row[7]),
      joinDate: parseExcelDate(row[8]),
      sex: parseSex(row[9]),
      tenTo: isWorkerSheet && row[12] ? String(row[12]).trim() : undefined,
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
  const hashedPassword = await bcrypt.hash('Abcd123@', 10);
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
    const roleCode = determineRole(row.cd, row.isWorker, row.tt);
    const roleDefinitionId =
      roleMap.get(roleCode) ??
      roleMap.get(roleCode === 'FACTORY_DIRECTOR' || roleCode === 'LINE_MANAGER' || roleCode === 'TEAM_LEADER' ? 'MANAGER' : roleCode) ??
      roleMap.get('USER')!;

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
        joinDate: row.joinDate ?? undefined,
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
  deptMap: Map<string, string>,
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

  // ── 2. Build desired (managerId, departmentId) pairs ──────────────────────
  const desired = new Map<string, Set<string>>(); // managerId → Set<departmentId>
  const addRelation = (managerId: string, departmentId: string) => {
    if (!desired.has(managerId)) desired.set(managerId, new Set());
    desired.get(managerId)!.add(departmentId);
  };

  // 2b. Auto-detect: each management-level person (rank ≤ 4) becomes manager of their OWN dept.
  //     Rank 5 (T.TEAM/TT/TL/TCA) are excluded here because they are level-1 approvers
  //     (ROLE_IN_DEPARTMENT/TEAM_LEADER). Adding them to UserDeptManagement would cause them
  //     to appear again at level-2 DEPARTMENT_MANAGERS after already approving at level 1.
  let autoDetected = 0;
  for (const row of rows) {
    if (getCdRank(row.cd) >= 5) continue; // skip rank 5 (T.TEAM/TT), NV, CN
    const managerId = userMap.get(row.msnv);
    if (!managerId) continue;
    const deptId = deptMap.get(`${row.pb}__${row.tt}`);
    if (!deptId) continue;
    addRelation(managerId, deptId);
    autoDetected++;
  }
  console.log(`  ℹ  Auto-detected ${autoDetected} manager→dept relations from CD hierarchy`);

  // ── 2c. T.LINE special expansion: Trưởng Line manages ALL sub-depts of the LINE ──
  //
  // If a T.LINE person is in a dept whose name contains "ĐH LINE", they are head of
  // the entire LINE group. A LINE group = all depts sharing the same line prefix
  // within the same office. Example:
  //   "LINE CẮT DÁN - ĐH LINE - TS1"  (management dept)
  //   "LINE CẮT DÁN - TỔ CD 1 - TS1"  (sub-dept 1)
  //   "LINE CẮT DÁN - TỔ CD 2 - TS1"  (sub-dept 2)
  //   ...
  // The Trưởng Line in ĐH LINE dept should manage all 5 depts.
  //
  // Line prefix = the part before " - ĐH LINE" in the dept name.

  let tlineExpanded = 0;

  // Build a map: tt → all (pb, deptId) pairs for quick prefix lookup
  const deptsByOffice = new Map<string, Array<{ pb: string; deptId: string }>>();
  for (const [key, deptId] of deptMap) {
    const sepIdx = key.lastIndexOf('__');
    if (sepIdx === -1) continue;
    const pb = key.slice(0, sepIdx);
    const tt = key.slice(sepIdx + 2);
    if (!deptsByOffice.has(tt)) deptsByOffice.set(tt, []);
    deptsByOffice.get(tt)!.push({ pb, deptId });
  }

  for (const row of rows) {
    // Process T.LINE managers
    if (getCdRank(row.cd) !== 4) continue;
    const cdNorm = row.cd.toLowerCase().trim()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
    if (!cdNorm.includes('t.line') && !cdNorm.includes('line')) continue;

    const managerId = userMap.get(row.msnv);
    if (!managerId) continue;

    const pbNormD = row.pb.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/Đ/g, 'D');

    // Case A: T.LINE in ĐH LINE dept → manage all depts sharing the same line prefix
    const dhIdx = pbNormD.indexOf(' - DH LINE');
    if (dhIdx !== -1) {
      const linePrefix = row.pb.slice(0, dhIdx);
      const siblingDepts = deptsByOffice.get(row.tt) ?? [];
      for (const { pb, deptId } of siblingDepts) {
        if (pb.startsWith(linePrefix)) {
          addRelation(managerId, deptId);
          tlineExpanded++;
        }
      }
      continue;
    }

    // Case B: Fallback — T.LINE in a dept whose name starts with "LINE " (no ĐH LINE dept)
    //         Extract line prefix = everything before first " - " in dept name
    //         Then assign manager to all sibling depts with same prefix in same office
    if (!pbNormD.startsWith('LINE ')) continue;
    const dashIdx = row.pb.indexOf(' - ');
    const linePrefix = dashIdx !== -1 ? row.pb.slice(0, dashIdx) : row.pb;
    const siblingDepts = deptsByOffice.get(row.tt) ?? [];
    for (const { pb, deptId } of siblingDepts) {
      if (pb.startsWith(linePrefix)) {
        addRelation(managerId, deptId);
        tlineExpanded++;
      }
    }
  }
  if (tlineExpanded > 0) {
    console.log(`  ℹ  T.LINE expansion: ${tlineExpanded} additional manager→dept relations`);
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

  // Sheet 0 = "DSTH (TỔNG)" — danh sách tổng hợp tất cả nhân viên
  const allRows = parseSheet(wb.Sheets[wb.SheetNames[0]], false);

  console.log(`\n📈 Parsed: ${allRows.length} total rows`);

  // Collect office/dept names
  const officeNames = new Set(allRows.map(r => r.tt));

  // Step by step
  const officeMap = await ensureOffices(officeNames, company.id);
  const deptMap = await ensureDepartments(allRows, officeMap);
  const posMap = await ensurePositions(allRows);
  const jpMap = await ensureJobPositions(allRows, posMap, deptMap, officeMap);
  await ensureTeams(allRows.filter(r => r.isWorker), deptMap);
  const userMap = await createUsers(allRows, company.id, officeMap, jpMap, roleMap);
  await createManagementRelations(allRows, userMap, deptMap);

  console.log('\n══════════════════════════════════════════');
  console.log('✅ Import completed successfully!');
  console.log(`   Total: ${allRows.length} rows`);
}

main()
  .catch(e => { console.error('❌ Fatal:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
