import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { format } from 'date-fns';
import { HealthcareService } from './healthcare.service';
import { GoogleDriveService } from '../common/google-drive.service';

@Injectable()
export class HealthcareCron {
  private readonly logger = new Logger(HealthcareCron.name);

  constructor(
    private readonly healthcareService: HealthcareService,
    private readonly googleDriveService: GoogleDriveService,
  ) {}

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
    try {
      const result = await this.runBackup();
      this.logger.log(`✅ [Cron] Backup complete: ${result.fileName} (Drive id: ${result.fileId})`);
    } catch (err) {
      this.logger.error(`❌ [Cron] Backup failed: ${(err as Error).message}`);
    }
  }

  /**
   * Chạy backup thủ công (dùng cho API trigger từ frontend).
   * Xuất toàn bộ lịch sử khám bệnh, upload lên Google Drive,
   * giữ tối đa 3 file gần nhất trong folder.
   */
  async runBackup(): Promise<{ fileName: string; fileId: string }> {
    if (!this.googleDriveService.isConfigured()) {
      throw new Error(
        'Google Drive chưa được cấu hình. Cần set GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, GOOGLE_DRIVE_FOLDER_ID trong env.',
      );
    }

    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID!;
    const fileName = `lichsu_kham_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`;

    this.logger.log(`📋 Exporting all medical records → ${fileName}`);
    const buffer = await this.healthcareService.exportMedicalRecordsExcel();

    this.logger.log(`📤 Uploading to Google Drive folder: ${folderId}`);
    const fileId = await this.googleDriveService.uploadExcelFile(fileName, buffer, folderId);

    // Chỉ giữ 3 file gần nhất, xóa file cũ hơn
    await this.googleDriveService.keepOnlyLatestFiles(folderId, 3);

    return { fileName, fileId };
  }
}
