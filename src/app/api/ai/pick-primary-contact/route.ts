import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface HunterPerson {
  email: string;
  first_name: string;
  last_name: string;
  position: string;
  confidence: number;
  seniority: string;
  department: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { people, scoringPrompt, companyName } = body as {
      people: HunterPerson[];
      scoringPrompt?: string;
      companyName?: string;
    };

    if (!people || people.length === 0) {
      return NextResponse.json(
        { success: false, error: "No people provided" },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { success: false, error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    // If only one person, they're automatically primary
    if (people.length === 1) {
      return NextResponse.json({
        success: true,
        primaryEmail: people[0].email,
        reasoning: "Only one contact found — automatically selected as primary.",
      });
    }

    const systemPrompt = `You are a cold email outreach expert. Your job is to pick the BEST single person to contact at a company for a cold outreach campaign.

You'll receive a list of people found at a company. Pick the one person who is most likely to:
1. Be a decision-maker or have influence over purchasing decisions
2. Be responsive to cold outreach
3. Have a valid, active email (higher confidence is better)

${scoringPrompt ? `The user's targeting criteria:\n${scoringPrompt}\n` : ""}

Prioritization guidelines:
- C-level executives (CEO, CTO, CMO, etc.) are great for small companies but may be too busy at large companies
- VP and Director level are often the sweet spot for outreach
- Managers can be good if they match the target persona
- Prefer higher email confidence scores when all else is equal
- Prefer people whose title/department aligns with the campaign's target persona

Respond in JSON format:
{
  "primary_email": "the email of your top pick",
  "reasoning": "Brief 1-sentence explanation of why you picked this person"
}`;

    const peopleList = people
      .map(
        (p, i) =>
          `${i + 1}. ${p.first_name} ${p.last_name} — ${p.position || "Unknown title"} (${p.department || "Unknown dept"}, ${p.seniority || "unknown"} seniority) — ${p.email} (${p.confidence}% confidence)`
      )
      .join("\n");

    const userMessage = `Company: ${companyName || "Unknown"}\n\nPeople found:\n${peopleList}\n\nPick the best person to contact.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      // Fallback: pick the person with highest seniority/confidence
      const sorted = [...people].sort((a, b) => {
        const seniorityOrder: Record<string, number> = { executive: 5, senior: 4, director: 3, manager: 2, junior: 1 };
        const aScore = (seniorityOrder[a.seniority] || 0) * 100 + a.confidence;
        const bScore = (seniorityOrder[b.seniority] || 0) * 100 + b.confidence;
        return bScore - aScore;
      });
      return NextResponse.json({
        success: true,
        primaryEmail: sorted[0].email,
        reasoning: "AI unavailable — selected based on seniority and email confidence.",
      });
    }

    const result = JSON.parse(content);
    const primaryEmail = result.primary_email;
    const reasoning = result.reasoning || "Selected as the best contact for outreach.";

    // Validate the email is in our list
    const validPick = people.find(
      (p) => p.email.toLowerCase() === primaryEmail?.toLowerCase()
    );

    if (!validPick) {
      // AI picked an invalid email — fall back to first person
      return NextResponse.json({
        success: true,
        primaryEmail: people[0].email,
        reasoning: "AI recommendation could not be validated — defaulting to first contact.",
      });
    }

    return NextResponse.json({
      success: true,
      primaryEmail: validPick.email,
      reasoning,
    });
  } catch (error) {
    console.error("AI pick-primary-contact error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to pick primary contact" },
      { status: 500 }
    );
  }
}
