import { NextRequest, NextResponse } from 'next/server';
import PocketBase from 'pocketbase';
import type { Invite } from '@/types';

export const dynamic = 'force-dynamic';

// GET: Validate an invite token
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { valid: false, error: 'No token provided' },
        { status: 400 }
      );
    }

    const pb = new PocketBase(process.env.POCKETBASE_URL);

    // Find invite by token
    try {
      const invite = await pb.collection('invites').getFirstListItem<Invite>(
        `token = "${token}"`
      );

      // Check if already used
      if (invite.used) {
        return NextResponse.json(
          { valid: false, error: 'This invite has already been used' },
          { status: 400 }
        );
      }

      // Check if expired
      if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
        return NextResponse.json(
          { valid: false, error: 'This invite has expired' },
          { status: 400 }
        );
      }

      return NextResponse.json({
        valid: true,
        email: invite.email,
        inviteId: invite.id,
      });
    } catch {
      return NextResponse.json(
        { valid: false, error: 'Invalid invite token' },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('Invite validation error:', error);
    return NextResponse.json(
      { valid: false, error: 'Failed to validate invite' },
      { status: 500 }
    );
  }
}

// POST: Mark an invite as used
export async function POST(request: NextRequest) {
  try {
    const { token, userId } = await request.json();

    if (!token || !userId) {
      return NextResponse.json(
        { success: false, error: 'Token and userId are required' },
        { status: 400 }
      );
    }

    const pb = new PocketBase(process.env.POCKETBASE_URL);

    // Authenticate as admin to update the invite
    if (process.env.POCKETBASE_ADMIN_EMAIL && process.env.POCKETBASE_ADMIN_PASSWORD) {
      await pb.admins.authWithPassword(
        process.env.POCKETBASE_ADMIN_EMAIL,
        process.env.POCKETBASE_ADMIN_PASSWORD
      );
    }

    // Find and update invite
    const invite = await pb.collection('invites').getFirstListItem<Invite>(
      `token = "${token}"`
    );

    await pb.collection('invites').update(invite.id, {
      used: true,
      used_at: new Date().toISOString(),
      used_by: userId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Invite mark used error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to mark invite as used' },
      { status: 500 }
    );
  }
}
