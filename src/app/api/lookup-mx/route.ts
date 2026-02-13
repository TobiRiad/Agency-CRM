import { NextRequest, NextResponse } from "next/server";
import dns from "dns";
import { promisify } from "util";
import OpenAI from "openai";

const resolveMx = promisify(dns.resolveMx);

/**
 * Known email provider patterns (MX hostname → provider name).
 * Checked in order — first match wins.
 */
const KNOWN_PROVIDERS: { pattern: RegExp; name: string }[] = [
  // Google
  { pattern: /google\.com$/i, name: "Google Workspace" },
  { pattern: /googlemail\.com$/i, name: "Google Workspace" },
  // Microsoft
  { pattern: /outlook\.com$/i, name: "Microsoft 365" },
  { pattern: /protection\.outlook\.com$/i, name: "Microsoft 365" },
  { pattern: /microsoft\.com$/i, name: "Microsoft 365" },
  // Namecheap Private Email
  { pattern: /privateemail\.com$/i, name: "Namecheap Private Email" },
  // Zoho
  { pattern: /zoho\.com$/i, name: "Zoho Mail" },
  { pattern: /zoho\.eu$/i, name: "Zoho Mail" },
  // ProtonMail
  { pattern: /protonmail\.ch$/i, name: "ProtonMail" },
  { pattern: /proton\.me$/i, name: "ProtonMail" },
  // Fastmail
  { pattern: /fastmail\.com$/i, name: "Fastmail" },
  { pattern: /messagingengine\.com$/i, name: "Fastmail" },
  // Yahoo / AT&T
  { pattern: /yahoodns\.net$/i, name: "Yahoo Mail" },
  { pattern: /yahoo\.com$/i, name: "Yahoo Mail" },
  // Mimecast (security gateway, not final provider)
  { pattern: /mimecast\.com$/i, name: "Mimecast" },
  // Barracuda
  { pattern: /barracudanetworks\.com$/i, name: "Barracuda" },
  // Rackspace
  { pattern: /emailsrvr\.com$/i, name: "Rackspace Email" },
  // GoDaddy
  { pattern: /secureserver\.net$/i, name: "GoDaddy Email" },
  // OVH
  { pattern: /ovh\.net$/i, name: "OVH Mail" },
  // Hostinger
  { pattern: /hostinger\.com$/i, name: "Hostinger Email" },
  // Titan (used by many domain registrars)
  { pattern: /titan\.email$/i, name: "Titan Email" },
  // ImprovMX
  { pattern: /improvmx\.com$/i, name: "ImprovMX" },
  // Migadu
  { pattern: /migadu\.com$/i, name: "Migadu" },
  // Yandex
  { pattern: /yandex\.(net|ru|com)$/i, name: "Yandex Mail" },
  // Mail.ru
  { pattern: /mail\.ru$/i, name: "Mail.ru" },
  // iCloud
  { pattern: /icloud\.com$/i, name: "iCloud Mail" },
  // Amazon SES / WorkMail
  { pattern: /amazonaws\.com$/i, name: "Amazon SES" },
  { pattern: /awsapps\.com$/i, name: "Amazon WorkMail" },
  // Cloudflare
  { pattern: /cloudflare\.net$/i, name: "Cloudflare Email" },
];

function extractDomain(urlOrDomain: string): string {
  let domain = urlOrDomain.trim();
  // Strip protocol
  domain = domain.replace(/^https?:\/\//, "");
  // Strip path, query, fragment
  domain = domain.split("/")[0].split("?")[0].split("#")[0];
  // Strip www.
  domain = domain.replace(/^www\./, "");
  return domain.toLowerCase();
}

function identifyProvider(mxRecords: dns.MxRecord[]): string | null {
  // Sort by priority (lowest = highest priority)
  const sorted = mxRecords.sort((a, b) => a.priority - b.priority);

  for (const mx of sorted) {
    const exchange = mx.exchange.toLowerCase().replace(/\.$/, "");
    for (const { pattern, name } of KNOWN_PROVIDERS) {
      if (pattern.test(exchange)) {
        return name;
      }
    }
  }

  return null;
}

async function identifyWithAI(domain: string, mxRecords: dns.MxRecord[]): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return "Unknown";
  }

  try {
    const openai = new OpenAI({ apiKey });
    const mxList = mxRecords
      .sort((a, b) => a.priority - b.priority)
      .map((mx) => `${mx.priority} ${mx.exchange}`)
      .join("\n");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an email infrastructure expert. Given a domain and its MX records, identify the email hosting provider. Respond with ONLY the provider name (e.g. 'Google Workspace', 'Microsoft 365', 'Self-hosted', 'Hetzner Mail', etc.). If you cannot determine it, respond with 'Unknown'. Be concise — just the provider name, nothing else.",
        },
        {
          role: "user",
          content: `Domain: ${domain}\nMX Records:\n${mxList}`,
        },
      ],
      max_tokens: 50,
      temperature: 0,
    });

    return response.choices[0]?.message?.content?.trim() || "Unknown";
  } catch (error) {
    console.error("AI provider identification failed:", error);
    return "Unknown";
  }
}

/**
 * POST /api/lookup-mx
 * Body: { domain: string } or { url: string }
 *
 * Returns: { provider: string, mxRecords: [...], domain: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawInput = body.domain || body.url || "";

    if (!rawInput) {
      return NextResponse.json({ error: "Missing domain or url" }, { status: 400 });
    }

    const domain = extractDomain(rawInput);

    if (!domain || !domain.includes(".")) {
      return NextResponse.json({ error: "Invalid domain" }, { status: 400 });
    }

    // Resolve MX records
    let mxRecords: dns.MxRecord[];
    try {
      mxRecords = await resolveMx(domain);
    } catch (dnsError: unknown) {
      const code = (dnsError as { code?: string })?.code;
      if (code === "ENODATA" || code === "ENOTFOUND") {
        return NextResponse.json({
          provider: "No MX Records",
          mxRecords: [],
          domain,
        });
      }
      throw dnsError;
    }

    if (!mxRecords || mxRecords.length === 0) {
      return NextResponse.json({
        provider: "No MX Records",
        mxRecords: [],
        domain,
      });
    }

    // Try known patterns first
    let provider = identifyProvider(mxRecords);

    // Fall back to AI if unknown
    if (!provider) {
      provider = await identifyWithAI(domain, mxRecords);
    }

    return NextResponse.json({
      provider: provider || "Unknown",
      mxRecords: mxRecords.map((mx) => ({
        priority: mx.priority,
        exchange: mx.exchange,
      })),
      domain,
    });
  } catch (error) {
    console.error("MX lookup error:", error);
    return NextResponse.json({ error: "MX lookup failed" }, { status: 500 });
  }
}
