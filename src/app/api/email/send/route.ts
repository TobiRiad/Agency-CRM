import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/resend";
import { sendGmail, GmailConfig } from "@/lib/gmail";
import { getServerAdminPB, getServerPB, createEmailSend } from "@/lib/pocketbase";
import { getUnsubscribeUrl } from "@/app/api/unsubscribe/route";

type EmailProvider = "resend" | "gmail";

interface EmailProviderSettings {
  provider: EmailProvider;
  gmailEmail?: string;
  senderName?: string;
}

async function getEmailProviderSettings(): Promise<EmailProviderSettings> {
  try {
    // Use admin PB so we can read app_settings on the server
    const pb = await getServerAdminPB();
    const settings = await pb.collection("app_settings").getList(1, 10, {
      filter: 'key = "email_provider" || key = "gmail_email" || key = "sender_name"',
    });

    let provider: EmailProvider = "resend";
    let gmailEmail: string | undefined;
    let senderName: string | undefined;

    for (const setting of settings.items) {
      if (setting.key === "email_provider") {
        provider = (setting.value as { provider: EmailProvider })?.provider || "resend";
      }
      if (setting.key === "gmail_email") {
        gmailEmail = (setting.value as { email: string })?.email;
      }
      if (setting.key === "sender_name") {
        senderName = (setting.value as { name: string })?.name;
      }
    }

    return { provider, gmailEmail, senderName };
  } catch (error) {
    console.error("Failed to get email provider settings:", error);
    return { provider: "resend" };
  }
}

async function getGmailConfig(userEmail: string): Promise<GmailConfig | null> {
  try {
    // Use admin PB so we can read gmail_refresh_token on the server
    const pb = await getServerAdminPB();
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
    const {
      contactId,
      templateId,
      campaignId,
      to,
      subject,
      html,
      from,
      replyTo,
      // Threading params (optional — for follow-ups in the same thread)
      threadId,
      inReplyTo,
      references,
      isFollowUp,
    } = body;

    if (!contactId || !templateId || !campaignId || !to || !subject || !html) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get email provider settings
    const { provider, gmailEmail, senderName } = await getEmailProviderSettings();

    // Generate unsubscribe URL and inject footer into HTML
    const unsubscribeUrl = getUnsubscribeUrl(contactId);
    const unsubscribeFooter = `<div style="margin-top:20px;padding-top:10px;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center;"><a href="${unsubscribeUrl}" style="color:#999;text-decoration:underline;">Unsubscribe</a></div>`;
    const htmlWithUnsub = html + unsubscribeFooter;
    
    let result: { success: boolean; id?: string; threadId?: string; error?: string };

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
          html: htmlWithUnsub,
          from:
            from ||
            `${(senderName || gmailEmail.split("@")[0]).trim()} <${gmailEmail}>`,
          // For Gmail/Workspace we don't set Reply-To by default.
          // Replies will naturally go back to the sending mailbox.
          replyTo: replyTo || undefined,
          // Threading support
          threadId: threadId || undefined,
          inReplyTo: inReplyTo || undefined,
          references: references || undefined,
          // Unsubscribe header (Gmail shows native unsubscribe button)
          listUnsubscribeUrl: unsubscribeUrl,
        },
        gmailConfig
      );
    } else {
      // Send via Resend (default)
      result = await sendEmail({
        to,
        subject,
        html: htmlWithUnsub,
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

    // Generate a Message-ID for tracking (Gmail returns its own, but we need one for Resend too)
    const domain = (gmailEmail || 'crm.local').split('@')[1] || 'crm.local';
    const generatedMessageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@${domain}>`;

    // Record the email send in PocketBase (now with threading fields)
    try {
      // Use admin PB because email_sends rules require auth and this is a server route.
      const pb = await getServerAdminPB();
      await createEmailSend(pb, {
        contact: contactId,
        template: templateId,
        campaign: campaignId,
        resend_id: result.id || "",
        status: "sent",
        sent_at: new Date().toISOString(),
      });

      // Update the email send with threading data (createEmailSend doesn't support these yet)
      // Find the record we just created and update it
      if (result.id) {
        const sends = await pb.collection("email_sends").getList(1, 1, {
          filter: `resend_id = "${result.id}"`,
          sort: "-created",
        });
        if (sends.items.length > 0) {
          await pb.collection("email_sends").update(sends.items[0].id, {
            message_id: generatedMessageId,
            thread_id: result.threadId || threadId || "",
            in_reply_to: inReplyTo || "",
            is_follow_up: isFollowUp || false,
          });
        }
      }
    } catch (dbError) {
      console.error("Failed to record email send:", dbError);
      // Don't fail the request if DB recording fails
    }

    return NextResponse.json({
      success: true,
      id: result.id,
      threadId: result.threadId,
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
