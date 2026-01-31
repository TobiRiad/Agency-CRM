import { NextRequest, NextResponse } from "next/server";
import { getServerAdminPB } from "@/lib/pocketbase";
import OpenAI from "openai";
import type { Contact, Company, Campaign } from "@/types";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contactId } = body;

    if (!contactId) {
      return NextResponse.json(
        { success: false, error: "Missing contactId" },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { success: false, error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    const pb = await getServerAdminPB();

    // Get the contact with expanded relations
    const contact = await pb.collection("contacts").getOne<Contact>(contactId, {
      expand: "campaign,source_company",
    });

    if (!contact.expand?.campaign) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 }
      );
    }

    const campaign = contact.expand.campaign as Campaign;

    // Check if this is an outreach campaign
    if (campaign.kind !== 'outreach' && campaign.kind !== '') {
      return NextResponse.json(
        { success: false, error: "AI opener is only available for outreach campaigns" },
        { status: 400 }
      );
    }

    // Get AI opener prompt from campaign settings
    const systemPrompt = campaign.ai_opener_prompt || 
      "You are a professional email outreach specialist. Generate a personalized, engaging one-liner opener for cold emails. Make it relevant, specific, and attention-grabbing based on the company and contact information provided.";

    // Get source company AI data if available
    let companyAiData: Record<string, unknown> | null = null;
    if (contact.source_company && contact.expand?.source_company) {
      const sourceCompany = contact.expand.source_company as Company;
      companyAiData = sourceCompany.ai_data || null;
    }

    // Build user message with contact and company context
    let userMessage = `Generate a personalized email opener for this contact:

Contact Name: ${contact.first_name} ${contact.last_name}
Email: ${contact.email}
Title: ${contact.title || "Not provided"}`;

    if (contact.expand?.source_company) {
      const company = contact.expand.source_company as Company;
      userMessage += `\n\nCompany: ${company.name}`;
      if (company.website) userMessage += `\nWebsite: ${company.website}`;
      if (company.industry) userMessage += `\nIndustry: ${company.industry}`;
      if (company.description) userMessage += `\nCompany Description: ${company.description}`;
      
      // Include AI data if available
      if (companyAiData) {
        userMessage += `\n\nAI Analysis Data:\n${JSON.stringify(companyAiData, null, 2)}`;
      }
    }

    userMessage += `\n\nGenerate a compelling, personalized one-liner opener that will grab their attention. Keep it concise (one sentence, max 2 sentences).`;

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: 150,
    });

    const opener = completion.choices[0]?.message?.content?.trim();
    if (!opener) {
      throw new Error("No response from OpenAI");
    }

    // Update contact with AI opener
    await pb.collection("contacts").update(contactId, {
      ai_opener: opener,
    });

    return NextResponse.json({
      success: true,
      opener,
    });
  } catch (error) {
    console.error("AI opener generation error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate opener",
      },
      { status: 500 }
    );
  }
}
