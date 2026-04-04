import { Injectable, Logger } from '@nestjs/common';
import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';

const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Injectable()
export class GoogleDriveService {
  private readonly logger = new Logger(GoogleDriveService.name);

  private parseCredentials(): { client_email: string; private_key: string } {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    if (!raw) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is not set.');
    }

    // The env var may contain the full service-account JSON (as pasted from the downloaded key file)
    // or just the raw PEM private key string.
    const trimmed = raw.trim();
    if (trimmed.startsWith('{')) {
      const json = JSON.parse(trimmed) as { client_email: string; private_key: string };
      if (!json.private_key || !json.client_email) {
        throw new Error('Service account JSON is missing private_key or client_email.');
      }
      return { client_email: json.client_email, private_key: json.private_key };
    }

    // Plain PEM string — also requires GOOGLE_SERVICE_ACCOUNT_EMAIL
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    if (!email) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL is required when GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is a PEM string.');
    }
    // Replace literal \n sequences with real newlines (common when storing PEM in .env)
    return { client_email: email, private_key: trimmed.replace(/\\n/g, '\n') };
  }

  private getDrive(): drive_v3.Drive {
    const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

    if (refreshToken) {
      // OAuth2 with user refresh token — file is owned by the Google account (uses their quota).
      // Works with personal My Drive folders shared with the service account.
      const oauth2 = new google.auth.OAuth2(
        process.env.GOOGLE_OAUTH_CLIENT_ID,
        process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      );
      oauth2.setCredentials({ refresh_token: refreshToken });
      return google.drive({ version: 'v3', auth: oauth2 });
    }

    // Fallback: service account JWT (requires a Shared Drive — no quota on personal Drive).
    const { client_email, private_key } = this.parseCredentials();
    const auth = new google.auth.GoogleAuth({
      credentials: { client_email, private_key },
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    return google.drive({ version: 'v3', auth });
  }

  isConfigured(): boolean {
    const hasOAuth =
      !!(process.env.GOOGLE_OAUTH_REFRESH_TOKEN &&
        process.env.GOOGLE_OAUTH_CLIENT_ID &&
        process.env.GOOGLE_OAUTH_CLIENT_SECRET);
    const hasServiceAccount = !!(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
    return (hasOAuth || hasServiceAccount) && !!(process.env.GOOGLE_DRIVE_FOLDER_ID);
  }

  /**
   * Upload một file Excel (.xlsx) lên Google Drive folder (Shared Drive).
   * supportsAllDrives=true is required for Shared Drives (Team Drives).
   * @returns fileId của file vừa upload
   */
  async uploadExcelFile(fileName: string, buffer: Buffer, folderId: string): Promise<string> {
    const drive = this.getDrive();

    const res = await drive.files.create({
      supportsAllDrives: true,
      requestBody: {
        name: fileName,
        parents: [folderId],
        mimeType: EXCEL_MIME,
      },
      media: {
        mimeType: EXCEL_MIME,
        body: Readable.from(buffer),
      },
      fields: 'id, name, createdTime',
    });

    this.logger.log(`📤 Uploaded to Drive: ${res.data.name} (id: ${res.data.id})`);
    return res.data.id!;
  }

  /**
   * Liệt kê tất cả file Excel trong folder, sắp xếp mới nhất trước.
   * includeItemsFromAllDrives + supportsAllDrives required for Shared Drives.
   */
  async listExcelFiles(folderId: string): Promise<drive_v3.Schema$File[]> {
    const drive = this.getDrive();

    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false and mimeType = '${EXCEL_MIME}'`,
      fields: 'files(id, name, createdTime)',
      orderBy: 'createdTime desc',
      pageSize: 100,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    return res.data.files ?? [];
  }

  /**
   * Xóa file cũ, chỉ giữ lại `maxFiles` file gần nhất trong folder.
   */
  async keepOnlyLatestFiles(folderId: string, maxFiles = 3): Promise<void> {
    const drive = this.getDrive();
    const files = await this.listExcelFiles(folderId);

    this.logger.log(`📁 Drive folder has ${files.length} backup file(s) (max: ${maxFiles})`);

    if (files.length <= maxFiles) return;

    const toDelete = files.slice(maxFiles); // files[0..maxFiles-1] là mới nhất
    await Promise.all(
      toDelete.map(async (f) => {
        await drive.files.delete({ fileId: f.id!, supportsAllDrives: true });
        this.logger.log(`🗑️  Deleted old backup: ${f.name}`);
      }),
    );
  }
}
