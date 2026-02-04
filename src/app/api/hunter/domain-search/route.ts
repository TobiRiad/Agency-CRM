import { NextRequest, NextResponse } from "next/server";

interface HunterEmail {
    value: string;
    type: string;
    confidence: number;
    first_name: string;
    last_name: string;
    position: string;
    seniority: string;
    department: string;
}

interface HunterResponse {
    data: {
        domain: string;
        emails: HunterEmail[];
    };
    meta: {
        results: number;
    };
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { domain } = body;

        if (!domain) {
            return NextResponse.json(
                { success: false, error: "Domain is required" },
                { status: 400 }
            );
        }

        const apiKey = process.env.HUNTER_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { success: false, error: "Hunter.io API key not configured" },
                { status: 500 }
            );
        }

        // Extract domain from URL if full URL was provided
        let cleanDomain = domain;
        try {
            if (domain.includes("://")) {
                cleanDomain = new URL(domain).hostname;
            } else if (domain.includes("/")) {
                cleanDomain = domain.split("/")[0];
            }
            // Remove www. prefix if present
            cleanDomain = cleanDomain.replace(/^www\./, "");
        } catch {
            // If parsing fails, use as-is
            cleanDomain = domain;
        }

        const hunterUrl = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(
            cleanDomain
        )}&api_key=${apiKey}&limit=20`;

        const response = await fetch(hunterUrl);
        const data: HunterResponse = await response.json();

        if (!response.ok) {
            return NextResponse.json(
                { success: false, error: "Hunter.io API error", details: data },
                { status: response.status }
            );
        }

        // Transform to simpler format
        const people = (data.data?.emails || []).map((email) => ({
            email: email.value,
            first_name: email.first_name || "",
            last_name: email.last_name || "",
            position: email.position || "",
            confidence: email.confidence,
            seniority: email.seniority,
            department: email.department,
        }));

        return NextResponse.json({
            success: true,
            domain: cleanDomain,
            people,
            total: data.meta?.results || people.length,
        });
    } catch (error) {
        console.error("Hunter.io search error:", error);
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}
