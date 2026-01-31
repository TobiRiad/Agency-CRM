/**
 * Add batch field to companies collection
 * 
 * This allows lead companies to be organized into batches.
 */

const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
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
  console.log('Using PocketBase at:', POCKETBASE_URL);
  
  const email = process.env.POCKETBASE_ADMIN_EMAIL;
  const password = process.env.POCKETBASE_ADMIN_PASSWORD;
  
  if (!email || !password) {
    console.error('Missing credentials in .env.local');
    process.exit(1);
  }

  console.log('Authenticating...');
  
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
    console.error('Auth failed');
    process.exit(1);
  }

  const { token } = await authResponse.json();
  const headers = { 'Content-Type': 'application/json', Authorization: token };

  // Get batches collection ID
  console.log('Getting batches collection ID...');
  const batchesRes = await fetch(`${POCKETBASE_URL}/api/collections/batches`, { headers: { Authorization: token } });
  if (!batchesRes.ok) {
    console.error('Batches collection not found. Run add-batches-collection.js first.');
    process.exit(1);
  }
  const batchesCollection = await batchesRes.json();
  const batchesId = batchesCollection.id;
  console.log('Batches collection ID:', batchesId);

  // Get companies collection
  console.log('Getting companies collection...');
  const companiesRes = await fetch(`${POCKETBASE_URL}/api/collections/companies`, { headers: { Authorization: token } });
  if (!companiesRes.ok) {
    console.error('Companies collection not found');
    process.exit(1);
  }
  const companiesCollection = await companiesRes.json();

  // Check if batch field already exists
  const fields = companiesCollection.fields || companiesCollection.schema || [];
  const hasBatchField = fields.some(f => f.name === 'batch');

  if (hasBatchField) {
    console.log('✅ Companies collection already has batch field');
    return;
  }

  // Add batch field
  console.log('Adding batch field to companies...');
  fields.push({
    name: 'batch',
    type: 'relation',
    required: false,
    collectionId: batchesId,
    cascadeDelete: false,
    maxSelect: 1,
  });

  const updatePayload = companiesCollection.fields 
    ? { fields } 
    : { schema: fields };

  const updateRes = await fetch(`${POCKETBASE_URL}/api/collections/companies`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(updatePayload),
  });

  if (!updateRes.ok) {
    const err = await updateRes.text();
    console.error('Failed to update companies collection:', err);
    process.exit(1);
  }

  console.log('✅ Added batch field to companies collection');
  console.log('Lead companies can now be organized into batches.');
}

main().catch(console.error);
