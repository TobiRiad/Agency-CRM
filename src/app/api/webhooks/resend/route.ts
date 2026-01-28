import { NextRequest, NextResponse } from "next/server";
import { getServerPB, getEmailSendByResendId, updateEmailSend, setContactStage, getFunnelStages } from "@/lib/pocketbase";
import type { ResendWebhookEvent } from "@/lib/resend";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const event = body as ResendWebhookEvent;

    console.log("Received Resend webhook:", event.type, event.data?.email_id);

    if (!event.type || !event.data?.email_id) {
      return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
    }

    const pb = getServerPB();
    const emailSend = await getEmailSendByResendId(pb, event.data.email_id);

    if (!emailSend) {
      console.log("Email send record not found for:", event.data.email_id);
      return NextResponse.json({ message: "Email send not found" }, { status: 200 });
    }

    // Update email send status based on event type
    const updateData: Record<string, string> = {};
    
    switch (event.type) {
      case "email.delivered":
        updateData.status = "delivered";
        updateData.delivered_at = event.created_at || new Date().toISOString();
        break;
        
      case "email.opened":
        updateData.status = "opened";
        updateData.opened_at = event.created_at || new Date().toISOString();
        
        // Auto-move contact to "Seen" stage if one exists
        try {
          const stages = await getFunnelStages(pb, emailSend.campaign);
          const seenStage = stages.find(
            s => s.name.toLowerCase().includes("seen") || s.name.toLowerCase().includes("opened")
          );
          if (seenStage) {
            await setContactStage(pb, emailSend.contact, seenStage.id);
          }
        } catch (e) {
          console.error("Failed to update contact stage:", e);
        }
        break;
        
      case "email.clicked":
        updateData.status = "clicked";
        updateData.clicked_at = event.created_at || new Date().toISOString();
        break;
        
      case "email.bounced":
        updateData.status = "bounced";
        updateData.bounced_at = event.created_at || new Date().toISOString();
        if (event.data.bounce?.message) {
          updateData.error_message = event.data.bounce.message;
        }
        break;
        
      case "email.complained":
        updateData.status = "bounced";
        updateData.error_message = "Marked as spam";
        break;
        
      default:
        console.log("Unhandled webhook event type:", event.type);
        return NextResponse.json({ message: "Event type not handled" }, { status: 200 });
    }

    // Update the email send record
    if (Object.keys(updateData).length > 0) {
      await updateEmailSend(pb, emailSend.id, updateData);
      console.log("Updated email send:", emailSend.id, updateData);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Handle webhook verification requests
export async function GET() {
  return NextResponse.json({ status: "Webhook endpoint active" });
}
