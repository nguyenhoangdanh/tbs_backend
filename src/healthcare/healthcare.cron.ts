import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { format } from 'date-fns';
import { HealthcareService } from './healthcare.service';
import { GoogleDriveService } from '../common/google-drive.service';

export interface BackupRecord {
  triggeredAt: Date;
  triggeredBy: 'cron' | 'manual';
  status: 'success' | 'failed';
  fileName?: string;
  fileId?: string;
  error?: string;
}

@Injectable()
export class HealthcareCron implements OnApplicationBootstrap {
  private readonly logger = new Logger(HealthcareCron.name);
  private lastBackup: BackupRecord | null = null;

  constructor(
    private readonly healthcareService: HealthcareService,
    private readonly googleDriveService: GoogleDriveService,
    private readonly schedulerRegistry: SchedulerRegistry,
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
   * Chạy lúc 9:00 PM giờ Việt Nam (UTC+7) = 14:00 UTC mỗi ngày.
   * Cron: "0 14 * * *" với timeZone: 'UTC'
   */
  @Cron('0 14 * * *', {
    name: 'backupMedicalRecordsToGoogleDrive',
    timeZone: 'UTC',
  })
  async handleDailyBackup(): Promise<void> {
    this.logger.log('⏰ [Cron] 9 PM VN — Starting daily medical records backup...');
    const triggeredAt = new Date();
    try {
      const result = await this.runBackupInternal();
      this.lastBackup = { triggeredAt, triggeredBy: 'cron', status: 'success', ...result };
      this.logger.log(`✅ [Cron] Backup complete: ${result.fileName} (Drive id: ${result.fileId})`);
    } catch (err) {
      const error = (err as Error).message;
      this.lastBackup = { triggeredAt, triggeredBy: 'cron', status: 'failed', error };
      this.logger.error(`❌ [Cron] Backup failed: ${error}`);
    }
  }

  /** Dùng cho API trigger thủ công — throws lỗi để caller biết chi tiết. */
  async runBackup(): Promise<{ fileName: string; fileId: string }> {
    const triggeredAt = new Date();
    try {
      const result = await this.runBackupInternal();
      this.lastBackup = { triggeredAt, triggeredBy: 'manual', status: 'success', ...result };
      return result;
    } catch (err) {
      const error = (err as Error).message;
      this.lastBackup = { triggeredAt, triggeredBy: 'manual', status: 'failed', error };
      throw err;
    }
  }

  getStatus(): {
    driveConfigured: boolean;
    envVars: Record<string, boolean>;
    lastBackup: BackupRecord | null;
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
      lastBackup: this.lastBackup,
    };
  }

  private async runBackupInternal(): Promise<{ fileName: string; fileId: string }> {
    if (!this.googleDriveService.isConfigured()) {
      throw new Error(
        'Google Drive chưa được cấu hình. Kiểm tra Railway env vars: ' +
        'GOOGLE_DRIVE_FOLDER_ID, GOOGLE_OAUTH_REFRESH_TOKEN (hoặc GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY).',
      );
    }

    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID!;
    // Tên file: lichsu_kham_2024-08-15_21-00.xlsx format for GMT+7 timezone
    const now = new Date();  // this UTC
    const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000); // convert to VN time
    const fileName = `lichsu_kham_${format(vnTime, 'yyyy-MM-dd_HH-mm')}.xlsx`;
    // const fileName = `lichsu_kham_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`;

    this.logger.log(`📋 Exporting all medical records → ${fileName}`);
    const buffer = await this.healthcareService.exportMedicalRecordsExcel();

    this.logger.log(`📤 Uploading to Google Drive folder: ${folderId}`);
    const fileId = await this.googleDriveService.uploadExcelFile(fileName, buffer, folderId);

    await this.googleDriveService.keepOnlyLatestFiles(folderId, 3);

    return { fileName, fileId };
  }
}
