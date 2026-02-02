import { NextRequest, NextResponse } from "next/server";
import { getServerAdminPB } from "@/lib/pocketbase";
import OpenAI from "openai";
import type { Contact, Company, Campaign, FirecrawlContent } from "@/types";
import { scrapeUrls, formatContentForAI } from "@/lib/firecrawl";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Cache TTL for scraped content (7 days in ms)
const SCRAPE_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

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

    // Get source company AI data and scraped content if available
    let companyAiData: Record<string, unknown> | null = null;
    let websiteContent: FirecrawlContent | null = null;
    let sourceCompany: Company | null = null;
    
    if (contact.source_company && contact.expand?.source_company) {
      sourceCompany = contact.expand.source_company as Company;
      companyAiData = sourceCompany.ai_data || null;
      
      // Check for cached scraped content
      if (sourceCompany.firecrawl_content && sourceCompany.firecrawl_scraped_at) {
        const scrapedAt = new Date(sourceCompany.firecrawl_scraped_at).getTime();
        const now = Date.now();
        if (now - scrapedAt < SCRAPE_CACHE_TTL) {
          websiteContent = sourceCompany.firecrawl_content;
        }
      }
      
      // If no cached content but we have URLs, try to scrape
      if (!websiteContent && sourceCompany.firecrawl_urls && process.env.FIRECRAWL_API_KEY) {
        try {
          websiteContent = await scrapeUrls(sourceCompany.firecrawl_urls, process.env.FIRECRAWL_API_KEY);
          // Cache the scraped content on the source company
          await pb.collection("companies").update(sourceCompany.id, {
            firecrawl_content: websiteContent,
            firecrawl_scraped_at: new Date().toISOString(),
          });
        } catch (scrapeError) {
          console.error("Failed to scrape website content for opener:", scrapeError);
        }
      }
    }

    // Build user message with contact and company context
    let userMessage = `Generate a personalized email opener for this contact:

Contact Name: ${contact.first_name} ${contact.last_name}
Email: ${contact.email}
Title: ${contact.title || "Not provided"}`;

    if (sourceCompany) {
      userMessage += `\n\nCompany: ${sourceCompany.name}`;
      if (sourceCompany.website) userMessage += `\nWebsite: ${sourceCompany.website}`;
      if (sourceCompany.industry) userMessage += `\nIndustry: ${sourceCompany.industry}`;
      if (sourceCompany.description) userMessage += `\nCompany Description: ${sourceCompany.description}`;
      
      // Include AI scoring data if available
      if (companyAiData) {
        userMessage += `\n\nAI Analysis Data:\n${JSON.stringify(companyAiData, null, 2)}`;
      }
      
      // Include scraped website content if available
      if (websiteContent && Object.keys(websiteContent).length > 0) {
        const formattedContent = formatContentForAI(websiteContent);
        if (formattedContent) {
          userMessage += `\n\n## Website Content (Scraped)\n\n${formattedContent}`;
        }
      }
    }

    userMessage += `\n\nGenerate a compelling, personalized one-liner opener that will grab their attention. Keep it concise (one sentence, max 2 sentences). Use specific details from the company information and website content to make it highly personalized.`;

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
