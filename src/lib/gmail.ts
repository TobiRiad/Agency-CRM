import { google } from 'googleapis';

export interface GmailConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  userEmail: string;
}

export interface SendGmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}

export interface SendGmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

function createGmailClient(config: GmailConfig) {
  const oauth2Client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret
  );

  oauth2Client.setCredentials({
    refresh_token: config.refreshToken,
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

function createEmailMessage(params: SendGmailParams, fromEmail: string): string {
  const boundary = 'boundary_' + Date.now().toString(16);
  
  const emailLines = [
    `From: ${params.from || fromEmail}`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    params.html,
    `--${boundary}--`,
  ];

  if (params.replyTo) {
    emailLines.splice(3, 0, `Reply-To: ${params.replyTo}`);
  }

  const email = emailLines.join('\r\n');
  
  // Base64 URL-safe encode
  return Buffer.from(email)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function sendGmail(
  params: SendGmailParams,
  config: GmailConfig
): Promise<SendGmailResult> {
  try {
    const gmail = createGmailClient(config);
    const raw = createEmailMessage(params, config.userEmail);

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw,
      },
    });

    return {
      success: true,
      id: response.data.id || undefined,
    };
  } catch (error) {
    console.error('Gmail send error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email via Gmail',
    };
  }
}

export async function sendBulkGmails(
  emails: SendGmailParams[],
  config: GmailConfig,
  onProgress?: (sent: number, total: number) => void
): Promise<SendGmailResult[]> {
  const results: SendGmailResult[] = [];
  const total = emails.length;

  for (let i = 0; i < emails.length; i++) {
    const result = await sendGmail(emails[i], config);
    results.push(result);

    if (onProgress) {
      onProgress(i + 1, total);
    }

    // Gmail API has rate limits - add delay between emails
    // Default quota: 100 emails per second (but varies by account)
    if (i < emails.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return results;
}

// OAuth2 setup helpers
export function getGmailAuthUrl(clientId: string, clientSecret: string, redirectUri: string): string {
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.send'],
    prompt: 'consent', // Force consent to get refresh token
  });
}

export async function exchangeCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<{ refreshToken: string; accessToken: string } | null> {
  try {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.refresh_token) {
      console.error('No refresh token received - user may need to revoke access and re-authorize');
      return null;
    }

    return {
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token || '',
    };
  } catch (error) {
    console.error('Failed to exchange code for tokens:', error);
    return null;
  }
}

export async function verifyGmailConnection(config: GmailConfig): Promise<boolean> {
  try {
    const gmail = createGmailClient(config);
    const response = await gmail.users.getProfile({ userId: 'me' });
    return response.data.emailAddress === config.userEmail;
  } catch (error) {
    console.error('Gmail connection verification failed:', error);
    return false;
  }
}
