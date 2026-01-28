/**
 * Migration Script: Add "Uncategorized" funnel stages
 * 
 * This script:
 * 1. Creates "Uncategorized" funnel stage for campaigns that don't have one
 * 2. Assigns contacts without a stage to the "Uncategorized" stage
 * 
 * Usage: node scripts/migrate-uncategorized-stages.js <admin_email> <admin_password>
 */

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://localhost:8090';

async function main() {
  const [,, email, password] = process.argv;
  
  if (!email || !password) {
    console.error('Usage: node migrate-uncategorized-stages.js <admin_email> <admin_password>');
    process.exit(1);
  }

  console.log('Authenticating with PocketBase...');
  
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
    console.error('Authentication failed');
    process.exit(1);
  }

  const { token } = await authResponse.json();
  const headers = { 'Authorization': token, 'Content-Type': 'application/json' };
  console.log('Authenticated successfully!\n');

  // Step 1: Get all campaigns
  console.log('Fetching campaigns...');
  const campaignsRes = await fetch(`${POCKETBASE_URL}/api/collections/campaigns/records`, { headers });
  const campaigns = (await campaignsRes.json()).items || [];
  console.log(`Found ${campaigns.length} campaigns\n`);

  // Step 2: For each campaign, ensure "Uncategorized" stage exists
  console.log('Creating Uncategorized stages for campaigns...');
  const uncategorizedStages = new Map();

  for (const campaign of campaigns) {
    // Check if Uncategorized stage exists
    const stagesRes = await fetch(
      `${POCKETBASE_URL}/api/collections/funnel_stages/records?filter=${encodeURIComponent(`campaign = "${campaign.id}" && name = "Uncategorized"`)}`,
      { headers }
    );
    const stages = (await stagesRes.json()).items || [];

    if (stages.length > 0) {
      console.log(`  Campaign "${campaign.name}": Uncategorized stage already exists`);
      uncategorizedStages.set(campaign.id, stages[0].id);
    } else {
      // Create Uncategorized stage
      const createRes = await fetch(`${POCKETBASE_URL}/api/collections/funnel_stages/records`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: 'Uncategorized',
          order: 0,
          color: 'gray',
          campaign: campaign.id,
        }),
      });
      
      if (createRes.ok) {
        const newStage = await createRes.json();
        console.log(`  Campaign "${campaign.name}": Created Uncategorized stage`);
        uncategorizedStages.set(campaign.id, newStage.id);
      } else {
        console.error(`  Campaign "${campaign.name}": Failed to create Uncategorized stage`);
      }
    }
  }

  // Step 3: Get all contacts
  console.log('\nFetching contacts...');
  const contactsRes = await fetch(`${POCKETBASE_URL}/api/collections/contacts/records?perPage=500`, { headers });
  const contacts = (await contactsRes.json()).items || [];
  console.log(`Found ${contacts.length} contacts\n`);

  // Step 4: Get all contact_stages
  console.log('Fetching contact stages...');
  const contactStagesRes = await fetch(`${POCKETBASE_URL}/api/collections/contact_stages/records?perPage=500`, { headers });
  const contactStages = (await contactStagesRes.json()).items || [];
  const contactsWithStage = new Set(contactStages.map(cs => cs.contact));
  console.log(`Found ${contactStages.length} contact-stage assignments\n`);

  // Step 5: Assign contacts without a stage to Uncategorized
  console.log('Assigning contacts without stages to Uncategorized...');
  let assigned = 0;
  let skipped = 0;

  for (const contact of contacts) {
    if (contactsWithStage.has(contact.id)) {
      skipped++;
      continue;
    }

    const uncategorizedStageId = uncategorizedStages.get(contact.campaign);
    if (!uncategorizedStageId) {
      console.log(`  Contact "${contact.email}": No Uncategorized stage for campaign`);
      continue;
    }

    const createRes = await fetch(`${POCKETBASE_URL}/api/collections/contact_stages/records`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        contact: contact.id,
        stage: uncategorizedStageId,
        moved_at: new Date().toISOString(),
      }),
    });

    if (createRes.ok) {
      assigned++;
    } else {
      console.log(`  Contact "${contact.email}": Failed to assign stage`);
    }
  }

  console.log(`\nMigration complete!`);
  console.log(`  - ${uncategorizedStages.size} campaigns have Uncategorized stages`);
  console.log(`  - ${assigned} contacts assigned to Uncategorized`);
  console.log(`  - ${skipped} contacts already had a stage`);
}

main().catch(console.error);
