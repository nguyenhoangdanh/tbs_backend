import { Injectable, Logger } from '@nestjs/common';
import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';

const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Injectable()
export class GoogleDriveService {
  private readonly logger = new Logger(GoogleDriveService.name);
  // Cache drive client — Service Account JWT never expires, safe to reuse for process lifetime.
  private _driveCache: drive_v3.Drive | null = null;

  /**
   * Parse GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY — accepts two formats:
   *  1. Full service-account JSON (paste content of downloaded .json key file)
   *  2. Raw PEM string (requires GOOGLE_SERVICE_ACCOUNT_EMAIL separately)
   */
  private parseCredentials(): { client_email: string; private_key: string } {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    if (!raw) {
      throw new Error(
        'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is not set. ' +
        'Download a JSON key from Cloud Console → IAM & Admin → Service Accounts → Keys.',
      );
    }

    const trimmed = raw.trim();
    if (trimmed.startsWith('{')) {
      // dotenv may convert literal \n in the value into real newline chars (0x0A).
      // Real newlines inside a JSON string are invalid → escape them back before parsing.
      const sanitized = trimmed.replace(/\n/g, '\\n');
      const json = JSON.parse(sanitized) as { client_email: string; private_key: string };
      if (!json.private_key || !json.client_email) {
        throw new Error('Service account JSON is missing private_key or client_email.');
      }
      return { client_email: json.client_email, private_key: json.private_key };
    }

    // Raw PEM — also requires GOOGLE_SERVICE_ACCOUNT_EMAIL
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    if (!email) {
      throw new Error(
        'GOOGLE_SERVICE_ACCOUNT_EMAIL is required when GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is a raw PEM string.',
      );
    }
    return { client_email: email, private_key: trimmed.replace(/\\n/g, '\n') };
  }

  /**
   * Service Account auth — JWT key NEVER expires.
   *
   * IMPORTANT: The target Drive folder MUST be shared with the service account email (Editor).
   * Files uploaded are owned by the folder owner (your Gmail), NOT the service account —
   * so storage quota is counted against your Gmail account, not the SA (which has 0 quota).
   *
   * Setup:
   *  1. Open the target folder on drive.google.com
   *  2. Share → add <client_email from JSON key> → Editor
   *  3. Set GOOGLE_DRIVE_FOLDER_ID in .env to that folder's ID
   */
  private getDrive(): drive_v3.Drive {
    if (this._driveCache) return this._driveCache;

    const { client_email, private_key } = this.parseCredentials();
    const auth = new google.auth.GoogleAuth({
      credentials: { client_email, private_key },
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    this._driveCache = google.drive({ version: 'v3', auth });
    return this._driveCache;
  }

  isConfigured(): boolean {
    return !!(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY && process.env.GOOGLE_DRIVE_FOLDER_ID);
  }

  /**
   * Tìm file Excel trong folder theo pattern tên (name contains).
   * Trả về file đầu tiên tìm thấy hoặc null.
   */
  private async findExcelFile(folderId: string, nameContains: string): Promise<drive_v3.Schema$File | null> {
    const drive = this.getDrive();
    const safe = nameContains.replace(/'/g, "\\'");
    const res = await drive.files.list({
      q: `'${folderId}' in parents and name contains '${safe}' and mimeType = '${EXCEL_MIME}' and trashed = false`,
      fields: 'files(id, name)',
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    return res.data.files?.[0] ?? null;
  }

  /**
   * Cập nhật nội dung + rename file Excel hiện có trong folder.
   *
   * Chiến lược "1 file / công ty":
   *  - User tạo tay 1 file Excel trong folder Drive (file thuộc Gmail → dùng Gmail quota).
   *  - SA tìm file theo `baseNamePattern` (e.g. "lichsu_kham_TBS--HANDBAG--TS").
   *  - SA update nội dung + rename thành `newFileName` (có timestamp) qua drive.files.update().
   *  - update() không thay đổi owner → không có lỗi 403 storage quota.
   *
   * @param folderId       - ID thư mục Drive chứa file
   * @param baseNamePattern - chuỗi tìm kiếm trong tên file (không cần khớp hoàn toàn)
   * @param newFileName    - tên mới sau khi update (có timestamp)
   * @param buffer         - nội dung file Excel mới
   * @returns fileId của file đã update
   */
  async updateExcelFile(
    folderId: string,
    baseNamePattern: string,
    newFileName: string,
    buffer: Buffer,
  ): Promise<string> {
    const existing = await this.findExcelFile(folderId, baseNamePattern);

    if (!existing?.id) {
      throw new Error(
        `Không tìm thấy file Excel nào chứa "${baseNamePattern}" trong folder Drive.\n` +
        `Hãy tạo tay 1 file Excel bất kỳ trong folder đó với tên bắt đầu bằng "${baseNamePattern}", ` +
        `sau đó chạy lại backup.`,
      );
    }

    const drive = this.getDrive();
    const res = await drive.files.update({
      fileId: existing.id,
      supportsAllDrives: true,
      requestBody: { name: newFileName },
      media: {
        mimeType: EXCEL_MIME,
        body: Readable.from(buffer),
      },
      fields: 'id, name',
    });

    this.logger.log(`✏️  Updated Drive file: ${existing.name} → ${res.data.name} (id: ${res.data.id})`);
    return res.data.id!;
  }
}
