/**
 * Migration Script: Add AI opener fields
 * 
 * Adds:
 * 1. ai_opener field to contacts collection
 * 2. ai_opener_prompt field to campaigns collection
 * 
 * Usage:
 * node scripts/add-ai-opener-fields.js
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
    // 1. Add ai_opener to contacts
    console.log('\n1. Adding ai_opener field to contacts collection...');
    
    const contactsResponse = await fetch(`${POCKETBASE_URL}/api/collections/contacts`, { headers });
    const contactsCollection = await contactsResponse.json();
    
    const contactsFields = contactsCollection.fields || contactsCollection.schema || [];
    const hasAiOpener = contactsFields.some(f => f.name === 'ai_opener');
    
    if (hasAiOpener) {
      console.log('  ai_opener field already exists, skipping...');
    } else {
      contactsFields.push({
        name: 'ai_opener',
        type: 'text',
        required: false,
      });

      const updatePayload = contactsCollection.fields 
        ? { fields: contactsFields } 
        : { schema: contactsFields };

      const updateResponse = await fetch(`${POCKETBASE_URL}/api/collections/contacts`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(updatePayload),
      });

      if (!updateResponse.ok) {
        const error = await updateResponse.text();
        throw new Error(`Failed to update contacts collection: ${error}`);
      }

      console.log('  ✓ Added ai_opener field');
    }

    // 2. Add ai_opener_prompt to campaigns
    console.log('\n2. Adding ai_opener_prompt field to campaigns collection...');
    
    const campaignsResponse = await fetch(`${POCKETBASE_URL}/api/collections/campaigns`, { headers });
    const campaignsCollection = await campaignsResponse.json();
    
    const campaignsFields = campaignsCollection.fields || campaignsCollection.schema || [];
    const hasAiOpenerPrompt = campaignsFields.some(f => f.name === 'ai_opener_prompt');
    
    if (hasAiOpenerPrompt) {
      console.log('  ai_opener_prompt field already exists, skipping...');
    } else {
      campaignsFields.push({
        name: 'ai_opener_prompt',
        type: 'text',
        required: false,
      });

      const updatePayload = campaignsFields 
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

      console.log('  ✓ Added ai_opener_prompt field');
    }

    console.log('\n✓ Migration completed successfully!');
  } catch (error) {
    console.error('\n✗ Migration failed:', error);
    process.exit(1);
  }
}

main();
