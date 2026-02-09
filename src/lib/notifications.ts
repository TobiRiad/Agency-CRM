import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Send a notification email to the admin about an AI agent decision.
 * Uses Resend so it works regardless of the email provider setting.
 */
export async function notifyAgentAction(params: {
  contactName: string;
  contactEmail: string;
  campaignName: string;
  classification: string;
  summary: string;
  actionTaken: string;
  followUpDate?: string;
  originalSubject?: string;
}): Promise<void> {
  const notificationEmail = process.env.NOTIFICATION_EMAIL;
  
  if (!notificationEmail) {
    console.warn('NOTIFICATION_EMAIL not set, skipping agent notification');
    return;
  }

  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set, skipping agent notification');
    return;
  }

  const classificationEmoji: Record<string, string> = {
    out_of_office: '🏖️',
    reply: '💬',
    bounce: '❌',
    unrelated: '❓',
  };

  const emoji = classificationEmoji[params.classification] || '📧';

  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
        <h2 style="margin: 0 0 8px 0; color: #1a1a1a;">${emoji} Inbox Agent Action</h2>
        <p style="margin: 0; color: #666; font-size: 14px;">Campaign: ${params.campaignName}</p>
      </div>
      
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #666; width: 140px;">Contact</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-weight: 500;">${params.contactName} (${params.contactEmail})</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #666;">Classification</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">
            <span style="background: ${params.classification === 'reply' ? '#dcfce7' : params.classification === 'out_of_office' ? '#fef3c7' : '#fee2e2'}; 
                         color: ${params.classification === 'reply' ? '#166534' : params.classification === 'out_of_office' ? '#92400e' : '#991b1b'}; 
                         padding: 2px 8px; border-radius: 4px; font-size: 13px; font-weight: 500;">
              ${params.classification.replace(/_/g, ' ').toUpperCase()}
            </span>
          </td>
        </tr>
        ${params.originalSubject ? `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #666;">Subject</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${params.originalSubject}</td>
        </tr>` : ''}
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #666;">AI Summary</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${params.summary}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #666;">Action Taken</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-weight: 500;">${params.actionTaken}</td>
        </tr>
        ${params.followUpDate ? `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #666;">Follow-up Date</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-weight: 500;">${new Date(params.followUpDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</td>
        </tr>` : ''}
      </table>

      <p style="color: #999; font-size: 12px; margin-top: 20px;">
        This is an automated notification from your CRM inbox agent.
      </p>
    </div>
  `;

  try {
    await resend.emails.send({
      from: process.env.NOTIFICATION_FROM_EMAIL || 'CRM Agent <noreply@yourdomain.com>',
      to: notificationEmail,
      subject: `${emoji} [${params.classification.replace(/_/g, ' ')}] ${params.contactName} — ${params.campaignName}`,
      html: htmlBody,
    });
    console.log(`Agent notification sent to ${notificationEmail}`);
  } catch (error) {
    console.error('Failed to send agent notification:', error);
    // Don't throw — notification failure shouldn't block the main flow
  }
}
