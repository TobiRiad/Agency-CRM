/**
 * Add Batches Collection
 * 
 * This script adds the batches collection if it doesn't exist.
 * Use this if you're getting 400 errors when loading batches.
 * 
 * Usage:
 *   node scripts/add-batches-collection.js           # Create collection if missing
 *   node scripts/add-batches-collection.js --fix     # Fix list/view rules if collection exists but list returns 400
 * 
 * Credentials are read from .env.local (POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD)
 */

// Load environment variables from .env.local
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
  console.log('Using PocketBase at:', POCKETBASE_URL, '(should match your app\'s NEXT_PUBLIC_POCKETBASE_URL)');
  // Use env vars, with command line as fallback
  const email = process.env.POCKETBASE_ADMIN_EMAIL || process.argv[2];
  const password = process.env.POCKETBASE_ADMIN_PASSWORD || process.argv[3];
  
  if (!email || !password) {
    console.error('Missing credentials. Set POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD in .env.local');
    console.error('Or run: node scripts/add-batches-collection.js <admin_email> <admin_password>');
    process.exit(1);
  }

  console.log('Authenticating with PocketBase...');
  
  // Try new endpoint first (PocketBase v0.23+), then fallback to old endpoint
  let authResponse = await fetch(`${POCKETBASE_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: email, password }),
  });

  // Fallback to old endpoint for older PocketBase versions
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

  const fixRules = process.argv.includes('--fix');

  try {
    // Check if batches collection exists
    console.log('\nChecking if batches collection exists...');
    const checkResponse = await fetch(`${POCKETBASE_URL}/api/collections/batches`, { headers });
    
    if (checkResponse.ok) {
      if (fixRules) {
        // Update list/view rules so listing works (relation-based rules can return 400 on some PB setups)
        console.log('Updating batches collection list/view rules (--fix)...');
        const patchResponse = await fetch(`${POCKETBASE_URL}/api/collections/batches`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            listRule: '@request.auth.id != ""',
            viewRule: '@request.auth.id != ""',
          }),
        });
        if (!patchResponse.ok) {
          const err = await patchResponse.text();
          throw new Error(`Failed to update rules: ${err}`);
        }
        console.log('✅ Batches collection rules updated. Refresh your app and try listing/creating batches again.');
      } else {
        console.log('✅ Batches collection already exists!');
        console.log('If listing batches still returns 400, run: node scripts/add-batches-collection.js --fix');
      }
      return;
    }

    // Get campaigns collection ID for the relation
    console.log('Getting campaigns collection ID...');
    const campaignsResponse = await fetch(`${POCKETBASE_URL}/api/collections/campaigns`, { headers });
    
    if (!campaignsResponse.ok) {
      throw new Error('Campaigns collection not found. Please run setup-pocketbase.js first.');
    }
    
    const campaignsCollection = await campaignsResponse.json();
    const campaignsId = campaignsCollection.id;
    console.log(`Campaigns collection ID: ${campaignsId}`);

    // Create batches collection
    console.log('\nCreating batches collection...');
    const createResponse = await fetch(`${POCKETBASE_URL}/api/collections`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'batches',
        type: 'base',
        fields: [
          { name: 'campaign', type: 'relation', required: true, collectionId: campaignsId, cascadeDelete: true, maxSelect: 1 },
          { name: 'name', type: 'text', required: true, min: 1, max: 100 },
        ],
        listRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
        viewRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
        deleteRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
      }),
    });

    if (!createResponse.ok) {
      const error = await createResponse.text();
      throw new Error(`Failed to create batches collection: ${error}`);
    }

    const collection = await createResponse.json();
    console.log(`✅ Created batches collection (ID: ${collection.id})`);

    // Now update the contacts collection to add the batch relation if it doesn't have it
    console.log('\nChecking contacts collection for batch field...');
    const contactsResponse = await fetch(`${POCKETBASE_URL}/api/collections/contacts`, { headers });
    const contactsCollection = await contactsResponse.json();
    
    const fields = contactsCollection.fields || contactsCollection.schema || [];
    const hasBatchField = fields.some(f => f.name === 'batch');
    
    if (!hasBatchField) {
      console.log('Adding batch field to contacts collection...');
      fields.push({
        name: 'batch',
        type: 'relation',
        required: false,
        collectionId: collection.id,
        cascadeDelete: false,
        maxSelect: 1,
      });

      const updatePayload = contactsCollection.fields 
        ? { fields } 
        : { schema: fields };

      const updateResponse = await fetch(`${POCKETBASE_URL}/api/collections/contacts`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(updatePayload),
      });

      if (updateResponse.ok) {
        console.log('✅ Added batch field to contacts collection');
      } else {
        console.log('⚠️  Could not add batch field to contacts (may need manual setup)');
      }
    } else {
      console.log('Batch field already exists in contacts collection');
    }

    console.log('\n✅ Done! The batches collection has been created.');
    console.log('Refresh your browser to load the campaign page.');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
