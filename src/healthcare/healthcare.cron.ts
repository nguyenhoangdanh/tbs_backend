import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { format } from 'date-fns';
import { HealthcareService } from './healthcare.service';
import { GoogleDriveService } from '../common/google-drive.service';
import { PrismaService } from '../common/prisma.service';
import { InventoryService } from './inventory.service';

export interface BackupRecord {
  triggeredAt: Date;
  triggeredBy: 'cron' | 'manual';
  status: 'success' | 'failed';
  companyId?: string;
  companyCode?: string;
  fileName?: string;
  fileId?: string;
  folderPath?: string;
  error?: string;
}

@Injectable()
export class HealthcareCron implements OnApplicationBootstrap {
  private readonly logger = new Logger(HealthcareCron.name);
  private lastBackups: BackupRecord[] = [];

  constructor(
    private readonly healthcareService: HealthcareService,
    private readonly googleDriveService: GoogleDriveService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  onApplicationBootstrap() {
    const configured = this.googleDriveService.isConfigured();
    this.logger.log(
      `🗓  HealthcareCron registered — Google Drive configured: ${configured}` +
      ` | FOLDER_ID: ${process.env.GOOGLE_DRIVE_FOLDER_ID ? '✅ set' : '❌ missing'}` +
      ` | OAUTH: ${process.env.GOOGLE_OAUTH_REFRESH_TOKEN ? '✅ set' : '—'}` +
      ` | SERVICE_ACCOUNT: ${process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ? '✅ set' : '—'}`,
    );

    try {
      const job = this.schedulerRegistry.getCronJob('backupMedicalRecordsToGoogleDrive');
      this.logger.log(`⏰ Next cron run: ${job.nextDate()}`);
    } catch {
      this.logger.warn('⚠️  Could not read nextDate from cron job — check SchedulerRegistry');
    }
  }

  /**
   * Chạy lúc 9:00 PM giờ Việt Nam (UTC+7) = 14:00 UTC, Thứ 2 → Thứ 7 (1-6).
   * Chủ Nhật (0) bỏ qua vì công ty không làm việc.
   */
  @Cron('0 14 * * 1-6', {
    name: 'backupMedicalRecordsToGoogleDrive',
    timeZone: 'UTC',
  })
  async handleDailyBackup(): Promise<void> {
    this.logger.log('⏰ [Cron] 9 PM VN (T2-T7) — Starting daily medical records backup for all companies...');
    const companies = await this.getActiveCompanies();
    this.logger.log(`📋 Found ${companies.length} active companies to backup`);

    const results: BackupRecord[] = [];
    for (const company of companies) {
      const triggeredAt = new Date();
      try {
        const result = await this.runBackupInternal(company.id);
        results.push({ triggeredAt, triggeredBy: 'cron', status: 'success', companyId: company.id, companyCode: company.code, ...result });
        this.logger.log(`✅ [Cron] ${company.code}: ${result.fileName} (Drive id: ${result.fileId})`);
      } catch (err) {
        const error = (err as Error).message;
        results.push({ triggeredAt, triggeredBy: 'cron', status: 'failed', companyId: company.id, companyCode: company.code, error });
        this.logger.error(`❌ [Cron] ${company.code} backup failed: ${error}`);
      }
    }
    this.lastBackups = results;
  }

  /**
   * Chạy lúc 00:00 UTC ngày 1 mỗi tháng = 7:00 AM giờ Việt Nam (UTC+7) ngày 1.
   * Tự động khởi tạo bản ghi tồn đầu kỳ cho tháng mới (opening = closing tháng trước).
   * Cron: "0 0 1 * *" — thư viện cron v4 không hỗ trợ alias L (last day).
   */
  @Cron('0 0 1 * *', {
    name: 'initializeInventoryNewMonth',
    timeZone: 'UTC',
  })
  async handleMonthlyInventoryInit(): Promise<void> {
    const now = new Date();
    const targetMonth = now.getMonth() + 1; // UTC day 1 → same month in VN
    const targetYear = now.getFullYear();
    this.logger.log(
      `⏰ [Cron] Monthly inventory init — initializing ${targetMonth}/${targetYear} for all companies...`,
    );

    const companies = await this.getActiveCompanies();
    let totalCreated = 0;

    for (const company of companies) {
      try {
        const result = await this.inventoryService.initializeMonth(targetMonth, targetYear, company.id);
        totalCreated += result.created;
        this.logger.log(
          `✅ [Cron] ${company.code}: created=${result.created}, skipped=${result.skipped}`,
        );
      } catch (err) {
        this.logger.error(
          `❌ [Cron] ${company.code} initializeMonth failed: ${(err as Error).message}`,
        );
      }
    }

    // Also initialize for null companyId (global records)
    try {
      const result = await this.inventoryService.initializeMonth(targetMonth, targetYear, undefined);
      totalCreated += result.created;
    } catch (err) {
      this.logger.error(`❌ [Cron] global initializeMonth failed: ${(err as Error).message}`);
    }

    this.logger.log(
      `✅ [Cron] Monthly inventory init complete — total created: ${totalCreated}`,
    );
  }

  /** Dùng cho API trigger thủ công — throws lỗi để caller biết chi tiết. */
  async runBackup(companyId: string): Promise<{ fileName: string; fileId: string; folderPath: string }> {
    const triggeredAt = new Date();
    try {
      const result = await this.runBackupInternal(companyId);
      const idx = this.lastBackups.findIndex(b => b.companyId === companyId);
      const record: BackupRecord = { triggeredAt, triggeredBy: 'manual', status: 'success', companyId, ...result };
      if (idx >= 0) this.lastBackups[idx] = record;
      else this.lastBackups.push(record);
      return result;
    } catch (err) {
      const error = (err as Error).message;
      const idx = this.lastBackups.findIndex(b => b.companyId === companyId);
      const record: BackupRecord = { triggeredAt, triggeredBy: 'manual', status: 'failed', companyId, error };
      if (idx >= 0) this.lastBackups[idx] = record;
      else this.lastBackups.push(record);
      throw err;
    }
  }

  getStatus(): {
    driveConfigured: boolean;
    envVars: Record<string, boolean>;
    lastBackups: BackupRecord[];
  } {
    return {
      driveConfigured: this.googleDriveService.isConfigured(),
      envVars: {
        GOOGLE_DRIVE_FOLDER_ID: !!(process.env.GOOGLE_DRIVE_FOLDER_ID),
        GOOGLE_OAUTH_REFRESH_TOKEN: !!(process.env.GOOGLE_OAUTH_REFRESH_TOKEN),
        GOOGLE_OAUTH_CLIENT_ID: !!(process.env.GOOGLE_OAUTH_CLIENT_ID),
        GOOGLE_OAUTH_CLIENT_SECRET: !!(process.env.GOOGLE_OAUTH_CLIENT_SECRET),
        GOOGLE_SERVICE_ACCOUNT_EMAIL: !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL),
        GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: !!(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
      },
      lastBackups: this.lastBackups,
    };
  }

  private async getActiveCompanies() {
    return this.prisma.company.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });
  }

  /**
   * Traverse company hierarchy from root to leaf, return folder path segments.
   * e.g. ['TBS', 'THTX', 'TS']
   */
  private async buildCompanyFolderPath(companyId: string): Promise<string[]> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: { companyType: true },
    });
    if (!company) throw new Error(`Company ${companyId} not found`);

    const chain: { code: string; level: number }[] = [];
    let current: (typeof company) | null = company;
    while (current) {
      chain.push({ code: current.code, level: current.companyType?.level ?? 99 });
      if (!current.parentCompanyId) break;
      current = await this.prisma.company.findUnique({
        where: { id: current.parentCompanyId },
        include: { companyType: true },
      });
    }

    // Sort L0 (root) → LN (leaf)
    chain.sort((a, b) => a.level - b.level);
    return chain.map(c => c.code);
  }

  private async runBackupInternal(companyId: string): Promise<{ fileName: string; fileId: string; folderPath: string }> {
    if (!this.googleDriveService.isConfigured()) {
      throw new Error(
        'Google Drive chưa được cấu hình. Kiểm tra Railway env vars: ' +
        'GOOGLE_DRIVE_FOLDER_ID, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.',
      );
    }

    // NOTE: We do NOT create sub-folders via Service Account.
    // Folders created by a SA are owned by SA (0 storage quota) → uploading into them fails with 403.
    // Solution: encode the company hierarchy path into the filename and upload directly to the
    // root folder (which the user created manually on personal Drive and shared with SA as Editor).
    const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID!;

    const pathSegments = await this.buildCompanyFolderPath(companyId);
    const folderPath = pathSegments.join(' / ');
    this.logger.log(`📁 Company path for ${companyId}: ${folderPath}`);

    const now = new Date();
    const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const companyCode = pathSegments[pathSegments.length - 1] ?? companyId.slice(0, 8);
    // Base pattern used to locate the pre-created file in Drive (user created it once manually).
    // e.g. "lichsu_kham_TBS--HANDBAG--TS"
    const pathPrefix = pathSegments.join('--');
    const baseNamePattern = `lichsu_kham_${pathPrefix}`;
    // New name after update — includes timestamp so user can see when it was last written.
    // e.g. "lichsu_kham_TBS--HANDBAG--TS_2026-04-16_21-05.xlsx"
    const fileName = `${baseNamePattern}_${format(vnTime, 'yyyy-MM-dd_HH-mm')}.xlsx`;

    this.logger.log(`📦 Exporting medical records for ${companyCode} → ${fileName}`);
    const buffer = await this.healthcareService.exportMedicalRecordsExcel(undefined, undefined, companyId);

    // Update existing file (user-created, owned by Gmail → no 403 storage quota issue).
    // SA renames it with new timestamp + writes new content. File count stays at 1.
    this.logger.log(`✏️  Updating Drive file (basePattern: ${baseNamePattern})`);
    const fileId = await this.googleDriveService.updateExcelFile(rootFolderId, baseNamePattern, fileName, buffer);

    return { fileName, fileId, folderPath };
  }
}
