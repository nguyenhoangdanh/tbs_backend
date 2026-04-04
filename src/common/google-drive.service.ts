import { Injectable, Logger } from '@nestjs/common';
import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';

const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Injectable()
export class GoogleDriveService {
  private readonly logger = new Logger(GoogleDriveService.name);

  private getDrive(): drive_v3.Drive {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!email || !key) {
      throw new Error(
        'Google Drive not configured. Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.',
      );
    }

    const auth = new google.auth.JWT({
      email,
      key,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    return google.drive({ version: 'v3', auth });
  }

  isConfigured(): boolean {
    return !!(
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY &&
      process.env.GOOGLE_DRIVE_FOLDER_ID
    );
  }

  /**
   * Upload một file Excel (.xlsx) lên Google Drive folder.
   * @returns fileId của file vừa upload
   */
  async uploadExcelFile(fileName: string, buffer: Buffer, folderId: string): Promise<string> {
    const drive = this.getDrive();

    const res = await drive.files.create({
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
   */
  async listExcelFiles(folderId: string): Promise<drive_v3.Schema$File[]> {
    const drive = this.getDrive();

    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false and mimeType = '${EXCEL_MIME}'`,
      fields: 'files(id, name, createdTime)',
      orderBy: 'createdTime desc',
      pageSize: 100,
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
        await drive.files.delete({ fileId: f.id! });
        this.logger.log(`🗑️  Deleted old backup: ${f.name}`);
      }),
    );
  }
}
