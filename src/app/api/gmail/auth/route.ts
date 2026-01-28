import { NextRequest, NextResponse } from 'next/server';
import { getGmailAuthUrl } from '@/lib/gmail';
import { getServerPB } from '@/lib/pocketbase';

// GET: Generate OAuth URL for Gmail authorization
export async function GET(request: NextRequest) {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/gmail/callback`;

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { success: false, error: 'Google OAuth credentials not configured' },
        { status: 500 }
      );
    }

    const authUrl = getGmailAuthUrl(clientId, clientSecret, redirectUri);

    return NextResponse.json({
      success: true,
      authUrl,
    });
  } catch (error) {
    console.error('Gmail auth error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate auth URL' },
      { status: 500 }
    );
  }
}
