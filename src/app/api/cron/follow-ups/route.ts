import { NextRequest, NextResponse } from 'next/server';
import {
  getServerAdminPB,
  getAppSetting,
  setAppSetting,
} from '@/lib/pocketbase';
import { startGmailWatch, type GmailConfig } from '@/lib/gmail';

/**
 * Cron Endpoint — Gmail Watch Renewal
 * 
 * This endpoint should be called periodically (e.g., daily via Vercel Cron,
 * GitHub Actions, or an external cron service).
 * 
 * It renews the Gmail Pub/Sub watch if it's about to expire (within 24 hours).
 * The watch expires every ~7 days.
 * 
 * Follow-ups are sent manually via the /campaigns/[id]/follow-ups UI,
 * not automatically by this cron.
 * 
 * Security: Protect this endpoint with a CRON_SECRET header in production.
 * 
 * Usage:
 *   curl -X POST https://your-app.com/api/cron/follow-ups \
 *     -H "Authorization: Bearer YOUR_CRON_SECRET"
 */

export async function POST(request: NextRequest) {
  // Verify cron secret in production
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const pb = await getServerAdminPB();
  const results = {
    watchRenewed: false,
    errors: [] as string[],
  };

  try {
    // Renew Gmail watch if needed
    const watchData = await getAppSetting(pb, 'gmail_watch_expiry');
    const expiration = (watchData?.expiration as string) || '';

    if (expiration) {
      const expiresAt = parseInt(expiration);
      const oneDayFromNow = Date.now() + 24 * 60 * 60 * 1000;

      // Renew if expires within the next 24 hours
      if (expiresAt < oneDayFromNow) {
        const topicName = process.env.GOOGLE_PUBSUB_TOPIC;
        if (topicName) {
          const gmailConfig = await getGmailConfigFromSettings(pb);
          if (gmailConfig) {
            const watchResult = await startGmailWatch(gmailConfig, topicName);
            await setAppSetting(pb, 'gmail_watch_expiry', {
              expiration: watchResult.expiration,
              started_at: new Date().toISOString(),
            });
            results.watchRenewed = true;
            console.log('Cron: Renewed Gmail watch');
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      ...results,
    });
  } catch (error) {
    console.error('Cron error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Cron job failed' },
      { status: 500 }
    );
  }
}

// GET: Health check
export async function GET() {
  return NextResponse.json({
    status: 'Cron endpoint active (Gmail watch renewal)',
    usage: 'POST to trigger — set CRON_SECRET env var and pass as Bearer token',
  });
}

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
