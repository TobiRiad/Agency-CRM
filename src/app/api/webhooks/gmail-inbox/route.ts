import { NextRequest, NextResponse } from 'next/server';
import { getServerAdminPB, getAppSetting, setAppSetting, getInboxMessageByGmailId } from '@/lib/pocketbase';
import { getNewMessageIds, getGmailMessage, startGmailWatch, type GmailConfig } from '@/lib/gmail';
import { processIncomingEmail } from '@/lib/inbox-agent';

/**
 * Gmail Pub/Sub Webhook Handler
 * 
 * Google Cloud Pub/Sub sends push notifications here when new emails arrive
 * in the connected Gmail inbox.
 * 
 * The notification contains a base64-encoded JSON with:
 * - emailAddress: the Gmail address
 * - historyId: the new history ID to fetch changes from
 * 
 * Setup:
 * 1. Create a Pub/Sub topic in Google Cloud Console
 * 2. Grant Gmail publish permissions: gmail-api-push@system.gserviceaccount.com
 * 3. Create a push subscription pointing to this endpoint
 * 4. Call /api/gmail/watch to start watching
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Google Pub/Sub wraps the data in a message envelope
    const messageData = body?.message?.data;
    if (!messageData) {
      console.log('Gmail webhook: No message data in payload');
      // Return 200 to acknowledge even if we can't process
      // (Pub/Sub will retry on non-2xx)
      return NextResponse.json({ status: 'no data' });
    }

    // Decode the base64 message
    const decoded = JSON.parse(Buffer.from(messageData, 'base64').toString('utf-8'));
    const { emailAddress, historyId: newHistoryId } = decoded;

    console.log(`Gmail webhook: New notification for ${emailAddress}, historyId: ${newHistoryId}`);

    // Get stored history ID to know where to start fetching from
    const pb = await getServerAdminPB();
    const storedHistoryData = await getAppSetting(pb, 'gmail_history_id');
    const storedHistoryId = (storedHistoryData?.history_id as string) || '';

    if (!storedHistoryId) {
      console.log('Gmail webhook: No stored history ID. Storing current and skipping.');
      await setAppSetting(pb, 'gmail_history_id', { history_id: newHistoryId });
      return NextResponse.json({ status: 'initialized history ID' });
    }

    // Get Gmail config
    const gmailConfig = await getGmailConfigFromSettings(pb, emailAddress);
    if (!gmailConfig) {
      console.error('Gmail webhook: Could not build Gmail config');
      return NextResponse.json({ status: 'gmail not configured' });
    }

    // Fetch new message IDs since last history ID
    const { messageIds, latestHistoryId } = await getNewMessageIds(
      gmailConfig,
      storedHistoryId
    );

    console.log(`Gmail webhook: Found ${messageIds.length} new messages (storedHistoryId: ${storedHistoryId}, newHistoryId: ${newHistoryId}, latestHistoryId: ${latestHistoryId})`);

    // Update stored history ID
    await setAppSetting(pb, 'gmail_history_id', { history_id: latestHistoryId });

    // Process each new message
    let processed = 0;
    let skipped = 0;

    for (const msgId of messageIds) {
      // Check if we've already processed this message
      const existing = await getInboxMessageByGmailId(pb, msgId);
      if (existing) {
        skipped++;
        continue;
      }

      // Fetch the full message
      const message = await getGmailMessage(gmailConfig, msgId);
      if (!message) {
        console.warn(`Gmail webhook: Could not fetch message ${msgId}`);
        continue;
      }

      // Skip emails sent by us (avoid processing our own outbound emails)
      const { extractEmailAddress } = await import('@/lib/gmail');
      const senderEmail = extractEmailAddress(message.from);
      if (senderEmail === emailAddress.toLowerCase()) {
        skipped++;
        continue;
      }

      // Process through the AI agent
      try {
        const result = await processIncomingEmail(pb, message);
        console.log(
          `Gmail webhook: Processed message from ${senderEmail}: ${result.classification} — ${result.actionTaken}`
        );
        processed++;
      } catch (error) {
        console.error(`Gmail webhook: Error processing message ${msgId}:`, error);
      }
    }

    // Auto-renew Gmail watch if it's close to expiring (within 24 hours)
    try {
      const watchData = await getAppSetting(pb, 'gmail_watch_expiry');
      const expiration = (watchData?.expiration as string) || '';
      if (expiration) {
        const expiresAt = parseInt(expiration);
        const oneDayFromNow = Date.now() + 24 * 60 * 60 * 1000;
        if (expiresAt < oneDayFromNow) {
          const topicName = process.env.GOOGLE_PUBSUB_TOPIC;
          if (topicName && gmailConfig) {
            const watchResult = await startGmailWatch(gmailConfig, topicName);
            await setAppSetting(pb, 'gmail_watch_expiry', {
              expiration: watchResult.expiration,
              started_at: new Date().toISOString(),
            });
            console.log('Gmail webhook: Auto-renewed watch (was expiring soon)');
          }
        }
      }
    } catch (renewError) {
      console.error('Gmail webhook: Failed to auto-renew watch:', renewError);
    }

    return NextResponse.json({
      status: 'ok',
      messagesFound: messageIds.length,
      processed,
      skipped,
    });
  } catch (error) {
    console.error('Gmail webhook error:', error);
    // Return 200 anyway to prevent Pub/Sub retries on application errors
    // (we don't want to reprocess the same notification)
    return NextResponse.json({ status: 'error', error: String(error) });
  }
}

// Health check for the webhook
export async function GET() {
  return NextResponse.json({ status: 'Gmail inbox webhook active' });
}

/**
 * Build a GmailConfig from app_settings (same pattern as the email send route)
 */
async function getGmailConfigFromSettings(
  pb: Awaited<ReturnType<typeof getServerAdminPB>>,
  userEmail: string
): Promise<GmailConfig | null> {
  try {
    const tokenData = await getAppSetting(pb, 'gmail_refresh_token');
    const refreshToken = (tokenData?.token as string) || '';

    if (!refreshToken || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return null;
    }

    return {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      refreshToken,
      userEmail,
    };
  } catch {
    return null;
  }
}
