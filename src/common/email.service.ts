import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

export interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  template?: string;
  data?: Record<string, any>;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const smtpConfig = {
      host: this.configService.get('SMTP_HOST', 'localhost'),
      port: this.configService.get('SMTP_PORT', 587),
      secure: this.configService.get('SMTP_SECURE', false), // true for 465, false for other ports
      tls: {
        // Allow self-signed certificates and disable TLS for local development
        rejectUnauthorized: this.configService.get('SMTP_TLS_REJECT_UNAUTHORIZED', 'true') === 'true'
      },
      auth: {
        user: this.configService.get('SMTP_USER'),
        pass: this.configService.get('SMTP_PASS'),
      },
    };

    // For development, use ethereal email (fake smtp server)
    if (process.env.NODE_ENV === 'development' && !smtpConfig.auth.user) {
      this.logger.warn('No SMTP configuration found. Email sending will be simulated.');
      this.transporter = nodemailer.createTransport({
        streamTransport: true,
        newline: 'unix',
        buffer: true,
      });
      return;
    }

    this.transporter = nodemailer.createTransport(smtpConfig);

    // Verify connection
    this.transporter.verify((error) => {
      if (error) {
        this.logger.error('SMTP connection failed:', error);
      } else {
        this.logger.log('SMTP server is ready');
      }
    });
  }

  async sendEmail(options: SendEmailOptions): Promise<boolean> {
    try {
      const mailOptions = {
        from: this.configService.get('SMTP_FROM', 'noreply@tbsgroup.com'),
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        html: options.html || this.renderTemplate(options.template, options.data),
        text: options.text,
      };

      if (process.env.NODE_ENV === 'development') {
        this.logger.log('📧 Email would be sent:');
        this.logger.log(`To: ${mailOptions.to}`);
        this.logger.log(`Subject: ${mailOptions.subject}`);
        this.logger.log(`HTML: ${mailOptions.html?.substring(0, 200)}...`);
        return true;
      }

      const result = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Email sent successfully to ${mailOptions.to}:`, result.messageId);
      return true;
    } catch (error) {
      this.logger.error('Failed to send email:', error);
      return false;
    }
  }

  private renderTemplate(templateName?: string, data?: Record<string, any>): string {
    if (!templateName) {
      return '';
    }

    const templates = this.getEmailTemplates();
    const template = templates[templateName];
    
    if (!template) {
      this.logger.warn(`Email template not found: ${templateName}`);
      return '';
    }

    // Simple template replacement - in production, use a proper template engine
    let html = template.html;
    if (data) {
      Object.keys(data).forEach(key => {
        const placeholder = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
        html = html.replace(placeholder, String(data[key] || ''));
      });
    }

    return html;
  }

  private getEmailTemplates(): Record<string, EmailTemplate> {
    const baseUrl = this.configService.get('FRONTEND_URL', 'http://localhost:3000');
    
    return {
      'gate-pass-approval-request': {
        subject: 'Yêu cầu duyệt giấy ra vào cổng - {{passNumber}}',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
            <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #2563eb; margin: 0;">TBS Group</h1>
                <p style="color: #6b7280; margin: 5px 0 0 0;">Hệ thống quản lý giấy ra vào cổng</p>
              </div>
              
              <h2 style="color: #1f2937; margin-bottom: 20px;">Yêu cầu duyệt giấy ra vào cổng</h2>
              
              <p style="color: #374151; margin-bottom: 20px;">Xin chào <strong>{{approverName}}</strong>,</p>
              
              <p style="color: #374151; margin-bottom: 20px;">
                Nhân viên <strong>{{requesterName}}</strong> ({{employeeCode}}) đã tạo yêu cầu giấy ra vào cổng cần được duyệt.
              </p>
              
              <div style="background-color: #f3f4f6; padding: 20px; border-radius: 6px; margin: 20px 0;">
                <h3 style="margin: 0 0 15px 0; color: #1f2937;">Thông tin chi tiết:</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; font-weight: bold; color: #374151; width: 35%;">Số giấy:</td>
                    <td style="padding: 8px 0; color: #1f2937;">{{passNumber}}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-weight: bold; color: #374151;">Lý do:</td>
                    <td style="padding: 8px 0; color: #1f2937;">{{reason}}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-weight: bold; color: #374151;">Địa điểm:</td>
                    <td style="padding: 8px 0; color: #1f2937;">{{location}}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-weight: bold; color: #374151;">Thời gian ra:</td>
                    <td style="padding: 8px 0; color: #1f2937;">{{startDateTime}}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-weight: bold; color: #374151;">Thời gian vào:</td>
                    <td style="padding: 8px 0; color: #1f2937;">{{endDateTime}}</td>
                  </tr>
                </table>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${baseUrl}/gate-pass/{{gatePassId}}/approval" 
                   style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 30px; 
                          text-decoration: none; border-radius: 6px; font-weight: bold;">
                  Duyệt ngay
                </a>
              </div>
              
              <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
                Nếu nút không hoạt động, vui lòng copy link sau vào trình duyệt:<br>
                <a href="${baseUrl}/gate-pass/{{gatePassId}}/approval" style="color: #2563eb;">
                  ${baseUrl}/gate-pass/{{gatePassId}}/approval
                </a>
              </p>
              
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
              
              <p style="color: #6b7280; font-size: 12px; text-align: center; margin: 0;">
                © 2024 TBS Group. Đây là email tự động, vui lòng không trả lời email này.
              </p>
            </div>
          </div>
        `
      },
      'gate-pass-approved': {
        subject: 'Giấy ra vào cổng đã được duyệt - {{passNumber}}',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
            <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #059669; margin: 0;">TBS Group</h1>
                <p style="color: #6b7280; margin: 5px 0 0 0;">Hệ thống quản lý giấy ra vào cổng</p>
              </div>
              
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="display: inline-block; background-color: #10b981; color: white; padding: 10px 20px; border-radius: 20px;">
                  ✓ ĐÃ DUYỆT
                </div>
              </div>
              
              <h2 style="color: #1f2937; margin-bottom: 20px; text-align: center;">Giấy ra vào cổng đã được duyệt</h2>
              
              <p style="color: #374151; margin-bottom: 20px;">Xin chào <strong>{{userName}}</strong>,</p>
              
              <p style="color: #374151; margin-bottom: 20px;">
                Giấy ra vào cổng của bạn đã được duyệt thành công.
              </p>
              
              <div style="background-color: #ecfdf5; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #10b981;">
                <h3 style="margin: 0 0 15px 0; color: #1f2937;">Thông tin giấy ra vào cổng:</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; font-weight: bold; color: #374151; width: 35%;">Số giấy:</td>
                    <td style="padding: 8px 0; color: #1f2937;">{{passNumber}}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-weight: bold; color: #374151;">Địa điểm:</td>
                    <td style="padding: 8px 0; color: #1f2937;">{{location}}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-weight: bold; color: #374151;">Thời gian ra:</td>
                    <td style="padding: 8px 0; color: #1f2937;">{{startDateTime}}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-weight: bold; color: #374151;">Thời gian vào:</td>
                    <td style="padding: 8px 0; color: #1f2937;">{{endDateTime}}</td>
                  </tr>
                </table>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${baseUrl}/gate-pass/{{gatePassId}}" 
                   style="display: inline-block; background-color: #059669; color: white; padding: 12px 30px; 
                          text-decoration: none; border-radius: 6px; font-weight: bold;">
                  Xem chi tiết
                </a>
              </div>
              
              <p style="color: #065f46; background-color: #ecfdf5; padding: 15px; border-radius: 6px; margin: 20px 0;">
                <strong>Lưu ý:</strong> Vui lòng mang theo giấy ra vào cổng này khi rời khỏi và quay lại công ty.
              </p>
              
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
              
              <p style="color: #6b7280; font-size: 12px; text-align: center; margin: 0;">
                © 2024 TBS Group. Đây là email tự động, vui lòng không trả lời email này.
              </p>
            </div>
          </div>
        `
      },
      'gate-pass-rejected': {
        subject: 'Giấy ra vào cổng bị từ chối - {{passNumber}}',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
            <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #dc2626; margin: 0;">TBS Group</h1>
                <p style="color: #6b7280; margin: 5px 0 0 0;">Hệ thống quản lý giấy ra vào cổng</p>
              </div>
              
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="display: inline-block; background-color: #dc2626; color: white; padding: 10px 20px; border-radius: 20px;">
                  ✗ TỪ CHỐI
                </div>
              </div>
              
              <h2 style="color: #1f2937; margin-bottom: 20px; text-align: center;">Giấy ra vào cổng bị từ chối</h2>
              
              <p style="color: #374151; margin-bottom: 20px;">Xin chào <strong>{{userName}}</strong>,</p>
              
              <p style="color: #374151; margin-bottom: 20px;">
                Rất tiếc, giấy ra vào cổng của bạn đã bị từ chối.
              </p>
              
              <div style="background-color: #fef2f2; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #dc2626;">
                <h3 style="margin: 0 0 15px 0; color: #1f2937;">Thông tin giấy ra vào cổng:</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; font-weight: bold; color: #374151; width: 35%;">Số giấy:</td>
                    <td style="padding: 8px 0; color: #1f2937;">{{passNumber}}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-weight: bold; color: #374151;">Địa điểm:</td>
                    <td style="padding: 8px 0; color: #1f2937;">{{location}}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-weight: bold; color: #374151;">Thời gian ra:</td>
                    <td style="padding: 8px 0; color: #1f2937;">{{startDateTime}}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-weight: bold; color: #374151;">Thời gian vào:</td>
                    <td style="padding: 8px 0; color: #1f2937;">{{endDateTime}}</td>
                  </tr>
                  {{#rejectionReason}}
                  <tr>
                    <td style="padding: 8px 0; font-weight: bold; color: #374151;">Lý do từ chối:</td>
                    <td style="padding: 8px 0; color: #dc2626;">{{rejectionReason}}</td>
                  </tr>
                  {{/rejectionReason}}
                </table>
              </div>
              
              <p style="color: #dc2626; background-color: #fef2f2; padding: 15px; border-radius: 6px; margin: 20px 0;">
                <strong>Gợi ý:</strong> Bạn có thể tạo lại yêu cầu giấy ra vào cổng với thông tin chính xác hơn hoặc liên hệ với người quản lý để biết thêm chi tiết.
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${baseUrl}/gate-pass" 
                   style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 30px; 
                          text-decoration: none; border-radius: 6px; font-weight: bold;">
                  Tạo yêu cầu mới
                </a>
              </div>
              
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
              
              <p style="color: #6b7280; font-size: 12px; text-align: center; margin: 0;">
                © 2024 TBS Group. Đây là email tự động, vui lòng không trả lời email này.
              </p>
            </div>
          </div>
        `
      }
    };
  }
}