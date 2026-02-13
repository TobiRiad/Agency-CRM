/**
 * Migration: Add email_provider field to companies collection
 *
 * Usage:
 *   NEXT_PUBLIC_POCKETBASE_URL=https://agency-crm-production-2b07.up.railway.app node scripts/add-email-provider-field.js
 */
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      if (!process.env[key]) process.env[key] = trimmed.slice(eqIdx + 1).trim();
    }
  });
}
const PB = process.env.POCKETBASE_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://localhost:8090';

async function main() {
  console.log('Using PocketBase at:', PB);
  const email = process.env.POCKETBASE_ADMIN_EMAIL;
  const password = process.env.POCKETBASE_ADMIN_PASSWORD;
  if (!email || !password) { console.error('Missing credentials.'); process.exit(1); }

  let authRes = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: email, password }),
  });
  if (!authRes.ok) {
    authRes = await fetch(`${PB}/api/admins/auth-with-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: email, password }),
    });
  }
  if (!authRes.ok) { console.error('Auth failed:', await authRes.text()); process.exit(1); }
  const { token } = await authRes.json();
  const headers = { 'Content-Type': 'application/json', 'Authorization': token };

  console.log('Adding email_provider field to companies...');
  const colRes = await fetch(`${PB}/api/collections/companies`, { headers });
  const col = await colRes.json();
  const fields = col.fields || col.schema || [];

  if (fields.some(f => f.name === 'email_provider')) {
    console.log('  - email_provider already exists, skipping');
  } else {
    fields.push({ name: 'email_provider', type: 'text', required: false });
    const payload = col.fields ? { fields } : { schema: fields };
    const updateRes = await fetch(`${PB}/api/collections/companies`, {
      method: 'PATCH', headers, body: JSON.stringify(payload),
    });
    if (!updateRes.ok) { console.error('Failed:', await updateRes.text()); process.exit(1); }
    console.log('  ✓ Added email_provider field');
  }
  console.log('✓ Done!');
}
main();
