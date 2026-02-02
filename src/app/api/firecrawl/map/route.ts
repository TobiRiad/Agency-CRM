import { NextRequest, NextResponse } from "next/server";
import { mapAndMatchUrls, type MapUrlsResult } from "@/lib/firecrawl";
import type { FirecrawlPageType } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { websiteUrl, pages } = body as {
      websiteUrl: string;
      pages: FirecrawlPageType[];
    };

    if (!websiteUrl) {
      return NextResponse.json(
        { success: false, error: "Missing websiteUrl" },
        { status: 400 }
      );
    }

    if (!pages || pages.length === 0) {
      return NextResponse.json(
        { success: false, error: "Missing pages array" },
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

    const result = await mapAndMatchUrls(websiteUrl, pages, apiKey);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Firecrawl map error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to map website",
      },
      { status: 500 }
    );
  }
}
