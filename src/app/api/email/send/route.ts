import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/resend";
import { getServerPB, createEmailSend } from "@/lib/pocketbase";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contactId, templateId, campaignId, to, subject, html, from, replyTo } = body;

    if (!contactId || !templateId || !campaignId || !to || !subject || !html) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Send email via Resend
    const result = await sendEmail({
      to,
      subject,
      html,
      from: from || "CRM <noreply@yourdomain.com>",
      replyTo,
      tags: [
        { name: "campaign_id", value: campaignId },
        { name: "contact_id", value: contactId },
        { name: "template_id", value: templateId },
      ],
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to send email" },
        { status: 500 }
      );
    }

    // Record the email send in PocketBase
    try {
      const pb = getServerPB();
      await createEmailSend(pb, {
        contact: contactId,
        template: templateId,
        campaign: campaignId,
        resend_id: result.id || "",
        status: "sent",
        sent_at: new Date().toISOString(),
      });
    } catch (dbError) {
      console.error("Failed to record email send:", dbError);
      // Don't fail the request if DB recording fails
    }

    return NextResponse.json({
      success: true,
      id: result.id,
    });
  } catch (error) {
    console.error("Email send error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
