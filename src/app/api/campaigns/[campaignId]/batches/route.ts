import { NextRequest, NextResponse } from "next/server";

// Force dynamic rendering - never cache this route
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Use POCKETBASE_URL for server-side, fallback to NEXT_PUBLIC_POCKETBASE_URL
const PB_URL = process.env.POCKETBASE_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL || "http://localhost:8090";

/**
 * GET /api/campaigns/[campaignId]/batches
 * Returns batches for the campaign using admin auth (plain fetch, no SDK).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  try {
    const { campaignId } = await params;
    if (!campaignId) {
      return NextResponse.json({ error: "Missing campaignId" }, { status: 400 });
    }

    const email = process.env.POCKETBASE_ADMIN_EMAIL;
    const password = process.env.POCKETBASE_ADMIN_PASSWORD;
    if (!email || !password) {
      return NextResponse.json(
        { error: "Server missing POCKETBASE_ADMIN_EMAIL / POCKETBASE_ADMIN_PASSWORD" },
        { status: 500 }
      );
    }

    // 1. Admin auth (same as add-batches-collection.js)
    let authRes = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity: email, password }),
    });
    if (!authRes.ok) {
      authRes = await fetch(`${PB_URL}/api/admins/auth-with-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identity: email, password }),
      });
    }
    if (!authRes.ok) {
      const text = await authRes.text();
      console.error("PocketBase admin auth failed:", text);
      return NextResponse.json(
        { error: "PocketBase admin auth failed" },
        { status: 500 }
      );
    }

    const { token } = (await authRes.json()) as { token: string };

    // 2. List all batches (admin bypasses rules), no filter
    // Note: sort by name since created/updated autodate fields may not exist
    const listRes = await fetch(
      `${PB_URL}/api/collections/batches/records?page=1&perPage=500&sort=name`,
      {
        headers: { Authorization: token },
      }
    );
    if (!listRes.ok) {
      const text = await listRes.text();
      console.error("PocketBase batches list failed:", listRes.status, text);
      return NextResponse.json(
        { error: "PocketBase batches list failed" },
        { status: 500 }
      );
    }

    const data = (await listRes.json()) as { items?: Array<{ campaign: string; [k: string]: unknown }> };
    const items = (data.items ?? []).filter((b) => b.campaign === campaignId);

    return NextResponse.json(items, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    console.error("Batches API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load batches" },
      { status: 500 }
    );
  }
}
