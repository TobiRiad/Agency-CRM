import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/resend";
import { sendGmail, GmailConfig } from "@/lib/gmail";
import { getServerPB, createEmailSend } from "@/lib/pocketbase";

type EmailProvider = "resend" | "gmail";

interface EmailProviderSettings {
  provider: EmailProvider;
  gmailEmail?: string;
}

async function getEmailProviderSettings(): Promise<EmailProviderSettings> {
  try {
    const pb = getServerPB();
    const settings = await pb.collection("app_settings").getList(1, 10, {
      filter: 'key = "email_provider" || key = "gmail_email"',
    });

    let provider: EmailProvider = "resend";
    let gmailEmail: string | undefined;

    for (const setting of settings.items) {
      if (setting.key === "email_provider") {
        provider = (setting.value as { provider: EmailProvider })?.provider || "resend";
      }
      if (setting.key === "gmail_email") {
        gmailEmail = (setting.value as { email: string })?.email;
      }
    }

    return { provider, gmailEmail };
  } catch (error) {
    console.error("Failed to get email provider settings:", error);
    return { provider: "resend" };
  }
}

async function getGmailConfig(userEmail: string): Promise<GmailConfig | null> {
  try {
    const pb = getServerPB();
    const tokenSetting = await pb.collection("app_settings").getList(1, 1, {
      filter: 'key = "gmail_refresh_token"',
    });

    if (tokenSetting.items.length === 0) {
      return null;
    }

    const refreshToken = (tokenSetting.items[0].value as { token: string })?.token;
    
    if (!refreshToken || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return null;
    }

    return {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      refreshToken,
      userEmail,
    };
  } catch (error) {
    console.error("Failed to get Gmail config:", error);
    return null;
  }
}

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

    // Get email provider settings
    const { provider, gmailEmail } = await getEmailProviderSettings();
    
    let result: { success: boolean; id?: string; error?: string };

    if (provider === "gmail" && gmailEmail) {
      // Send via Gmail
      const gmailConfig = await getGmailConfig(gmailEmail);
      
      if (!gmailConfig) {
        return NextResponse.json(
          { success: false, error: "Gmail not configured. Please connect your Gmail account in settings." },
          { status: 400 }
        );
      }

      result = await sendGmail(
        {
          to,
          subject,
          html,
          from: from || `${gmailEmail.split("@")[0]} <${gmailEmail}>`,
          replyTo,
        },
        gmailConfig
      );
    } else {
      // Send via Resend (default)
      result = await sendEmail({
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
    }

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
      provider,
    });
  } catch (error) {
    console.error("Email send error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
