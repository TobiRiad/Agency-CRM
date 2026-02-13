/**
 * Backfill email_provider for existing companies that have a website.
 *
 * Usage:
 *   NEXT_PUBLIC_POCKETBASE_URL=https://agency-crm-production-2b07.up.railway.app node scripts/backfill-email-providers.js
 *
 * Options:
 *   --dry-run     Just show what would be updated, don't actually update
 *   --campaign=ID Only process companies from a specific campaign
 */
const dns = require('dns');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const resolveMx = promisify(dns.resolveMx);

// Load .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      if (!process.env[key]) process.env[key] = trimmed.slice(eqIdx + 1).trim();
    }
  });
}

const PB = process.env.POCKETBASE_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://localhost:8090';
const dryRun = process.argv.includes('--dry-run');
const campaignArg = process.argv.find(a => a.startsWith('--campaign='));
const campaignFilter = campaignArg ? campaignArg.split('=')[1] : null;

const KNOWN_PROVIDERS = [
  { pattern: /google\.com$/i, name: 'Google Workspace' },
  { pattern: /googlemail\.com$/i, name: 'Google Workspace' },
  { pattern: /outlook\.com$/i, name: 'Microsoft 365' },
  { pattern: /protection\.outlook\.com$/i, name: 'Microsoft 365' },
  { pattern: /microsoft\.com$/i, name: 'Microsoft 365' },
  { pattern: /privateemail\.com$/i, name: 'Namecheap Private Email' },
  { pattern: /zoho\.com$/i, name: 'Zoho Mail' },
  { pattern: /zoho\.eu$/i, name: 'Zoho Mail' },
  { pattern: /protonmail\.ch$/i, name: 'ProtonMail' },
  { pattern: /proton\.me$/i, name: 'ProtonMail' },
  { pattern: /fastmail\.com$/i, name: 'Fastmail' },
  { pattern: /messagingengine\.com$/i, name: 'Fastmail' },
  { pattern: /yahoodns\.net$/i, name: 'Yahoo Mail' },
  { pattern: /yahoo\.com$/i, name: 'Yahoo Mail' },
  { pattern: /mimecast\.com$/i, name: 'Mimecast' },
  { pattern: /barracudanetworks\.com$/i, name: 'Barracuda' },
  { pattern: /emailsrvr\.com$/i, name: 'Rackspace Email' },
  { pattern: /secureserver\.net$/i, name: 'GoDaddy Email' },
  { pattern: /ovh\.net$/i, name: 'OVH Mail' },
  { pattern: /hostinger\.com$/i, name: 'Hostinger Email' },
  { pattern: /titan\.email$/i, name: 'Titan Email' },
  { pattern: /improvmx\.com$/i, name: 'ImprovMX' },
  { pattern: /migadu\.com$/i, name: 'Migadu' },
  { pattern: /yandex\.(net|ru|com)$/i, name: 'Yandex Mail' },
  { pattern: /mail\.ru$/i, name: 'Mail.ru' },
  { pattern: /icloud\.com$/i, name: 'iCloud Mail' },
  { pattern: /amazonaws\.com$/i, name: 'Amazon SES' },
  { pattern: /awsapps\.com$/i, name: 'Amazon WorkMail' },
  { pattern: /cloudflare\.net$/i, name: 'Cloudflare Email' },
];

function extractDomain(urlOrDomain) {
  let domain = urlOrDomain.trim();
  domain = domain.replace(/^https?:\/\//, '');
  domain = domain.split('/')[0].split('?')[0].split('#')[0];
  domain = domain.replace(/^www\./, '');
  return domain.toLowerCase();
}

function identifyProvider(mxRecords) {
  const sorted = mxRecords.sort((a, b) => a.priority - b.priority);
  for (const mx of sorted) {
    const exchange = mx.exchange.toLowerCase().replace(/\.$/, '');
    for (const { pattern, name } of KNOWN_PROVIDERS) {
      if (pattern.test(exchange)) return name;
    }
  }
  return null;
}

async function identifyWithAI(domain, mxRecords) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return 'Unknown';

  try {
    const mxList = mxRecords
      .sort((a, b) => a.priority - b.priority)
      .map(mx => `${mx.priority} ${mx.exchange}`)
      .join('\n');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an email infrastructure expert. Given a domain and its MX records, identify the email hosting provider. Respond with ONLY the provider name (e.g. "Google Workspace", "Microsoft 365", "Self-hosted"). If unknown, respond "Unknown".',
          },
          { role: 'user', content: `Domain: ${domain}\nMX Records:\n${mxList}` },
        ],
        max_tokens: 50,
        temperature: 0,
      }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || 'Unknown';
  } catch (e) {
    return 'Unknown';
  }
}

async function lookupProvider(website) {
  const domain = extractDomain(website);
  if (!domain || !domain.includes('.')) return null;

  try {
    const mxRecords = await resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) return 'No MX Records';

    let provider = identifyProvider(mxRecords);
    if (!provider) {
      provider = await identifyWithAI(domain, mxRecords);
    }
    return provider || 'Unknown';
  } catch (err) {
    if (err.code === 'ENODATA' || err.code === 'ENOTFOUND') return 'No MX Records';
    return null;
  }
}

async function main() {
  console.log(`Using PocketBase at: ${PB}`);
  if (dryRun) console.log('DRY RUN — no changes will be saved\n');

  const email = process.env.POCKETBASE_ADMIN_EMAIL;
  const password = process.env.POCKETBASE_ADMIN_PASSWORD;
  if (!email || !password) { console.error('Missing credentials.'); process.exit(1); }

  let authRes = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: email, password }),
  });
  if (!authRes.ok) {
    authRes = await fetch(`${PB}/api/admins/auth-with-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: email, password }),
    });
  }
  if (!authRes.ok) { console.error('Auth failed:', await authRes.text()); process.exit(1); }
  const { token } = await authRes.json();
  const headers = { 'Content-Type': 'application/json', 'Authorization': token };

  // Fetch companies without email_provider that have a website
  let filter = 'website != "" && (email_provider = "" || email_provider = null)';
  if (campaignFilter) filter += ` && campaign = "${campaignFilter}"`;

  let page = 1;
  let totalProcessed = 0;
  let totalUpdated = 0;

  while (true) {
    const res = await fetch(`${PB}/api/collections/companies/records?filter=${encodeURIComponent(filter)}&page=${page}&perPage=100`, { headers });
    const data = await res.json();

    if (!data.items || data.items.length === 0) break;

    console.log(`Processing page ${page} (${data.items.length} companies)...`);

    for (const company of data.items) {
      totalProcessed++;
      if (!company.website) continue;

      const provider = await lookupProvider(company.website);
      if (!provider) {
        console.log(`  ⚠ ${company.name} (${company.website}) — DNS error, skipped`);
        continue;
      }

      console.log(`  ${company.name} (${company.website}) → ${provider}`);

      if (!dryRun) {
        const updateRes = await fetch(`${PB}/api/collections/companies/records/${company.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ email_provider: provider }),
        });
        if (!updateRes.ok) {
          console.error(`    ✗ Failed to update:`, await updateRes.text());
        } else {
          totalUpdated++;
        }
      } else {
        totalUpdated++;
      }
    }

    if (data.items.length < 100) break;
    page++;
  }

  console.log(`\n✓ Done! Processed ${totalProcessed} companies, updated ${totalUpdated}.`);
}

main().catch(console.error);
