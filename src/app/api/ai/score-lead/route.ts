import { NextRequest, NextResponse } from "next/server";
import { getServerAdminPB } from "@/lib/pocketbase";
import OpenAI from "openai";
import type { Company, AIScoringConfig, Campaign, FirecrawlContent } from "@/types";
import { scrapeUrls, formatContentForAI } from "@/lib/firecrawl";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Cache TTL for scraped content (7 days in ms)
const SCRAPE_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, configId } = body;

    if (!companyId || !configId) {
      return NextResponse.json(
        { success: false, error: "Missing companyId or configId" },
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

    // Get the company, AI config, and campaign
    const [company, config] = await Promise.all([
      pb.collection("companies").getOne<Company>(companyId, {
        expand: "campaign",
      }),
      pb.collection("ai_scoring_configs").getOne<AIScoringConfig>(configId),
    ]);

    const campaign = company.expand?.campaign as Campaign | undefined;

    // Check if we should scrape website content
    let websiteContent: FirecrawlContent | null = null;
    let needsScrape = false;

    if (campaign?.enable_firecrawl && company.firecrawl_urls) {
      // Check if we have cached content that's still fresh
      if (company.firecrawl_content && company.firecrawl_scraped_at) {
        const scrapedAt = new Date(company.firecrawl_scraped_at).getTime();
        const now = Date.now();
        if (now - scrapedAt < SCRAPE_CACHE_TTL) {
          // Use cached content
          websiteContent = company.firecrawl_content;
        } else {
          needsScrape = true;
        }
      } else {
        needsScrape = true;
      }

      // Scrape if needed
      if (needsScrape && process.env.FIRECRAWL_API_KEY) {
        try {
          websiteContent = await scrapeUrls(company.firecrawl_urls, process.env.FIRECRAWL_API_KEY);
          // Cache the scraped content
          await pb.collection("companies").update(companyId, {
            firecrawl_content: websiteContent,
            firecrawl_scraped_at: new Date().toISOString(),
          });
        } catch (scrapeError) {
          console.error("Failed to scrape website content:", scrapeError);
          // Continue without scraped content
        }
      }
    }

    // Build the prompt with company data
    const companyData = {
      name: company.name,
      website: company.website || "",
      email: company.email || "",
      description: company.description || "",
      industry: company.industry || "",
    };

    // Build user message with company context
    let userMessage = `Evaluate this company:

Company Name: ${companyData.name}
Website: ${companyData.website || "Not provided"}
Email: ${companyData.email || "Not provided"}
Industry: ${companyData.industry || "Not provided"}`;

    // Include company description if available
    if (companyData.description) {
      userMessage += `\n\nCompany Description:\n${companyData.description}`;
    }

    // Include scraped website content if available
    if (websiteContent && Object.keys(websiteContent).length > 0) {
      const formattedContent = formatContentForAI(websiteContent);
      if (formattedContent) {
        userMessage += `\n\n## Website Content (Scraped)\n\n${formattedContent}`;
      }
    }

    userMessage += `\n\nBased on the criteria provided, evaluate this company and return a JSON response.`;

    // Build the system prompt with scoring instructions
    let systemPrompt = config.system_prompt;
    
    const outputInstructions: string[] = [];
    
    if (config.enable_score) {
      const min = config.score_min || 0;
      const max = config.score_max || 100;
      outputInstructions.push(
        `- "score": A number between ${min} and ${max} representing the quality/fit score`
      );
    }
    
    if (config.enable_classification) {
      const label = config.classification_label || "category";
      const options = config.classification_options || [];
      outputInstructions.push(
        `- "${label}": One of the following options: ${options.join(", ")}`
      );
    }
    
    // Add custom output fields
    if (config.custom_outputs && config.custom_outputs.length > 0) {
      for (const customField of config.custom_outputs) {
        let fieldInstruction = `- "${customField.name}": `;
        
        switch (customField.type) {
          case 'text':
            fieldInstruction += `A text string. ${customField.description}`;
            break;
          case 'number':
            fieldInstruction += `A number. ${customField.description}`;
            break;
          case 'boolean':
            const boolOptions = customField.boolean_options || ['true', 'false', 'unknown'];
            fieldInstruction += `One of: ${boolOptions.join(", ")}. ${customField.description}`;
            break;
          case 'list':
            const listOptions = customField.list_options || [];
            const listDesc = customField.list_description || "Select the most appropriate option";
            fieldInstruction += `One of: ${listOptions.join(", ")}. ${listDesc}. ${customField.description}`;
            break;
          case 'nested_json':
            const maxPairs = customField.nested_json_max_pairs || 10;
            const jsonDesc = customField.nested_json_description || "Key-value pairs";
            fieldInstruction += `A JSON object with up to ${maxPairs} key-value pairs. ${jsonDesc}. ${customField.description}`;
            break;
        }
        
        outputInstructions.push(fieldInstruction);
      }
    }
    
    outputInstructions.push(
      `- "confidence": A number between 0 and 1 representing confidence in the evaluation`,
      `- "reasons": An array of strings explaining the score/classification`
    );

    systemPrompt += `\n\nReturn your evaluation as a JSON object with the following structure:
{
  ${outputInstructions.join(",\n  ")}
}`;

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: config.model || "gpt-4o-mini",
      temperature: config.temperature || 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      throw new Error("No response from OpenAI");
    }

    const aiResult = JSON.parse(responseText);

    // Store full AI response
    const fullAiData = { ...aiResult };

    // Update company with AI results
    const updateData: Partial<Company & Record<string, unknown>> = {
      ai_scored_at: new Date().toISOString(),
      ai_config_version: configId,
      ai_data: fullAiData, // Store full response
    };

    if (config.enable_score && typeof aiResult.score === "number") {
      updateData.ai_score = Math.max(
        config.score_min || 0,
        Math.min(config.score_max || 100, aiResult.score)
      );
    }

    if (config.enable_classification && aiResult[config.classification_label || "category"]) {
      updateData.ai_classification = aiResult[config.classification_label || "category"];
    }

    if (typeof aiResult.confidence === "number") {
      updateData.ai_confidence = Math.max(0, Math.min(1, aiResult.confidence));
    }

    if (Array.isArray(aiResult.reasons)) {
      updateData.ai_reasons = aiResult.reasons;
    }

    // Store custom output fields as separate fields (ai_custom_*)
    if (config.custom_outputs && config.custom_outputs.length > 0) {
      for (const customField of config.custom_outputs) {
        const fieldName = `ai_custom_${customField.name}`;
        if (aiResult[customField.name] !== undefined) {
          updateData[fieldName] = aiResult[customField.name];
        }
      }
    }

    await pb.collection("companies").update(companyId, updateData);

    // Build result with custom outputs
    const result: Record<string, unknown> = {
      score: updateData.ai_score,
      classification: updateData.ai_classification,
      confidence: updateData.ai_confidence,
      reasons: updateData.ai_reasons,
    };

    // Include custom outputs in result
    if (config.custom_outputs && config.custom_outputs.length > 0) {
      for (const customField of config.custom_outputs) {
        if (aiResult[customField.name] !== undefined) {
          result[customField.name] = aiResult[customField.name];
        }
      }
    }

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("AI scoring error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to score lead",
      },
      { status: 500 }
    );
  }
}
