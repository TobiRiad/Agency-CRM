import { NextRequest, NextResponse } from 'next/server';
import { getServerAdminPB, getAppSetting, setAppSetting } from '@/lib/pocketbase';
import { startGmailWatch, stopGmailWatch, type GmailConfig } from '@/lib/gmail';

/**
 * Gmail Watch Management Endpoint
 * 
 * POST: Start watching Gmail inbox via Pub/Sub
 * DELETE: Stop watching Gmail inbox
 * GET: Check current watch status
 * 
 * The watch expires every ~7 days, so it should be renewed periodically.
 * The follow-up cron job also renews the watch if it's about to expire.
 */

// POST: Start or renew Gmail watch
export async function POST(request: NextRequest) {
  try {
    const topicName = process.env.GOOGLE_PUBSUB_TOPIC;
    if (!topicName) {
      return NextResponse.json(
        { success: false, error: 'GOOGLE_PUBSUB_TOPIC environment variable not set' },
        { status: 400 }
      );
    }

    const pb = await getServerAdminPB();
    const gmailConfig = await getGmailConfigFromSettings(pb);

    if (!gmailConfig) {
      return NextResponse.json(
        { success: false, error: 'Gmail not configured. Please connect Gmail in settings first.' },
        { status: 400 }
      );
    }

    // Start/renew the watch
    const result = await startGmailWatch(gmailConfig, topicName);

    // Store the watch expiry and initial history ID
    await setAppSetting(pb, 'gmail_watch_expiry', {
      expiration: result.expiration,
      started_at: new Date().toISOString(),
    });

    // Only set history ID if we don't have one yet
    const existingHistory = await getAppSetting(pb, 'gmail_history_id');
    if (!existingHistory?.history_id) {
      await setAppSetting(pb, 'gmail_history_id', {
        history_id: result.historyId,
      });
    }

    return NextResponse.json({
      success: true,
      historyId: result.historyId,
      expiration: result.expiration,
      expiresAt: new Date(parseInt(result.expiration)).toISOString(),
    });
  } catch (error) {
    console.error('Gmail watch error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to start Gmail watch' },
      { status: 500 }
    );
  }
}

// DELETE: Stop watching
export async function DELETE() {
  try {
    const pb = await getServerAdminPB();
    const gmailConfig = await getGmailConfigFromSettings(pb);

    if (!gmailConfig) {
      return NextResponse.json(
        { success: false, error: 'Gmail not configured' },
        { status: 400 }
      );
    }

    await stopGmailWatch(gmailConfig);

    // Clear the stored watch data
    await setAppSetting(pb, 'gmail_watch_expiry', {
      expiration: '',
      stopped_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, message: 'Gmail watch stopped' });
  } catch (error) {
    console.error('Gmail watch stop error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to stop Gmail watch' },
      { status: 500 }
    );
  }
}

// GET: Check watch status
export async function GET() {
  try {
    const pb = await getServerAdminPB();

    const watchData = await getAppSetting(pb, 'gmail_watch_expiry');
    const historyData = await getAppSetting(pb, 'gmail_history_id');

    const expiration = (watchData?.expiration as string) || '';
    const isActive = expiration ? parseInt(expiration) > Date.now() : false;

    return NextResponse.json({
      success: true,
      isActive,
      expiration: expiration ? new Date(parseInt(expiration)).toISOString() : null,
      startedAt: watchData?.started_at || null,
      historyId: historyData?.history_id || null,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to check watch status' },
      { status: 500 }
    );
  }
}

/**
 * Build a GmailConfig from app_settings
 */
async function getGmailConfigFromSettings(
  pb: Awaited<ReturnType<typeof getServerAdminPB>>
): Promise<GmailConfig | null> {
  try {
    const tokenData = await getAppSetting(pb, 'gmail_refresh_token');
    const refreshToken = (tokenData?.token as string) || '';

    const gmailEmailData = await getAppSetting(pb, 'gmail_email');
    const userEmail = (gmailEmailData?.email as string) || '';

    if (!refreshToken || !userEmail || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
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
