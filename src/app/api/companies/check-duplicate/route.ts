import { NextRequest, NextResponse } from "next/server";
import { getServerAdminPB } from "@/lib/pocketbase";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { name, website, campaignId } = body;

        if (!campaignId) {
            return NextResponse.json(
                { success: false, error: "Campaign ID is required" },
                { status: 400 }
            );
        }

        if (!name && !website) {
            return NextResponse.json(
                { success: false, error: "Name or website is required" },
                { status: 400 }
            );
        }

        const pb = await getServerAdminPB();

        // Get all companies in the campaign
        const companies = await pb.collection("companies").getList(1, 500, {
            filter: pb.filter("campaign = {:campaignId}", { campaignId }),
        });

        // Helper to extract domain from URL
        const extractDomain = (url: string): string => {
            try {
                let cleanUrl = url.trim().toLowerCase();
                if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
                    cleanUrl = "https://" + cleanUrl;
                }
                const urlObj = new URL(cleanUrl);
                return urlObj.hostname.replace(/^www\./, "");
            } catch {
                return url.toLowerCase().replace(/^www\./, "");
            }
        };

        // Check for website match
        if (website) {
            const inputDomain = extractDomain(website);
            for (const company of companies.items) {
                if (company.website) {
                    const existingDomain = extractDomain(company.website);
                    if (existingDomain === inputDomain) {
                        return NextResponse.json({
                            success: true,
                            exists: true,
                            matchType: "website",
                            companyName: company.name,
                            companyId: company.id,
                        });
                    }
                }
            }
        }

        // Check for name match (case-insensitive)
        if (name) {
            const inputName = name.trim().toLowerCase();
            for (const company of companies.items) {
                if (company.name.toLowerCase() === inputName) {
                    return NextResponse.json({
                        success: true,
                        exists: true,
                        matchType: "name",
                        companyName: company.name,
                        companyId: company.id,
                    });
                }
            }
        }

        // No duplicate found
        return NextResponse.json({
            success: true,
            exists: false,
            matchType: null,
        });
    } catch (error) {
        console.error("Duplicate check error:", error);
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}
