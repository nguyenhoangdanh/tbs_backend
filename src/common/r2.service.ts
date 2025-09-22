import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { EnvironmentConfig } from '../config/config.environment';
import { createHash, createHmac } from 'crypto';

// Define interface for uploaded file
interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class CloudflareR2Service {
  private readonly logger = new Logger(CloudflareR2Service.name);
  private bucketName: string;
  private publicUrl: string;
  private accountId: string;
  private accessKeyId: string;
  private secretAccessKey: string;

  constructor(private readonly envConfig: EnvironmentConfig) {
    this.initializeR2();
  }

  private initializeR2() {
    try {
      this.accountId = process.env.R2_ACCOUNT_ID || '';
      this.bucketName = process.env.R2_BUCKET_NAME || '';
      this.publicUrl = process.env.R2_PUBLIC_URL || '';
      this.accessKeyId = process.env.R2_ACCESS_KEY_ID || '';
      this.secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';
      
      if (!this.accountId || !this.bucketName || !this.accessKeyId || !this.secretAccessKey) {
        throw new Error('Missing R2 configuration: All R2 environment variables are required');
      }

      // Set default public URL if not provided
      if (!this.publicUrl) {
        this.publicUrl = `https://pub-${this.generateRandomId()}.r2.dev`;
        this.logger.warn(`R2_PUBLIC_URL not set. Using generated URL: ${this.publicUrl}`);
        this.logger.warn('Please setup a proper R2.dev public URL or custom domain');
      }

      this.logger.log('Cloudflare R2 initialized successfully');
      this.logger.log(`Account ID: ${this.accountId}`);
      this.logger.log(`Bucket: ${this.bucketName}`);
      this.logger.log(`Public URL: ${this.publicUrl}`);
      this.logger.log('Using native Node.js fetch for R2 operations');
      
    } catch (error) {
      this.logger.error('Failed to initialize Cloudflare R2:', error);
      throw new InternalServerErrorException('R2 initialization failed');
    }
  }

  private generateRandomId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  private createSignature(stringToSign: string, dateKey: Buffer): string {
    const kDate = createHmac('sha256', `AWS4${this.secretAccessKey}`).update(dateKey).digest();
    const kRegion = createHmac('sha256', kDate).update('auto').digest();
    const kService = createHmac('sha256', kRegion).update('s3').digest();
    const kSigning = createHmac('sha256', kService).update('aws4_request').digest();
    
    return createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  }

  private getSignedHeaders(
    method: string,
    path: string,
    headers: Record<string, string>,
    body: Buffer
  ): Record<string, string> {
    const now = new Date();
    const dateStamp = now.toISOString().replace(/[:-]|\.\d{3}/g, '').substring(0, 8);
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    
    // Calculate content hash
    const contentHash = createHash('sha256').update(body).digest('hex');
    
    // Prepare headers - ensure proper casing and format
    const signedHeaders = {
      ...headers,
      'host': `${this.accountId}.r2.cloudflarestorage.com`,
      'x-amz-content-sha256': contentHash,
      'x-amz-date': amzDate,
    };

    // Create canonical request with proper formatting
    const headerKeys = Object.keys(signedHeaders).sort();
    const canonicalHeaders = headerKeys.map(key => `${key.toLowerCase()}:${signedHeaders[key].toString().trim()}`).join('\n') + '\n';
    const signedHeadersList = headerKeys.map(key => key.toLowerCase()).join(';');
    
    const canonicalRequest = [
      method.toUpperCase(),
      path,
      '', // query string
      canonicalHeaders,
      signedHeadersList,
      contentHash
    ].join('\n');

    // Create string to sign
    const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      createHash('sha256').update(canonicalRequest, 'utf8').digest('hex')
    ].join('\n');

    // Calculate signature
    const signature = this.createSignature(stringToSign, Buffer.from(dateStamp, 'utf8'));
    
    // Add authorization header
    signedHeaders['authorization'] = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeadersList}, Signature=${signature}`;
    
    return signedHeaders;
  }

  async uploadAvatar(
    file: UploadedFile,
    userId: string,
    employeeCode: string
  ): Promise<string> {
    // Try R2 upload first, fallback to local if it fails
    try {
      const r2Url = await this.uploadToR2Direct(file, userId, employeeCode);
      this.logger.log(`✅ Avatar uploaded to R2 successfully for user ${userId}: ${r2Url}`);
      return r2Url;
    } catch (r2Error) {
      this.logger.warn(`⚠️ R2 upload failed, falling back to local storage: ${r2Error.message}`);
      // Fallback to local storage
      return await this.uploadToLocalStorage(file, userId, employeeCode);
    }
  }

  private async uploadToR2Direct(
    file: UploadedFile,
    userId: string,
    employeeCode: string
  ): Promise<string> {
    const maxRetries = 3;
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Generate unique filename
        const fileExtension = this.getFileExtension(file.originalname);
        const fileName = `avatars/${employeeCode}_${userId}_${Date.now()}.${fileExtension}`;
        const path = `/${this.bucketName}/${fileName}`;
        
        this.logger.log(`🔄 R2 upload attempt ${attempt}/${maxRetries} for user ${userId}, filename: ${fileName}`);
        
        // Use different approach: Try with minimal headers first
        const basicHeaders = {
          'content-type': file.mimetype,
          'content-length': file.size.toString(),
        };

        // Sign the request using S3-compatible API
        const signedHeaders = this.getSignedHeaders('PUT', path, basicHeaders, file.buffer);
        
        const url = `https://${this.accountId}.r2.cloudflarestorage.com${path}`;
        this.logger.debug(`🔗 R2 Upload URL: ${url}`);
        
        // Try different fetch configurations based on attempt
        let fetchOptions: RequestInit;
        
        if (attempt === 1) {
          // First attempt: Standard fetch
          fetchOptions = {
            method: 'PUT',
            headers: signedHeaders,
            body: new Uint8Array(file.buffer),
          };
        } else if (attempt === 2) {
          // Second attempt: With explicit HTTP/1.1
          fetchOptions = {
            method: 'PUT',
            headers: {
              ...signedHeaders,
              'Connection': 'close',
              'User-Agent': 'WeeklyReport/1.0',
            },
            body: new Uint8Array(file.buffer),
          };
        } else {
          // Third attempt: Minimal headers
          const minimalSigned = this.getSignedHeaders('PUT', path, {
            'content-type': file.mimetype,
          }, file.buffer);
          
          fetchOptions = {
            method: 'PUT',
            headers: minimalSigned,
            body: new Uint8Array(file.buffer),
          };
        }
        
        this.logger.debug(`📤 Fetch options for attempt ${attempt}:`, {
          method: fetchOptions.method,
          headersCount: Object.keys(fetchOptions.headers as any).length,
          bodySize: file.size,
        });

        const response = await fetch(url, fetchOptions);
        
        this.logger.debug(`📊 R2 response status: ${response.status}`);
        
        if (response.ok) {
          const publicUrl = `${this.publicUrl}/${fileName}`;
          this.logger.log(`✅ Avatar uploaded to R2 successfully: ${publicUrl}`);
          return publicUrl;
        } else {
          const errorText = await response.text().catch(() => 'Unable to read response body');
          const errorMsg = `R2 API Error ${response.status}: ${response.statusText} - ${errorText}`;
          this.logger.error(`❌ ${errorMsg}`);
          throw new Error(errorMsg);
        }

      } catch (error: any) {
        lastError = error;
        
        this.logger.error(`❌ R2 upload attempt ${attempt}/${maxRetries} failed:`, {
          message: error.message,
          cause: error.cause?.message || error.cause,
          code: error.code,
          name: error.name,
          url: `https://${this.accountId}.r2.cloudflarestorage.com`,
        });

        // If it's SSL/network error, try different approach on next attempt
        if (attempt < maxRetries && (
          error.message?.includes('SSL') ||
          error.message?.includes('EPROTO') ||
          error.message?.includes('handshake') ||
          error.message?.includes('fetch failed') ||
          error.code === 'EPROTO'
        )) {
          const delay = 1000 * attempt; // 1s, 2s, 3s
          this.logger.warn(`⏳ Retrying R2 upload with different config in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // If it's auth error, no point retrying
        if (error.message?.includes('403') || error.message?.includes('401')) {
          this.logger.error('❌ R2 authentication failed - check credentials');
          break;
        }

        // Other errors - retry
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
          continue;
        }

        break;
      }
    }

    throw lastError;
  }

  // Alternative method using signed URL (if direct PUT fails)
  private async uploadViaSignedUrl(
    file: UploadedFile,
    userId: string,
    employeeCode: string
  ): Promise<string> {
    try {
      // Generate unique filename
      const fileExtension = this.getFileExtension(file.originalname);
      const fileName = `avatars/${employeeCode}_${userId}_${Date.now()}.${fileExtension}`;
      
      this.logger.log(`🔄 Trying R2 signed URL approach for user ${userId}, filename: ${fileName}`);
      
      // Generate presigned URL for upload
      const signedUrl = await this.generatePresignedUrl(fileName, file.mimetype);
      
      // Upload using presigned URL (simpler, no authentication headers)
      const response = await fetch(signedUrl, {
        method: 'PUT',
        body: new Uint8Array(file.buffer),
        headers: {
          'Content-Type': file.mimetype,
        },
      });

      if (response.ok) {
        const publicUrl = `${this.publicUrl}/${fileName}`;
        this.logger.log(`✅ Avatar uploaded via signed URL: ${publicUrl}`);
        return publicUrl;
      } else {
        const errorText = await response.text();
        throw new Error(`Signed URL upload failed: ${response.status} - ${errorText}`);
      }

    } catch (error) {
      this.logger.error('❌ Signed URL upload failed:', error);
      throw error;
    }
  }

  private async generatePresignedUrl(fileName: string, contentType: string): Promise<string> {
    // This is a simplified presigned URL generation
    // For production, you might want to use AWS SDK or implement full presigned URL logic
    const expires = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    
    const path = `/${this.bucketName}/${fileName}`;
    const headers = {
      'content-type': contentType,
    };
    
    const signedHeaders = this.getSignedHeaders('PUT', path, headers, Buffer.alloc(0));
    
    // Build query string with signature
    const params = new URLSearchParams({
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': signedHeaders['authorization'].match(/Credential=([^,]+)/)?.[1] || '',
      'X-Amz-Date': signedHeaders['x-amz-date'],
      'X-Amz-Expires': '3600',
      'X-Amz-SignedHeaders': 'content-type;host',
    });
    
    return `https://${this.accountId}.r2.cloudflarestorage.com${path}?${params.toString()}`;
  }

  async deleteAvatar(avatarUrl: string): Promise<void> {
    try {
      if (!avatarUrl) return;

      // Handle local file deletion
      if (avatarUrl.startsWith('/uploads/')) {
        await this.deleteLocalFile(avatarUrl);
        return;
      }

      // Handle R2 deletion
      const fileName = this.extractFileKeyFromUrl(avatarUrl);
      if (!fileName) {
        this.logger.warn(`Could not extract filename from URL: ${avatarUrl}`);
        return;
      }

      this.logger.log(`🗑️ Starting avatar deletion: ${fileName}`);
      
      const path = `/${this.bucketName}/${fileName}`;
      
      try {
        // Sign the delete request
        const signedHeaders = this.getSignedHeaders('DELETE', path, {}, Buffer.alloc(0));
        
        // Make the delete request with plain fetch
        const url = `https://${this.accountId}.r2.cloudflarestorage.com${path}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
        
        const response = await fetch(url, {
          method: 'DELETE',
          headers: signedHeaders,
          signal: controller.signal,
          // Plain fetch without custom agent
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok || response.status === 404) {
          this.logger.log(`✅ R2 avatar deleted successfully: ${fileName}`);
        } else {
          const errorText = await response.text();
          this.logger.warn(`⚠️ R2 delete failed with status ${response.status}: ${errorText}`);
        }
      } catch (error: any) {
        this.logger.warn(`⚠️ R2 delete failed: ${error.message}`);
      }

    } catch (error: any) {
      this.logger.error(`❌ Failed to delete avatar: ${avatarUrl}`, error);
    }
  }

  private async deleteLocalFile(localUrl: string): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const filePath = path.join(process.cwd(), localUrl);
      await fs.unlink(filePath);
      
      this.logger.log(`✅ Local avatar deleted: ${localUrl}`);
    } catch (error) {
      this.logger.warn(`⚠️ Failed to delete local file: ${localUrl}`, error);
    }
  }

  private getFileExtension(filename: string): string {
    return filename.split('.').pop()?.toLowerCase() || 'jpg';
  }

  private extractFileKeyFromUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      return pathname.startsWith('/') ? pathname.substring(1) : pathname;
    } catch (error) {
      this.logger.error(`Error extracting filename from URL: ${url}`, error);
      return null;
    }
  }

  // Utility method to validate image file
  isValidImageFile(file: UploadedFile): boolean {
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const maxSizeInBytes = 5 * 1024 * 1024; // 5MB

    if (!allowedMimeTypes.includes(file.mimetype)) {
      this.logger.warn(`Invalid mime type: ${file.mimetype}`);
      return false;
    }

    if (file.size > maxSizeInBytes) {
      this.logger.warn(`File too large: ${file.size} bytes (max: ${maxSizeInBytes})`);
      return false;
    }

    return true;
  }

  // Health check method - only test local storage
  async isHealthy(): Promise<boolean> {
    try {
      // Test local storage capability only
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const testDir = path.join(process.cwd(), 'uploads', 'avatars');
      await fs.mkdir(testDir, { recursive: true });
      
      // Test write capability
      const testFile = path.join(testDir, 'health-check.test');
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);
      
      this.logger.log('✅ Local storage health check passed');
      
      // R2 connectivity test disabled
      // this.testR2Connectivity().catch(() => {});
      
      return true;
      
    } catch (error: any) {
      this.logger.error('❌ Local storage health check failed:', error.message);
      return false;
    }
  }

  private async testR2Connectivity(): Promise<void> {
    try {
      // Simple HEAD request to bucket
      const path = `/${this.bucketName}/`;
      const signedHeaders = this.getSignedHeaders('HEAD', path, {}, Buffer.alloc(0));
      const url = `https://${this.accountId}.r2.cloudflarestorage.com${path}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(url, {
        method: 'HEAD',
        headers: signedHeaders,
        signal: controller.signal,
        // Plain fetch without custom agent
      });
      
      clearTimeout(timeoutId);
      
      this.logger.log(`✅ R2 connectivity test completed with status: ${response.status}`);
      
    } catch (error: any) {
      this.logger.warn('⚠️ R2 connectivity test failed:', error.message);
    }
  }

  // Manual sync method for existing local files
  async syncExistingFilesToR2(): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const uploadsDir = path.join(process.cwd(), 'uploads', 'avatars');
      const files = await fs.readdir(uploadsDir);
      
      this.logger.log(`🔄 Starting sync of ${files.length} existing files to R2`);
      
      let successful = 0;
      let failed = 0;
      
      for (const fileName of files) {
        try {
          const filePath = path.join(uploadsDir, fileName);
          const fileBuffer = await fs.readFile(filePath);
          
          // Extract info from filename pattern: {employeeCode}_${userId}_${timestamp}.{ext}
          const [employeeCode, userId] = fileName.split('_');
          
          if (!employeeCode || !userId) {
            this.logger.warn(`⚠️ Skipping file with invalid name pattern: ${fileName}`);
            continue;
          }
          
          const mockFile: UploadedFile = {
            fieldname: 'file',
            originalname: fileName,
            encoding: '7bit',
            mimetype: `image/${fileName.split('.').pop()}`,
            size: fileBuffer.length,
            buffer: fileBuffer,
          };
          
          await this.uploadViaOptimizedFetch(mockFile, userId, employeeCode);
          successful++;
          this.logger.log(`✅ Synced to R2: ${fileName}`);
          
        } catch (error) {
          failed++;
          this.logger.error(`❌ Failed to sync: ${fileName}`, error);
        }
      }
      
      this.logger.log(`📊 R2 sync completed: ${successful} successful, ${failed} failed`);
      
    } catch (error) {
      this.logger.error('❌ Failed to sync existing files to R2:', error);
    }
  }

  private async uploadToLocalStorage(
    file: UploadedFile,
    userId: string,
    employeeCode: string
  ): Promise<string> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      // Generate unique filename
      const fileExtension = this.getFileExtension(file.originalname);
      const fileName = `${employeeCode}_${userId}_${Date.now()}.${fileExtension}`;
      
      // Create uploads directory if it doesn't exist
      const uploadsDir = path.join(process.cwd(), 'uploads', 'avatars');
      await fs.mkdir(uploadsDir, { recursive: true });
      
      // Save file locally
      const filePath = path.join(uploadsDir, fileName);
      await fs.writeFile(filePath, file.buffer);
      
      // Return local URL that works with ServeStaticModule
      const localUrl = `/uploads/avatars/${fileName}`;
      
      this.logger.log(`✅ Avatar saved locally for user ${userId}: ${localUrl}`);
      
      return localUrl;
      
    } catch (error) {
      this.logger.error('❌ Local storage fallback failed:', error);
      throw new InternalServerErrorException('All upload methods failed. Please contact administrator.');
    }
  }

  private async uploadViaOptimizedFetch(
    file: UploadedFile,
    userId: string,
    employeeCode: string
  ): Promise<string> {
    const maxRetries = 2;
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Generate unique filename
        const fileExtension = this.getFileExtension(file.originalname);
        const fileName = `avatars/${employeeCode}_${userId}_${Date.now()}.${fileExtension}`;
        const path = `/${this.bucketName}/${fileName}`;
        
        this.logger.log(`🔄 R2 optimized upload attempt ${attempt}/${maxRetries} for user ${userId}, filename: ${fileName}`);
        
        // Prepare headers with proper format
        const headers = {
          'content-type': file.mimetype,
          'content-length': file.size.toString(),
          'x-amz-meta-userid': userId,
          'x-amz-meta-employeecode': employeeCode,
          'x-amz-meta-uploadedat': new Date().toISOString(),
          'x-amz-meta-originalname': file.originalname.replace(/[^\w\s.-]/gi, ''),
        };

        // Sign the request using S3-compatible API
        const signedHeaders = this.getSignedHeaders('PUT', path, headers, file.buffer);
        
        // Use S3-compatible endpoint
        const url = `https://${this.accountId}.r2.cloudflarestorage.com${path}`;
        
        this.logger.debug(`🔗 R2 Optimized Upload URL: ${url}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s timeout
        
        try {
          const response = await fetch(url, {
            method: 'PUT',
            headers: signedHeaders,
            body: new Uint8Array(file.buffer),
            signal: controller.signal,
            // Keep it simple - let Node.js handle SSL negotiation
            keepalive: false,
            redirect: 'follow',
          });
          
          clearTimeout(timeoutId);
          
          this.logger.debug(`📊 R2 optimized response status: ${response.status}`);
          
          if (response.ok) {
            const publicUrl = `${this.publicUrl}/${fileName}`;
            this.logger.log(`✅ Avatar uploaded via optimized fetch: ${publicUrl}`);
            return publicUrl;
          } else {
            const errorText = await response.text().catch(() => 'Unable to read response body');
            const errorMsg = `R2 Optimized API Error ${response.status}: ${response.statusText} - ${errorText}`;
            this.logger.error(`❌ ${errorMsg}`);
            throw new Error(errorMsg);
          }
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          
          // Enhanced error logging for fetch failures
          this.logger.error(`🚨 R2 optimized fetch error (attempt ${attempt}):`, {
            message: fetchError.message,
            cause: fetchError.cause?.message || fetchError.cause,
            code: fetchError.code,
            name: fetchError.name,
            stack: fetchError.stack?.substring(0, 200),
          });
          
          throw fetchError;
        }

      } catch (error: any) {
        lastError = error;
        
        this.logger.error(`❌ R2 optimized upload attempt ${attempt}/${maxRetries} failed:`, {
          message: error.message,
          cause: error.cause?.message || error.cause,
          name: error.name,
        });

        if (attempt < maxRetries) {
          const delay = 2000 * attempt; // 2s, 4s
          this.logger.warn(`⏳ Retrying R2 optimized upload in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        break;
      }
    }

    throw lastError;
  }
}
