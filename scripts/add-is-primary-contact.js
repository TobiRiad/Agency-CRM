/**
 * Migration Script: Add is_primary field to contacts collection
 * 
 * Adds:
 * - is_primary (bool) - whether this is the primary contact for the company
 *   Primary contacts are the ones that get pushed to outreach campaigns.
 *   Secondary contacts are stored as alternatives.
 * 
 * Usage:
 *   node scripts/add-is-primary-contact.js
 * 
 * For production:
 *   POCKETBASE_URL=https://your-prod-url.com node scripts/add-is-primary-contact.js
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
      process.env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
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
    // ========================================
    // 1. Add is_primary field to contacts
    // ========================================
    console.log('\n1. Adding is_primary field to contacts collection...');

    const contactsResponse = await fetch(`${POCKETBASE_URL}/api/collections/contacts`, { headers });
    const contactsCollection = await contactsResponse.json();
    const contactsFields = contactsCollection.fields || contactsCollection.schema || [];

    const hasIsPrimary = contactsFields.some(f => f.name === 'is_primary');
    if (!hasIsPrimary) {
      contactsFields.push({ name: 'is_primary', type: 'bool', required: false });
      console.log('  + Added is_primary field');

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
      console.log('  - is_primary already exists, skipping');
    }

    // ========================================
    // Summary
    // ========================================
    console.log('\n✓ Migration completed successfully!');
    console.log('\nChanges made:');
    console.log('  Contacts: is_primary (bool) - marks the primary contact for a company');

  } catch (error) {
    console.error('\n✗ Migration failed:', error);
    process.exit(1);
  }
}

main();
