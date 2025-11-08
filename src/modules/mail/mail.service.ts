import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

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
   * Send Excel export completion notification
   */
  async sendExportNotification(data: ExportEmailData): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to: data.userEmail,
        subject: `[Sales AIDIA] ${data.reportType} - Export Selesai`,
        html: this.generateExportEmailTemplate(data),
      });
    } catch (error) {
      console.error('Failed to send export notification email:', error);
      throw error;
    }
  }

  /**
   * Generate HTML email template for export notification
   */
  private generateExportEmailTemplate(data: ExportEmailData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 8px 8px 0 0;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 600;
          }
          .content {
            background: #f8f9fa;
            padding: 30px;
            border-radius: 0 0 8px 8px;
          }
          .info-box {
            background: white;
            padding: 20px;
            border-radius: 6px;
            margin: 20px 0;
            border-left: 4px solid #667eea;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #e9ecef;
          }
          .info-row:last-child {
            border-bottom: none;
          }
          .info-label {
            font-weight: 600;
            color: #495057;
          }
          .info-value {
            color: #212529;
          }
          .download-button {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white !important;
            padding: 14px 32px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            margin: 20px 0;
            text-align: center;
            transition: transform 0.2s;
          }
          .download-button:hover {
            transform: translateY(-2px);
          }
          .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 2px solid #e9ecef;
            color: #6c757d;
            font-size: 14px;
          }
          .success-icon {
            font-size: 48px;
            margin-bottom: 10px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="success-icon">✅</div>
          <h1>Export Excel Berhasil</h1>
        </div>
        
        <div class="content">
          <p>Halo <strong>${data.userName}</strong>,</p>
          
          <p>Export laporan Anda telah selesai diproses. Berikut detail ekspor:</p>
          
          <div class="info-box">
            <div class="info-row">
              <span class="info-label">Jenis Laporan:</span>
              <span class="info-value">${data.reportType}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Periode:</span>
              <span class="info-value">${data.period}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Jumlah Data:</span>
              <span class="info-value">${data.recordCount.toLocaleString('id-ID')} record</span>
            </div>
            <div class="info-row">
              <span class="info-label">Nama File:</span>
              <span class="info-value">${data.fileName}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Waktu Export:</span>
              <span class="info-value">${data.exportedAt}</span>
            </div>
          </div>
          
          <center>
            <a href="${data.downloadUrl}" class="download-button">
              📥 Download File Excel
            </a>
          </center>
          
          <p style="margin-top: 20px; font-size: 14px; color: #6c757d;">
            <strong>Catatan:</strong> Link download akan kadaluarsa dalam 24 jam. 
            Silakan download file Anda sebelum waktu tersebut.
          </p>
        </div>
        
        <div class="footer">
          <p>Email otomatis dari Sales AIDIA Management System</p>
          <p style="font-size: 12px;">Jika Anda tidak melakukan request export ini, abaikan email ini.</p>
        </div>
      </body>
      </html>
    `;
  }
}
