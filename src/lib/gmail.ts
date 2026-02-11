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
  // Threading support
  threadId?: string; // Gmail thread ID to send in the same thread
  inReplyTo?: string; // Message-ID of the email we're replying to
  references?: string; // Space-separated list of Message-IDs in the thread
  // Unsubscribe support
  listUnsubscribeUrl?: string; // URL for List-Unsubscribe header (Gmail shows native unsub button)
}

export interface SendGmailResult {
  success: boolean;
  id?: string;
  threadId?: string; // Gmail thread ID from the response
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
  
  // Generate a Message-ID for this email
  const domain = fromEmail.split('@')[1] || 'crm.local';
  const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@${domain}>`;
  
  const emailLines = [
    `From: ${params.from || fromEmail}`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    `Message-ID: ${messageId}`,
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

  // Insert optional headers before MIME-Version line
  const mimeLineIndex = emailLines.indexOf('MIME-Version: 1.0');

  if (params.replyTo) {
    emailLines.splice(mimeLineIndex, 0, `Reply-To: ${params.replyTo}`);
  }

  // Threading headers for follow-ups
  if (params.inReplyTo) {
    const insertAt = emailLines.indexOf('MIME-Version: 1.0');
    emailLines.splice(insertAt, 0, `In-Reply-To: ${params.inReplyTo}`);
  }
  if (params.references) {
    const insertAt = emailLines.indexOf('MIME-Version: 1.0');
    emailLines.splice(insertAt, 0, `References: ${params.references}`);
  }

  // List-Unsubscribe headers (Gmail/Outlook show native unsubscribe button)
  if (params.listUnsubscribeUrl) {
    const insertAt = emailLines.indexOf('MIME-Version: 1.0');
    emailLines.splice(insertAt, 0, `List-Unsubscribe: <${params.listUnsubscribeUrl}>`);
    emailLines.splice(insertAt + 1, 0, `List-Unsubscribe-Post: List-Unsubscribe=One-Click`);
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

    const requestBody: { raw: string; threadId?: string } = { raw };
    
    // If we're replying in the same thread, set the threadId
    if (params.threadId) {
      requestBody.threadId = params.threadId;
    }

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody,
    });

    return {
      success: true,
      id: response.data.id || undefined,
      threadId: response.data.threadId || undefined,
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
    scope: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly', // Read incoming emails
    ],
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

// ==========================================
// Gmail Pub/Sub Watch & Inbox Reading
// ==========================================

export interface GmailWatchResult {
  historyId: string;
  expiration: string; // Unix timestamp in ms
}

/**
 * Start watching the Gmail inbox for new messages via Pub/Sub.
 * The topic must be created in Google Cloud Console and Gmail API must have
 * publish permissions on it.
 */
export async function startGmailWatch(
  config: GmailConfig,
  topicName: string
): Promise<GmailWatchResult> {
  const gmail = createGmailClient(config);

  const response = await gmail.users.watch({
    userId: 'me',
    requestBody: {
      topicName,
      labelIds: ['INBOX'],
    },
  });

  return {
    historyId: response.data.historyId || '',
    expiration: response.data.expiration || '',
  };
}

/**
 * Stop watching the Gmail inbox.
 */
export async function stopGmailWatch(config: GmailConfig): Promise<void> {
  const gmail = createGmailClient(config);
  await gmail.users.stop({ userId: 'me' });
}

export interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  bodyText: string;
  bodyHtml: string;
  messageIdHeader: string; // The Message-ID header value
  inReplyTo: string; // The In-Reply-To header value
  references: string; // The References header value
}

/**
 * Get new messages since a given historyId.
 * Returns the message IDs of new messages and the latest historyId.
 */
export async function getNewMessageIds(
  config: GmailConfig,
  startHistoryId: string
): Promise<{ messageIds: string[]; latestHistoryId: string }> {
  const gmail = createGmailClient(config);

  try {
    // Fetch history with both messageAdded and messagesAdded events
    // Don't filter by labelId as it can be too restrictive
    const response = await gmail.users.history.list({
      userId: 'me',
      startHistoryId,
    });

    const messageIds: string[] = [];
    const histories = response.data.history || [];

    for (const history of histories) {
      // Check messagesAdded (new messages arriving)
      const addedMessages = history.messagesAdded || [];
      for (const added of addedMessages) {
        if (added.message?.id) {
          messageIds.push(added.message.id);
        }
      }
      // Also check messages array directly (some history events use this)
      if (history.messages) {
        for (const msg of history.messages) {
          if (msg.id) {
            messageIds.push(msg.id);
          }
        }
      }
    }

    const deduplicated = Array.from(new Set(messageIds));
    console.log(`Gmail history: ${histories.length} history records, ${deduplicated.length} unique messages since historyId ${startHistoryId}`);

    return {
      messageIds: deduplicated,
      latestHistoryId: response.data.historyId || startHistoryId,
    };
  } catch (error: unknown) {
    // If historyId is too old, Gmail returns 404. We should handle this gracefully.
    const err = error as { code?: number };
    if (err.code === 404) {
      console.warn('Gmail history ID expired, need to do a full sync');
      // On 404, fetch recent messages directly as a fallback
      try {
        const messages = await gmail.users.messages.list({
          userId: 'me',
          maxResults: 10,
          labelIds: ['INBOX'],
          q: 'is:unread newer_than:1h',
        });
        const recentIds = (messages.data.messages || [])
          .map(m => m.id)
          .filter((id): id is string => !!id);
        // Get the current historyId from profile
        const profile = await gmail.users.getProfile({ userId: 'me' });
        const currentHistoryId = profile.data.historyId || startHistoryId;
        console.log(`Gmail history fallback: found ${recentIds.length} recent unread messages`);
        return { messageIds: recentIds, latestHistoryId: currentHistoryId };
      } catch {
        return { messageIds: [], latestHistoryId: startHistoryId };
      }
    }
    throw error;
  }
}

/**
 * Fetch a full Gmail message by its ID and parse out the useful fields.
 */
export async function getGmailMessage(
  config: GmailConfig,
  messageId: string
): Promise<GmailMessage | null> {
  const gmail = createGmailClient(config);

  try {
    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    const message = response.data;
    const headers = message.payload?.headers || [];

    const getHeader = (name: string): string => {
      const header = headers.find(h => h.name?.toLowerCase() === name.toLowerCase());
      return header?.value || '';
    };

    // Extract plain text body from the message parts
    let bodyText = '';
    let bodyHtml = '';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extractParts = (payload: any): void => {
      if (!payload) return;

      if (payload.mimeType === 'text/plain' && payload.body?.data) {
        bodyText = Buffer.from(payload.body.data, 'base64').toString('utf-8');
      }
      if (payload.mimeType === 'text/html' && payload.body?.data) {
        bodyHtml = Buffer.from(payload.body.data, 'base64').toString('utf-8');
      }

      if (payload.parts) {
        for (const part of payload.parts) {
          extractParts(part);
        }
      }
    };

    extractParts(message.payload);

    // If no plain text, strip HTML tags as a fallback
    if (!bodyText && bodyHtml) {
      bodyText = bodyHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    return {
      id: message.id || messageId,
      threadId: message.threadId || '',
      from: getHeader('From'),
      to: getHeader('To'),
      subject: getHeader('Subject'),
      date: getHeader('Date'),
      bodyText,
      bodyHtml,
      messageIdHeader: getHeader('Message-ID'),
      inReplyTo: getHeader('In-Reply-To'),
      references: getHeader('References'),
    };
  } catch (error) {
    console.error(`Failed to fetch Gmail message ${messageId}:`, error);
    return null;
  }
}

/**
 * Extract just the email address from a "Name <email>" formatted string.
 */
export function extractEmailAddress(fromHeader: string): string {
  const match = fromHeader.match(/<([^>]+)>/);
  return match ? match[1].toLowerCase() : fromHeader.toLowerCase().trim();
}
