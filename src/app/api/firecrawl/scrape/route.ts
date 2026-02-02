import { NextRequest, NextResponse } from "next/server";
import { scrapeUrls } from "@/lib/firecrawl";
import type { FirecrawlUrls } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { urls } = body as { urls: FirecrawlUrls };

    if (!urls || Object.keys(urls).length === 0) {
      return NextResponse.json(
        { success: false, error: "Missing urls object" },
        { status: 400 }
      );
    }

    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "Firecrawl API key not configured" },
        { status: 500 }
      );
    }

    const content = await scrapeUrls(urls, apiKey);

    return NextResponse.json({
      success: true,
      content,
    });
  } catch (error) {
    console.error("Firecrawl scrape error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to scrape URLs",
      },
      { status: 500 }
    );
  }
}
