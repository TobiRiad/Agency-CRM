import { NextRequest, NextResponse } from "next/server";
import { getServerAdminPB } from "@/lib/pocketbase";
import crypto from "crypto";

const UNSUBSCRIBE_SECRET = process.env.OPENAI_API_KEY || "crm-unsubscribe-fallback-secret";

/**
 * Generate an HMAC token for a contact ID to prevent unauthorized unsubscribes.
 */
export function generateUnsubToken(contactId: string): string {
  return crypto
    .createHmac("sha256", UNSUBSCRIBE_SECRET)
    .update(contactId)
    .digest("hex")
    .slice(0, 32); // Short enough for a URL, long enough to be secure
}

function verifyUnsubToken(contactId: string, token: string): boolean {
  const expected = generateUnsubToken(contactId);
  return crypto.timingSafeEqual(
    Buffer.from(token, "utf8"),
    Buffer.from(expected, "utf8")
  );
}

/**
 * Build the full unsubscribe URL for a contact.
 */
export function getUnsubscribeUrl(contactId: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const token = generateUnsubToken(contactId);
  return `${baseUrl}/api/unsubscribe?contactId=${contactId}&token=${token}`;
}

/**
 * GET /api/unsubscribe?contactId=xxx&token=xxx
 * 
 * Marks a contact as unsubscribed and shows a confirmation page.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const contactId = searchParams.get("contactId");
  const token = searchParams.get("token");

  if (!contactId || !token) {
    return new NextResponse(renderPage("Invalid Link", "This unsubscribe link is invalid or has expired."), {
      status: 400,
      headers: { "Content-Type": "text/html" },
    });
  }

  // Verify token
  try {
    if (!verifyUnsubToken(contactId, token)) {
      return new NextResponse(renderPage("Invalid Link", "This unsubscribe link is invalid or has expired."), {
        status: 403,
        headers: { "Content-Type": "text/html" },
      });
    }
  } catch {
    return new NextResponse(renderPage("Invalid Link", "This unsubscribe link is invalid or has expired."), {
      status: 403,
      headers: { "Content-Type": "text/html" },
    });
  }

  try {
    const pb = await getServerAdminPB();

    // Check if contact exists
    const contact = await pb.collection("contacts").getOne(contactId);
    
    if (contact.unsubscribed) {
      return new NextResponse(
        renderPage("Already Unsubscribed", "You have already been unsubscribed. You will not receive any further emails from us."),
        { status: 200, headers: { "Content-Type": "text/html" } }
      );
    }

    // Mark as unsubscribed and cancel follow-ups
    await pb.collection("contacts").update(contactId, {
      unsubscribed: true,
      follow_up_cancelled: true,
      follow_up_date: "",
    });

    console.log(`Unsubscribe: Contact ${contactId} (${contact.email}) unsubscribed`);

    return new NextResponse(
      renderPage(
        "Unsubscribed Successfully",
        "You have been successfully unsubscribed. You will not receive any further emails from us."
      ),
      { status: 200, headers: { "Content-Type": "text/html" } }
    );
  } catch (error) {
    console.error("Unsubscribe error:", error);
    return new NextResponse(
      renderPage("Something Went Wrong", "We couldn't process your unsubscribe request. Please try again later."),
      { status: 500, headers: { "Content-Type": "text/html" } }
    );
  }
}

/**
 * POST /api/unsubscribe (for List-Unsubscribe-Post one-click unsubscribe)
 */
export async function POST(request: NextRequest) {
  // One-click unsubscribe sends the data as form-urlencoded
  const contentType = request.headers.get("content-type") || "";
  let contactId: string | null = null;
  let token: string | null = null;

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const body = await request.text();
    const params = new URLSearchParams(body);
    contactId = params.get("contactId");
    token = params.get("token");
  } else {
    const { searchParams } = new URL(request.url);
    contactId = searchParams.get("contactId");
    token = searchParams.get("token");
  }

  if (!contactId || !token) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  try {
    if (!verifyUnsubToken(contactId, token)) {
      return NextResponse.json({ error: "Invalid token" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 });
  }

  try {
    const pb = await getServerAdminPB();
    await pb.collection("contacts").update(contactId, {
      unsubscribed: true,
      follow_up_cancelled: true,
      follow_up_date: "",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unsubscribe POST error:", error);
    return NextResponse.json({ error: "Failed to unsubscribe" }, { status: 500 });
  }
}

function renderPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f9fafb;
      color: #111827;
      padding: 20px;
    }
    .card {
      background: white;
      border-radius: 12px;
      padding: 48px;
      max-width: 480px;
      width: 100%;
      text-align: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 24px; font-weight: 600; margin-bottom: 12px; }
    p { font-size: 16px; color: #6b7280; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${title.includes("Successfully") || title.includes("Already") ? "&#10003;" : "&#9888;"}</div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}
