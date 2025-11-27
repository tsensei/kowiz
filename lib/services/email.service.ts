import { Resend } from 'resend';
import type { File as DbFile } from '@/lib/db/schema';

type SendResult = { success: true } | { success: false; error: string };

class EmailService {
  private client: Resend | null = null;
  private initialized = false;

  private getClient(): Resend | null {
    if (!this.initialized) {
      const apiKey = process.env.RESEND_API_KEY;
      const fromEmail = process.env.RESEND_FROM_EMAIL;

      if (apiKey) {
        this.client = new Resend(apiKey);
        console.log('[email] Resend configured', {
          apiKeyLength: apiKey.length,
          fromEmail,
        });
      } else {
        this.client = null;
        console.warn('[email] Resend API key not configured, skipping email send', {
          hasFromEmail: Boolean(fromEmail),
        });
      }
      this.initialized = true;
    }
    return this.client;
  }

  async sendBatchCompleteEmail(params: {
    to: string;
    username?: string | null;
    batchId: string;
    files: DbFile[];
  }): Promise<SendResult> {
    const client = this.getClient();
    if (!client) {
      console.warn('Resend API key not configured, skipping email send');
      return { success: false, error: 'Resend API key not configured' };
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'notification@kowiz.tsensei.dev';
    const subject = '✅ Your KOWiz batch is complete!';

    const completedCount = params.files.filter(f => f.status === 'completed').length;
    const failedCount = params.files.filter(f => f.status === 'failed').length;

    const fileRows = params.files
      .map((file) => {
        const statusColor = file.status === 'completed' ? '#10b981' : '#ef4444';
        const statusIcon = file.status === 'completed' ? '✓' : '✗';
        const statusText = file.status.charAt(0).toUpperCase() + file.status.slice(1);

        return `
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
              <span style="color: #1f2937; font-weight: 500;">${file.name}</span>
            </td>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; text-align: right;">
              <span style="display: inline-block; padding: 4px 12px; background: ${statusColor}15; color: ${statusColor}; border-radius: 12px; font-size: 13px; font-weight: 600;">
                ${statusIcon} ${statusText}
              </span>
            </td>
          </tr>
        `;
      })
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background: #f3f4f6; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
                  
                  <!-- Header with gradient -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 32px 40px; text-align: center;">
                      <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
                        🎉 Batch Complete!
                      </h1>
                      <p style="margin: 8px 0 0 0; color: rgba(255, 255, 255, 0.9); font-size: 15px;">
                        Your files have been processed
                      </p>
                    </td>
                  </tr>

                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px;">
                      <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                        Hi <strong>${params.username || 'there'}</strong>,
                      </p>
                      
                      <p style="margin: 0 0 24px 0; color: #6b7280; font-size: 15px; line-height: 1.6;">
                        Your upload batch has finished processing. Here's a summary:
                      </p>

                      <!-- Stats -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 32px;">
                        <tr>
                          <td style="padding: 16px; background: #f9fafb; border-radius: 8px; border-left: 4px solid #10b981;">
                            <div style="color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Total Files</div>
                            <div style="color: #1f2937; font-size: 24px; font-weight: 700;">${params.files.length}</div>
                          </td>
                          <td style="width: 16px;"></td>
                          <td style="padding: 16px; background: #f0fdf4; border-radius: 8px; border-left: 4px solid #10b981;">
                            <div style="color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Completed</div>
                            <div style="color: #10b981; font-size: 24px; font-weight: 700;">${completedCount}</div>
                          </td>
                          ${failedCount > 0 ? `
                          <td style="width: 16px;"></td>
                          <td style="padding: 16px; background: #fef2f2; border-radius: 8px; border-left: 4px solid #ef4444;">
                            <div style="color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Failed</div>
                            <div style="color: #ef4444; font-size: 24px; font-weight: 700;">${failedCount}</div>
                          </td>
                          ` : ''}
                        </tr>
                      </table>

                      <!-- Files Table -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
                        <thead>
                          <tr style="background: #f9fafb;">
                            <th style="padding: 12px 16px; text-align: left; color: #6b7280; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">File</th>
                            <th style="padding: 12px 16px; text-align: right; color: #6b7280; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${fileRows}
                        </tbody>
                      </table>

                      <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 13px;">
                        <strong>Batch ID:</strong> <code style="background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 12px;">${params.batchId}</code>
                      </p>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="background: #f9fafb; padding: 24px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
                      <p style="margin: 0; color: #9ca3af; font-size: 13px;">
                        Thanks for using <strong style="color: #667eea;">KOWiz</strong>
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;

    console.log('[email] Attempting to send email:', {
      from: fromEmail,
      to: params.to,
      subject,
      batchId: params.batchId,
      fileCount: params.files.length,
    });

    try {
      const response = await client.emails.send({
        from: fromEmail,
        to: params.to,
        subject,
        html,
      });
      console.log('[email] Resend API response:', JSON.stringify(response, null, 2));

      if (response.error) {
        console.error('[email] Resend returned error:', response.error);
        return { success: false, error: response.error.message || 'Email send failed' };
      }

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send email';
      console.error('[email] Exception sending email:', message);
      console.error('[email] Full error:', JSON.stringify(error, null, 2));
      return { success: false, error: message };
    }
  }
}

export const emailService = new EmailService();
