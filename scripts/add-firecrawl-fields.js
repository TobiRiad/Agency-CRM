/**
 * Migration Script: Add Firecrawl fields for website scraping
 * 
 * Adds:
 * 1. enable_firecrawl (boolean) to campaigns collection
 * 2. firecrawl_pages (json) to campaigns collection
 * 3. firecrawl_urls (json) to companies collection
 * 4. firecrawl_content (json) to companies collection
 * 5. firecrawl_mapped_at (date) to companies collection
 * 6. firecrawl_scraped_at (date) to companies collection
 * 
 * Usage:
 * node scripts/add-firecrawl-fields.js
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

const POCKETBASE_URL = process.env.POCKETBASE_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://localhost:8090';

async function main() {
  const email = process.env.POCKETBASE_ADMIN_EMAIL || process.argv[2];
  const password = process.env.POCKETBASE_ADMIN_PASSWORD || process.argv[3];
  
  if (!email || !password) {
    console.error('Missing credentials. Set POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD in .env.local');
    process.exit(1);
  }

  console.log('Authenticating with PocketBase...');
  
  let authResponse = await fetch(`${POCKETBASE_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: email, password }),
  });

  if (!authResponse.ok) {
    authResponse = await fetch(`${POCKETBASE_URL}/api/admins/auth-with-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: email, password }),
    });
  }

  if (!authResponse.ok) {
    const error = await authResponse.text();
    console.error('Authentication failed:', error);
    process.exit(1);
  }

  const authData = await authResponse.json();
  const token = authData.token;
  console.log('Authenticated successfully!');

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': token,
  };

  try {
    // 1. Add Firecrawl fields to campaigns
    console.log('\n1. Adding Firecrawl fields to campaigns collection...');
    
    const campaignsResponse = await fetch(`${POCKETBASE_URL}/api/collections/campaigns`, { headers });
    const campaignsCollection = await campaignsResponse.json();
    
    const campaignsFields = campaignsCollection.fields || campaignsCollection.schema || [];
    
    // Add enable_firecrawl
    const hasEnableFirecrawl = campaignsFields.some(f => f.name === 'enable_firecrawl');
    if (!hasEnableFirecrawl) {
      campaignsFields.push({
        name: 'enable_firecrawl',
        type: 'bool',
        required: false,
      });
      console.log('  + Added enable_firecrawl field');
    } else {
      console.log('  - enable_firecrawl already exists');
    }

    // Add firecrawl_pages
    const hasFirecrawlPages = campaignsFields.some(f => f.name === 'firecrawl_pages');
    if (!hasFirecrawlPages) {
      campaignsFields.push({
        name: 'firecrawl_pages',
        type: 'json',
        required: false,
      });
      console.log('  + Added firecrawl_pages field');
    } else {
      console.log('  - firecrawl_pages already exists');
    }

    if (!hasEnableFirecrawl || !hasFirecrawlPages) {
      const updatePayload = campaignsCollection.fields 
        ? { fields: campaignsFields } 
        : { schema: campaignsFields };

      const updateResponse = await fetch(`${POCKETBASE_URL}/api/collections/campaigns`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(updatePayload),
      });

      if (!updateResponse.ok) {
        const error = await updateResponse.text();
        throw new Error(`Failed to update campaigns collection: ${error}`);
      }
      console.log('  ✓ Campaigns collection updated');
    }

    // 2. Add Firecrawl fields to companies
    console.log('\n2. Adding Firecrawl fields to companies collection...');
    
    const companiesResponse = await fetch(`${POCKETBASE_URL}/api/collections/companies`, { headers });
    const companiesCollection = await companiesResponse.json();
    
    const companiesFields = companiesCollection.fields || companiesCollection.schema || [];
    
    const newCompanyFields = [
      { name: 'firecrawl_urls', type: 'json', required: false },
      { name: 'firecrawl_content', type: 'json', required: false },
      { name: 'firecrawl_mapped_at', type: 'date', required: false },
      { name: 'firecrawl_scraped_at', type: 'date', required: false },
    ];

    let companiesNeedsUpdate = false;
    for (const field of newCompanyFields) {
      const exists = companiesFields.some(f => f.name === field.name);
      if (!exists) {
        companiesFields.push(field);
        console.log(`  + Added ${field.name} field`);
        companiesNeedsUpdate = true;
      } else {
        console.log(`  - ${field.name} already exists`);
      }
    }

    if (companiesNeedsUpdate) {
      const updatePayload = companiesCollection.fields 
        ? { fields: companiesFields } 
        : { schema: companiesFields };

      const updateResponse = await fetch(`${POCKETBASE_URL}/api/collections/companies`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(updatePayload),
      });

      if (!updateResponse.ok) {
        const error = await updateResponse.text();
        throw new Error(`Failed to update companies collection: ${error}`);
      }
      console.log('  ✓ Companies collection updated');
    }

    console.log('\n✓ Firecrawl migration completed successfully!');
    console.log('\nNew fields added:');
    console.log('  Campaigns: enable_firecrawl (bool), firecrawl_pages (json)');
    console.log('  Companies: firecrawl_urls (json), firecrawl_content (json), firecrawl_mapped_at (date), firecrawl_scraped_at (date)');
  } catch (error) {
    console.error('\n✗ Migration failed:', error);
    process.exit(1);
  }
}

main();
