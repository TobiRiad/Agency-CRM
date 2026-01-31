/**
 * Migration Script: Add Leads/Outreach Separation and AI Scoring
 * 
 * This script adds:
 * 1. Campaign "kind" field (leads | outreach)
 * 2. Company fields for leads (email, description, AI scoring results)
 * 3. Contact source tracking (source_company, source_contact)
 * 4. AI scoring configs collection
 * 
 * Usage:
 * node scripts/add-leads-and-ai-features.js
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
  const email = process.env.POCKETBASE_ADMIN_EMAIL || process.argv[2];
  const password = process.env.POCKETBASE_ADMIN_PASSWORD || process.argv[3];
  
  if (!email || !password) {
    console.error('Missing credentials. Set POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD in .env.local');
    console.error('Or run: node scripts/add-leads-and-ai-features.js <admin_email> <admin_password>');
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

  try {
    // 1. Update campaigns collection to add "kind" field
    console.log('\n1. Adding "kind" field to campaigns collection...');
    
    const campaignsResponse = await fetch(`${POCKETBASE_URL}/api/collections/campaigns`, { headers });
    const campaignsCollection = await campaignsResponse.json();
    
    const hasKindField = campaignsCollection.fields?.some(f => f.name === 'kind') || 
                         campaignsCollection.schema?.some(f => f.name === 'kind');
    
    if (hasKindField) {
      console.log('  Kind field already exists, skipping...');
    } else {
      const fields = campaignsCollection.fields || campaignsCollection.schema || [];
      fields.push({
        name: 'kind',
        type: 'select',
        required: false,
        maxSelect: 1,
        values: ['leads', 'outreach'],
      });

      const updatePayload = campaignsCollection.fields 
        ? { fields } 
        : { schema: fields };

      const updateResponse = await fetch(`${POCKETBASE_URL}/api/collections/campaigns`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(updatePayload),
      });

      if (!updateResponse.ok) {
        const error = await updateResponse.text();
        throw new Error(`Failed to update campaigns collection: ${error}`);
      }
      console.log('  Added "kind" field to campaigns collection');
    }

    // 2. Update companies collection to add lead/AI fields
    console.log('\n2. Adding lead and AI fields to companies collection...');
    
    const companiesResponse = await fetch(`${POCKETBASE_URL}/api/collections/companies`, { headers });
    const companiesCollection = await companiesResponse.json();
    
    const fields = companiesCollection.fields || companiesCollection.schema || [];
    const fieldNames = fields.map(f => f.name);
    
    const fieldsToAdd = [
      { name: 'email', type: 'email', required: false },
      { name: 'description', type: 'text', required: false, max: 2000 },
      { name: 'ai_score', type: 'number', required: false, min: 0, max: 100 },
      { name: 'ai_classification', type: 'text', required: false, max: 100 },
      { name: 'ai_confidence', type: 'number', required: false, min: 0, max: 1 },
      { name: 'ai_reasons', type: 'json', required: false },
      { name: 'ai_scored_at', type: 'date', required: false },
      { name: 'ai_config_version', type: 'text', required: false, max: 50 },
    ];

    let addedCount = 0;
    for (const fieldToAdd of fieldsToAdd) {
      if (!fieldNames.includes(fieldToAdd.name)) {
        fields.push(fieldToAdd);
        addedCount++;
      }
    }

    if (addedCount > 0) {
      const updatePayload = companiesCollection.fields 
        ? { fields } 
        : { schema: fields };

      const updateResponse = await fetch(`${POCKETBASE_URL}/api/collections/companies`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(updatePayload),
      });

      if (!updateResponse.ok) {
        const error = await updateResponse.text();
        throw new Error(`Failed to update companies collection: ${error}`);
      }
      console.log(`  Added ${addedCount} fields to companies collection`);
    } else {
      console.log('  All fields already exist, skipping...');
    }

    // 3. Update contacts collection to add source tracking
    console.log('\n3. Adding source tracking to contacts collection...');
    
    const contactsResponse = await fetch(`${POCKETBASE_URL}/api/collections/contacts`, { headers });
    const contactsCollection = await contactsResponse.json();
    
    const contactsFields = contactsCollection.fields || contactsCollection.schema || [];
    const contactsFieldNames = contactsFields.map(f => f.name);
    
    // Get companies collection ID for relation
    const companiesId = companiesCollection.id;
    
    const sourceFields = [
      { name: 'source_company', type: 'relation', required: false, collectionId: companiesId, cascadeDelete: false, maxSelect: 1 },
      { name: 'source_contact', type: 'relation', required: false, collectionId: contactsCollection.id, cascadeDelete: false, maxSelect: 1 },
    ];

    let addedSourceCount = 0;
    for (const fieldToAdd of sourceFields) {
      if (!contactsFieldNames.includes(fieldToAdd.name)) {
        contactsFields.push(fieldToAdd);
        addedSourceCount++;
      }
    }

    if (addedSourceCount > 0) {
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
      console.log(`  Added ${addedSourceCount} source tracking fields to contacts collection`);
    } else {
      console.log('  Source tracking fields already exist, skipping...');
    }

    // 4. Create ai_scoring_configs collection
    console.log('\n4. Creating ai_scoring_configs collection...');
    
    const checkAIResponse = await fetch(`${POCKETBASE_URL}/api/collections/ai_scoring_configs`, { headers });
    
    if (checkAIResponse.ok) {
      console.log('  ai_scoring_configs collection already exists, skipping...');
    } else {
      const campaignsId = campaignsCollection.id;
      
      const createAIResponse = await fetch(`${POCKETBASE_URL}/api/collections`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: 'ai_scoring_configs',
          type: 'base',
          fields: [
            { name: 'campaign', type: 'relation', required: true, collectionId: campaignsId, cascadeDelete: true, maxSelect: 1 },
            { name: 'name', type: 'text', required: true, min: 1, max: 200 },
            { name: 'system_prompt', type: 'text', required: true, max: 10000 },
            { name: 'enable_score', type: 'bool', required: false },
            { name: 'score_min', type: 'number', required: false, min: 0 },
            { name: 'score_max', type: 'number', required: false, min: 0 },
            { name: 'enable_classification', type: 'bool', required: false },
            { name: 'classification_label', type: 'text', required: false, max: 100 },
            { name: 'classification_options', type: 'json', required: false },
            { name: 'model', type: 'text', required: false, max: 50 },
            { name: 'temperature', type: 'number', required: false, min: 0, max: 2 },
          ],
          listRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
          viewRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
          createRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
          updateRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
          deleteRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
        }),
      });

      if (!createAIResponse.ok) {
        const error = await createAIResponse.text();
        throw new Error(`Failed to create ai_scoring_configs collection: ${error}`);
      }
      
      const aiCollection = await createAIResponse.json();
      console.log(`  Created ai_scoring_configs collection (ID: ${aiCollection.id})`);
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Restart your dev server');
    console.log('2. Create campaigns with kind="leads" or kind="outreach"');
    console.log('3. Set up AI scoring configs in campaign settings');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
