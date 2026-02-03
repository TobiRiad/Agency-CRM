import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens } from '@/lib/gmail';
import { getServerAdminPB } from '@/lib/pocketbase';

// Mark as dynamic to prevent static generation (uses searchParams)
export const dynamic = 'force-dynamic';

// GET: Handle OAuth callback and exchange code for tokens
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(
        new URL(`/admin/settings?error=${encodeURIComponent(error)}`, process.env.NEXT_PUBLIC_APP_URL!)
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL('/admin/settings?error=No authorization code received', process.env.NEXT_PUBLIC_APP_URL!)
      );
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/gmail/callback`;

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(
        new URL('/admin/settings?error=Google credentials not configured', process.env.NEXT_PUBLIC_APP_URL!)
      );
    }

    const tokens = await exchangeCodeForTokens(code, clientId, clientSecret, redirectUri);

    if (!tokens) {
      return NextResponse.redirect(
        new URL('/admin/settings?error=Failed to get refresh token', process.env.NEXT_PUBLIC_APP_URL!)
      );
    }

    // Store the refresh token in app_settings
    try {
      const pb = await getServerAdminPB();
      
      // Check if gmail_refresh_token setting already exists
      const existing = await pb.collection('app_settings').getList(1, 1, {
        filter: 'key = "gmail_refresh_token"',
      });

      if (existing.items.length > 0) {
        await pb.collection('app_settings').update(existing.items[0].id, {
          value: { token: tokens.refreshToken },
        });
      } else {
        await pb.collection('app_settings').create({
          key: 'gmail_refresh_token',
          value: { token: tokens.refreshToken },
        });
      }
    } catch (dbError) {
      console.error('Failed to store Gmail token:', dbError);
      return NextResponse.redirect(
        new URL('/admin/settings?error=Failed to store credentials', process.env.NEXT_PUBLIC_APP_URL!)
      );
    }

    return NextResponse.redirect(
      new URL('/admin/settings?success=Gmail connected successfully', process.env.NEXT_PUBLIC_APP_URL!)
    );
  } catch (error) {
    console.error('Gmail callback error:', error);
    return NextResponse.redirect(
      new URL('/admin/settings?error=OAuth callback failed', process.env.NEXT_PUBLIC_APP_URL!)
    );
  }
}
