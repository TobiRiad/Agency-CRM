/**
 * One-time fix: Create "Bounced" funnel stage in the outreach campaign
 * and move Jeff Campbell's outreach contact to it.
 * Also cleans up the incorrectly created "Bounced" stage in the lead campaign.
 *
 * Usage:
 *   NEXT_PUBLIC_POCKETBASE_URL=https://agency-crm-production-2b07.up.railway.app node scripts/fix-bounced-contact.js
 */

const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local (don't overwrite CLI-set vars)
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      if (!process.env[key]) {
        process.env[key] = trimmed.slice(eqIdx + 1).trim();
      }
    }
  });
}

const POCKETBASE_URL = process.env.POCKETBASE_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://localhost:8090';

async function main() {
  console.log('Using PocketBase at:', POCKETBASE_URL);

  const email = process.env.POCKETBASE_ADMIN_EMAIL;
  const password = process.env.POCKETBASE_ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('Missing credentials.');
    process.exit(1);
  }

  // Authenticate
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
    console.error('Auth failed:', await authResponse.text());
    process.exit(1);
  }
  const { token } = await authResponse.json();
  const headers = { 'Content-Type': 'application/json', 'Authorization': token };

  // 1. Find all campaigns
  console.log('\n1. Finding campaigns...');
  const campaignsRes = await fetch(`${POCKETBASE_URL}/api/collections/campaigns/records?perPage=100`, { headers });
  const campaigns = (await campaignsRes.json()).items;
  
  // Outreach campaigns have kind="outreach" or kind="" (empty = outreach, legacy)
  const outreachCampaign = campaigns.find(c => c.kind === 'outreach' || !c.kind);
  const leadCampaigns = campaigns.filter(c => c.kind === 'leads');
  
  if (!outreachCampaign) {
    console.error('No outreach campaign found!');
    process.exit(1);
  }
  console.log(`  Outreach campaign: "${outreachCampaign.name}" (${outreachCampaign.id})`);
  console.log(`  Lead campaigns: ${leadCampaigns.map(c => `"${c.name}" (${c.id})`).join(', ')}`);

  // 2. Check for existing "Bounced" stage in outreach campaign
  console.log('\n2. Checking funnel stages...');
  const stagesRes = await fetch(`${POCKETBASE_URL}/api/collections/funnel_stages/records?perPage=100`, { headers });
  const allStages = (await stagesRes.json()).items;
  
  const outreachStages = allStages.filter(s => s.campaign === outreachCampaign.id);
  const leadBouncedStages = allStages.filter(s => 
    s.name.toLowerCase() === 'bounced' && leadCampaigns.some(lc => lc.id === s.campaign)
  );
  
  console.log(`  Outreach stages: ${outreachStages.map(s => s.name).join(', ')}`);
  console.log(`  Bounced stages in lead campaigns: ${leadBouncedStages.length}`);

  let outreachBouncedStage = outreachStages.find(s => s.name.toLowerCase() === 'bounced');
  
  if (!outreachBouncedStage) {
    // Create "Bounced" stage in outreach campaign
    const maxOrder = outreachStages.reduce((max, s) => Math.max(max, s.order || 0), 0);
    console.log('\n3. Creating "Bounced" stage in outreach campaign...');
    const createRes = await fetch(`${POCKETBASE_URL}/api/collections/funnel_stages/records`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'Bounced',
        order: maxOrder + 1,
        color: '#ef4444',
        campaign: outreachCampaign.id,
      }),
    });
    if (!createRes.ok) {
      console.error('Failed to create stage:', await createRes.text());
      process.exit(1);
    }
    outreachBouncedStage = await createRes.json();
    console.log(`  ✓ Created "Bounced" stage (${outreachBouncedStage.id})`);
  } else {
    console.log(`  ✓ "Bounced" stage already exists in outreach (${outreachBouncedStage.id})`);
  }

  // 4. Find Jeff Campbell in the outreach campaign
  console.log('\n4. Finding Jeff Campbell...');
  const jeffFilter = encodeURIComponent('email="jeff.campbell@aicommerce.com"');
  const contactsRes = await fetch(`${POCKETBASE_URL}/api/collections/contacts/records?filter=${jeffFilter}&perPage=10`, { headers });
  const contacts = (await contactsRes.json()).items;
  
  console.log(`  Found ${contacts.length} contact(s) with that email`);
  for (const c of contacts) {
    const camp = campaigns.find(ca => ca.id === c.campaign);
    console.log(`    - ${c.id} in "${camp?.name || 'unknown'}" (${camp?.kind || 'unknown kind'})`);
  }

  const jeffOutreach = contacts.find(c => c.campaign === outreachCampaign.id);
  
  if (jeffOutreach) {
    // Move Jeff to Bounced stage in outreach
    console.log(`\n5. Moving Jeff (${jeffOutreach.id}) to Bounced stage...`);
    
    // Check if contact_stages record exists
    const csFilter = encodeURIComponent(`contact="${jeffOutreach.id}"`);
    const csRes = await fetch(`${POCKETBASE_URL}/api/collections/contact_stages/records?filter=${csFilter}&perPage=1`, { headers });
    const csData = await csRes.json();
    
    if (csData.items && csData.items.length > 0) {
      // Update existing
      const updateRes = await fetch(`${POCKETBASE_URL}/api/collections/contact_stages/records/${csData.items[0].id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ stage: outreachBouncedStage.id }),
      });
      if (updateRes.ok) {
        console.log('  ✓ Updated existing contact_stage to Bounced');
      } else {
        console.error('  ✗ Failed to update:', await updateRes.text());
      }
    } else {
      // Create new
      const createRes = await fetch(`${POCKETBASE_URL}/api/collections/contact_stages/records`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          contact: jeffOutreach.id,
          stage: outreachBouncedStage.id,
        }),
      });
      if (createRes.ok) {
        console.log('  ✓ Created contact_stage → Bounced');
      } else {
        console.error('  ✗ Failed to create:', await createRes.text());
      }
    }

    // Also cancel follow-ups for bounced contact
    await fetch(`${POCKETBASE_URL}/api/collections/contacts/records/${jeffOutreach.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ follow_up_cancelled: true, follow_up_date: '' }),
    });
    console.log('  ✓ Cancelled follow-ups for bounced contact');
  } else {
    console.log('  ⚠ Jeff not found in outreach campaign — he may only exist in lead campaign');
  }

  // 6. Clean up lead campaign "Bounced" stages
  if (leadBouncedStages.length > 0) {
    console.log('\n6. Cleaning up Bounced stages from lead campaigns...');
    for (const stage of leadBouncedStages) {
      const camp = campaigns.find(c => c.id === stage.campaign);
      
      // Check if any contacts are on this stage
      const csFilter = encodeURIComponent(`stage="${stage.id}"`);
      const usageRes = await fetch(`${POCKETBASE_URL}/api/collections/contact_stages/records?filter=${csFilter}&perPage=1`, { headers });
      const usageData = await usageRes.json();
      
      if (usageData.items && usageData.items.length > 0) {
        // Move those contacts to uncategorized or delete the contact_stage
        for (const cs of usageData.items) {
          await fetch(`${POCKETBASE_URL}/api/collections/contact_stages/records/${cs.id}`, {
            method: 'DELETE',
            headers,
          });
        }
        console.log(`  ✓ Removed contact_stage references from lead "Bounced" in "${camp?.name}"`);
      }
      
      // Delete the stage
      const delRes = await fetch(`${POCKETBASE_URL}/api/collections/funnel_stages/records/${stage.id}`, {
        method: 'DELETE',
        headers,
      });
      if (delRes.ok) {
        console.log(`  ✓ Deleted "Bounced" stage from lead campaign "${camp?.name}"`);
      } else {
        console.log(`  ⚠ Could not delete stage: ${await delRes.text()}`);
      }
    }
  }

  console.log('\n✓ Done!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
