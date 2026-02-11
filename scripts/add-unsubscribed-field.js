/**
 * Migration Script: Add unsubscribed field to contacts collection
 * 
 * Adds:
 * - unsubscribed (bool) - whether the contact has unsubscribed from emails
 * 
 * Usage:
 *   node scripts/add-unsubscribed-field.js
 * 
 * For production:
 *   POCKETBASE_URL=https://agency-crm-production-2b07.up.railway.app node scripts/add-unsubscribed-field.js
 */

const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
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
    console.log('\n1. Adding unsubscribed field to contacts collection...');

    const contactsResponse = await fetch(`${POCKETBASE_URL}/api/collections/contacts`, { headers });
    const contactsCollection = await contactsResponse.json();
    const contactsFields = contactsCollection.fields || contactsCollection.schema || [];

    const hasField = contactsFields.some(f => f.name === 'unsubscribed');
    if (!hasField) {
      contactsFields.push({ name: 'unsubscribed', type: 'bool', required: false });
      console.log('  + Added unsubscribed field');

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
      console.log('  ✓ Contacts collection updated');
    } else {
      console.log('  - unsubscribed already exists, skipping');
    }

    console.log('\n✓ Migration completed successfully!');
    console.log('\nChanges made:');
    console.log('  Contacts: unsubscribed (bool) - marks contacts who opted out of emails');

  } catch (error) {
    console.error('\n✗ Migration failed:', error);
    process.exit(1);
  }
}

main();
