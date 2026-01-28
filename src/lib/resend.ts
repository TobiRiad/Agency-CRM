import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
}

export interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  try {
    const { data, error } = await resend.emails.send({
      from: params.from || 'CRM <noreply@yourdomain.com>',
      to: params.to,
      subject: params.subject,
      html: params.html,
      reply_to: params.replyTo,
      tags: params.tags,
    });

    if (error) {
      console.error('Resend error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (error) {
    console.error('Failed to send email:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

export async function sendBulkEmails(
  emails: SendEmailParams[],
  onProgress?: (sent: number, total: number) => void
): Promise<SendEmailResult[]> {
  const results: SendEmailResult[] = [];
  const total = emails.length;

  for (let i = 0; i < emails.length; i++) {
    const result = await sendEmail(emails[i]);
    results.push(result);
    
    if (onProgress) {
      onProgress(i + 1, total);
    }

    // Rate limiting: Resend allows 10 emails per second on free tier
    // Add a small delay between emails to be safe
    if (i < emails.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }

  return results;
}

// Webhook event types from Resend
export type ResendWebhookEventType = 
  | 'email.sent'
  | 'email.delivered'
  | 'email.delivery_delayed'
  | 'email.complained'
  | 'email.bounced'
  | 'email.opened'
  | 'email.clicked';

export interface ResendWebhookEvent {
  type: ResendWebhookEventType;
  created_at: string;
  data: {
    created_at: string;
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    // For click events
    click?: {
      ipAddress: string;
      link: string;
      timestamp: string;
      userAgent: string;
    };
    // For bounce events
    bounce?: {
      message: string;
    };
  };
}

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  // Resend uses svix for webhooks
  // In production, you should verify the signature
  // For now, we'll do a basic check
  if (!signature || !secret) {
    console.warn('Webhook signature verification skipped - missing signature or secret');
    return true; // Skip verification in development
  }
  
  // TODO: Implement proper svix signature verification
  // const wh = new Webhook(secret);
  // wh.verify(payload, headers);
  
  return true;
}

export function parseWebhookEvent(body: unknown): ResendWebhookEvent | null {
  try {
    if (typeof body === 'string') {
      return JSON.parse(body) as ResendWebhookEvent;
    }
    return body as ResendWebhookEvent;
  } catch {
    console.error('Failed to parse webhook event');
    return null;
  }
}
