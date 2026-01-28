/**
 * Migration Script: Add industry_type and industry_options fields to campaigns
 * 
 * This script adds fields to the campaigns collection:
 * - industry_type: 'text' (default) or 'dropdown'
 * - industry_options: JSON array of string options for dropdown
 * 
 * Usage: node scripts/migrate-industry-options.js <admin_email> <admin_password>
 */

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://localhost:8090';

async function main() {
  const [,, email, password] = process.argv;
  
  if (!email || !password) {
    console.error('Usage: node migrate-industry-options.js <admin_email> <admin_password>');
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

  // Get the campaigns collection
  console.log('Fetching campaigns collection...');
  const collectionRes = await fetch(`${POCKETBASE_URL}/api/collections/campaigns`, { headers });
  
  if (!collectionRes.ok) {
    console.error('Failed to fetch campaigns collection');
    process.exit(1);
  }
  
  const collection = await collectionRes.json();
  console.log(`Current fields: ${collection.fields.map(f => f.name).join(', ')}\n`);

  // Check if fields already exist
  const hasIndustryType = collection.fields.some(f => f.name === 'industry_type');
  const hasIndustryOptions = collection.fields.some(f => f.name === 'industry_options');

  if (hasIndustryType && hasIndustryOptions) {
    console.log('Fields industry_type and industry_options already exist. Nothing to do.');
    return;
  }

  // Add new fields
  const newFields = [...collection.fields];
  
  if (!hasIndustryType) {
    newFields.push({
      name: 'industry_type',
      type: 'select',
      required: false,
      values: ['text', 'dropdown'],
    });
    console.log('Adding industry_type field...');
  }
  
  if (!hasIndustryOptions) {
    newFields.push({
      name: 'industry_options',
      type: 'json',
      required: false,
    });
    console.log('Adding industry_options field...');
  }

  // Update the collection
  console.log('Updating campaigns collection...');
  const updateRes = await fetch(`${POCKETBASE_URL}/api/collections/campaigns`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      fields: newFields,
    }),
  });

  if (!updateRes.ok) {
    const error = await updateRes.json();
    console.error('Failed to update collection:', JSON.stringify(error, null, 2));
    process.exit(1);
  }

  console.log('Collection updated successfully!');

  // Set default values for existing campaigns
  console.log('\nUpdating existing campaigns with default values...');
  const campaignsRes = await fetch(`${POCKETBASE_URL}/api/collections/campaigns/records`, { headers });
  const campaigns = (await campaignsRes.json()).items || [];

  for (const campaign of campaigns) {
    if (!campaign.industry_type) {
      const updateCampaignRes = await fetch(
        `${POCKETBASE_URL}/api/collections/campaigns/records/${campaign.id}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            industry_type: 'text',
            industry_options: [],
          }),
        }
      );

      if (updateCampaignRes.ok) {
        console.log(`  Updated campaign "${campaign.name}" with default industry_type='text'`);
      } else {
        console.log(`  Failed to update campaign "${campaign.name}"`);
      }
    }
  }

  console.log('\nMigration complete!');
}

main().catch(console.error);
