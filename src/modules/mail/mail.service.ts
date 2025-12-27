import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

/**
 * Interface untuk data welcome email
 */
export interface WelcomeEmailData {
  userEmail: string;
  userName: string;
  generatedPassword: string;
  loginUrl: string;
  createdAt: string;
  roleName: string;
}

/**
 * Interface untuk data export notification
 */
export interface ExportEmailData {
  userEmail: string;
  userName: string;
  fileName: string;
  downloadUrl: string;
  reportType: string;
  period: string;
  exportedAt: string;
  recordCount: number;
}

@Injectable()
export class MailService {
  constructor(private readonly mailerService: MailerService) {}

  /**
   * Send welcome email with credentials to new user
   * Uses Handlebars template: welcome-email.hbs
   *
   * @param data - Welcome email data containing user credentials
   * @returns Promise<void>
   * @throws Error if email sending fails
   */
  async sendWelcomeEmail(data: WelcomeEmailData): Promise<void> {
    await this.mailerService.sendMail({
      to: data.userEmail,
      subject: 'Selamat Datang di Sales AIDIA - Akun Anda Telah Dibuat',
      template: 'welcome-email',
      context: {
        userName: data.userName,
        userEmail: data.userEmail,
        generatedPassword: data.generatedPassword,
        loginUrl: data.loginUrl,
        createdAt: data.createdAt,
        roleName: data.roleName,
      },
    });
  }

  /**
   * Send Excel export completion notification
   *
   * @param data - Export notification data
   * @returns Promise<void>
   * @throws Error if email sending fails
   */
  async sendExportNotification(data: ExportEmailData): Promise<void> {
    await this.mailerService.sendMail({
      to: data.userEmail,
      subject: `Export ${data.reportType} Selesai - Sales AIDIA`,
      template: 'export-notification',
      context: {
        userName: data.userName,
        fileName: data.fileName,
        downloadUrl: data.downloadUrl,
        reportType: data.reportType,
        period: data.period,
        exportedAt: data.exportedAt,
        recordCount: data.recordCount,
      },
    });
  }
}
