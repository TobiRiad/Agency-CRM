/**
 * Firecrawl utility functions for website scraping
 */

import type { FirecrawlPageType, FirecrawlUrls, FirecrawlContent } from "@/types";

const FIRECRAWL_API_URL = "https://api.firecrawl.dev/v1";

// URL patterns for each page type
const PAGE_PATTERNS: Record<FirecrawlPageType, RegExp[]> = {
  homepage: [/^\/$/],
  about: [
    /\/about\/?$/i,
    /\/about-us\/?$/i,
    /\/company\/?$/i,
    /\/who-we-are\/?$/i,
    /\/our-story\/?$/i,
    /\/team\/?$/i,
    /\/our-team\/?$/i,
  ],
  pricing: [
    /\/pricing\/?$/i,
    /\/plans\/?$/i,
    /\/packages\/?$/i,
    /\/price\/?$/i,
    /\/subscription\/?$/i,
  ],
  careers: [
    /\/careers\/?$/i,
    /\/jobs\/?$/i,
    /\/work-with-us\/?$/i,
    /\/join-us\/?$/i,
    /\/hiring\/?$/i,
    /\/openings\/?$/i,
  ],
  blog: [
    /\/blog\/?$/i,
    /\/news\/?$/i,
    /\/articles\/?$/i,
    /\/insights\/?$/i,
    /\/resources\/?$/i,
  ],
  products: [
    /\/products\/?$/i,
    /\/solutions\/?$/i,
    /\/features\/?$/i,
    /\/offerings\/?$/i,
  ],
  services: [
    /\/services\/?$/i,
    /\/our-services\/?$/i,
    /\/what-we-do\/?$/i,
  ],
  contact: [
    /\/contact\/?$/i,
    /\/contact-us\/?$/i,
    /\/get-in-touch\/?$/i,
    /\/reach-us\/?$/i,
    /\/support\/?$/i,
  ],
};

export interface FirecrawlMapResult {
  url: string;
  title?: string;
  description?: string;
}

export interface FirecrawlScrapeResult {
  markdown: string;
  html?: string;
  metadata?: {
    title?: string;
    description?: string;
  };
}

export interface MapUrlsResult {
  urls: FirecrawlUrls;
  found: FirecrawlPageType[];
  notFound: FirecrawlPageType[];
  allLinks: FirecrawlMapResult[];
}

/**
 * Extract the base domain from a URL
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    return url;
  }
}

/**
 * Get the path from a URL
 */
function getPath(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname;
  } catch {
    return "/";
  }
}

/**
 * Match a URL path to a page type
 */
function matchPageType(path: string): FirecrawlPageType | null {
  for (const [pageType, patterns] of Object.entries(PAGE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(path)) {
        return pageType as FirecrawlPageType;
      }
    }
  }
  return null;
}

/**
 * Use Firecrawl Map to discover URLs on a domain
 */
export async function firecrawlMap(
  websiteUrl: string,
  apiKey: string
): Promise<FirecrawlMapResult[]> {
  const domain = extractDomain(websiteUrl);
  
  const response = await fetch(`${FIRECRAWL_API_URL}/map`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      url: domain,
      includeSubdomains: false,
      limit: 100, // Limit to avoid excessive crawling
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Firecrawl map failed: ${error}`);
  }

  const data = await response.json();
  
  // Handle both array response and object with links property
  const links = Array.isArray(data) ? data : (data.links || data.urls || []);
  
  return links.map((item: any) => {
    if (typeof item === "string") {
      return { url: item };
    }
    return {
      url: item.url,
      title: item.title,
      description: item.description,
    };
  });
}

/**
 * Match discovered URLs to desired page types
 */
export function matchUrlsToPageTypes(
  links: FirecrawlMapResult[],
  desiredPages: FirecrawlPageType[],
  baseUrl: string
): MapUrlsResult {
  const urls: FirecrawlUrls = {};
  const found: FirecrawlPageType[] = [];
  const notFound: FirecrawlPageType[] = [];
  const domain = extractDomain(baseUrl);

  // Always include homepage
  if (desiredPages.includes("homepage")) {
    urls.homepage = domain;
    found.push("homepage");
  }

  // Match other pages
  for (const link of links) {
    // Skip if URL has query params (likely not a main page)
    if (link.url.includes("?")) continue;
    
    // Skip external links
    if (!link.url.startsWith(domain)) continue;

    const path = getPath(link.url);
    const pageType = matchPageType(path);

    if (pageType && desiredPages.includes(pageType) && !urls[pageType]) {
      urls[pageType] = link.url;
      if (!found.includes(pageType)) {
        found.push(pageType);
      }
    }
  }

  // Determine which pages were not found
  for (const page of desiredPages) {
    if (!found.includes(page)) {
      notFound.push(page);
    }
  }

  return { urls, found, notFound, allLinks: links };
}

/**
 * Scrape a single URL with Firecrawl
 */
export async function firecrawlScrape(
  url: string,
  apiKey: string
): Promise<FirecrawlScrapeResult> {
  const response = await fetch(`${FIRECRAWL_API_URL}/scrape`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      onlyMainContent: true, // Get only main content, skip nav/footer
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Firecrawl scrape failed for ${url}: ${error}`);
  }

  const data = await response.json();
  
  return {
    markdown: data.data?.markdown || data.markdown || "",
    html: data.data?.html || data.html,
    metadata: data.data?.metadata || data.metadata,
  };
}

/**
 * Scrape multiple URLs and return content for each page type
 */
export async function scrapeUrls(
  urls: FirecrawlUrls,
  apiKey: string
): Promise<FirecrawlContent> {
  const content: FirecrawlContent = {};
  
  const entries = Object.entries(urls).filter(([_, url]) => url) as [FirecrawlPageType, string][];
  
  // Scrape in parallel but with a small batch size to avoid rate limits
  const batchSize = 3;
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async ([pageType, url]) => {
        const result = await firecrawlScrape(url, apiKey);
        return { pageType, content: result.markdown };
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        content[result.value.pageType] = result.value.content;
      }
    }
  }

  return content;
}

/**
 * Format scraped content for AI consumption
 */
export function formatContentForAI(content: FirecrawlContent): string {
  const sections: string[] = [];

  const pageLabels: Record<FirecrawlPageType, string> = {
    homepage: "Homepage",
    about: "About Page",
    pricing: "Pricing Page",
    careers: "Careers Page",
    blog: "Blog",
    products: "Products Page",
    services: "Services Page",
    contact: "Contact Page",
  };

  for (const [pageType, text] of Object.entries(content)) {
    if (text && text.trim()) {
      const label = pageLabels[pageType as FirecrawlPageType] || pageType;
      // Allow generous content for accurate AI scoring (10k chars per page)
      // With 8 page types max, this is ~80k chars (~20k tokens) - well within GPT limits
      const truncated = text.length > 10000 ? text.substring(0, 10000) + "..." : text;
      sections.push(`### ${label}\n\n${truncated}`);
    }
  }

  return sections.join("\n\n---\n\n");
}

/**
 * Full pipeline: Map a domain and match URLs to desired page types
 */
export async function mapAndMatchUrls(
  websiteUrl: string,
  desiredPages: FirecrawlPageType[],
  apiKey: string
): Promise<MapUrlsResult> {
  const links = await firecrawlMap(websiteUrl, apiKey);
  return matchUrlsToPageTypes(links, desiredPages, websiteUrl);
}
