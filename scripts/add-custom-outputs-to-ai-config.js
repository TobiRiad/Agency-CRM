/**
 * Migration Script: Add custom_outputs field to ai_scoring_configs
 * 
 * Usage:
 * node scripts/add-custom-outputs-to-ai-config.js
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
    console.log('\nAdding custom_outputs field to ai_scoring_configs collection...');
    
    const collectionResponse = await fetch(`${POCKETBASE_URL}/api/collections/ai_scoring_configs`, { headers });
    const collection = await collectionResponse.json();
    
    const fields = collection.fields || collection.schema || [];
    const hasCustomOutputs = fields.some(f => f.name === 'custom_outputs');
    
    if (hasCustomOutputs) {
      console.log('  custom_outputs field already exists, skipping...');
    } else {
      fields.push({
        name: 'custom_outputs',
        type: 'json',
        required: false,
      });

      const updatePayload = collection.fields 
        ? { fields } 
        : { schema: fields };

      const updateResponse = await fetch(`${POCKETBASE_URL}/api/collections/ai_scoring_configs`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(updatePayload),
      });

      if (!updateResponse.ok) {
        const error = await updateResponse.text();
        throw new Error(`Failed to update collection: ${error}`);
      }

      console.log('  ✓ Added custom_outputs field');
    }

    // Also add ai_data field to companies if not exists
    console.log('\nAdding ai_data field to companies collection...');
    
    const companiesResponse = await fetch(`${POCKETBASE_URL}/api/collections/companies`, { headers });
    const companiesCollection = await companiesResponse.json();
    
    const companyFields = companiesCollection.fields || companiesCollection.schema || [];
    const hasAiData = companyFields.some(f => f.name === 'ai_data');
    
    if (hasAiData) {
      console.log('  ai_data field already exists, skipping...');
    } else {
      companyFields.push({
        name: 'ai_data',
        type: 'json',
        required: false,
      });

      const updatePayload = companyFields 
        ? { fields: companyFields } 
        : { schema: companyFields };

      const updateResponse = await fetch(`${POCKETBASE_URL}/api/collections/companies`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(updatePayload),
      });

      if (!updateResponse.ok) {
        const error = await updateResponse.text();
        throw new Error(`Failed to update companies collection: ${error}`);
      }

      console.log('  ✓ Added ai_data field');
    }

    console.log('\n✓ Migration completed successfully!');
  } catch (error) {
    console.error('\n✗ Migration failed:', error);
    process.exit(1);
  }
}

main();
