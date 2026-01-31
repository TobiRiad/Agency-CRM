/**
 * Fix Batches Collection - Add autodate fields
 * 
 * This script adds the missing created/updated autodate fields to the batches collection.
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

  // Get current batches collection
  console.log('Getting batches collection...');
  const getRes = await fetch(`${POCKETBASE_URL}/api/collections/batches`, { headers: { Authorization: token } });
  const collection = await getRes.json();
  
  // Check if created field already exists
  const hasCreated = collection.fields?.some(f => f.name === 'created');
  const hasUpdated = collection.fields?.some(f => f.name === 'updated');
  
  if (hasCreated && hasUpdated) {
    console.log('✅ Collection already has created/updated fields');
    return;
  }

  console.log('Adding autodate fields...');
  
  // Build new fields array preserving existing fields
  const newFields = [...collection.fields];
  
  if (!hasCreated) {
    newFields.push({
      name: 'created',
      type: 'autodate',
      system: false,
      hidden: false,
      onCreate: { enabled: true },
      onUpdate: { enabled: false },
    });
  }
  
  if (!hasUpdated) {
    newFields.push({
      name: 'updated',
      type: 'autodate',
      system: false,
      hidden: false,
      onCreate: { enabled: true },
      onUpdate: { enabled: true },
    });
  }

  const updateRes = await fetch(`${POCKETBASE_URL}/api/collections/batches`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields: newFields }),
  });

  if (!updateRes.ok) {
    const err = await updateRes.text();
    console.error('Failed to update:', err);
    process.exit(1);
  }

  console.log('✅ Added created/updated autodate fields to batches collection');
}

main().catch(console.error);
