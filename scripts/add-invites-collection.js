/**
 * Add Invites Collection Script
 * 
 * Creates the invites collection for invite-only registration.
 * 
 * Usage:
 * 1. Make sure PocketBase is running
 * 2. Run: node scripts/add-invites-collection.js
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
  // Use env vars, with command line as fallback
  const email = process.env.POCKETBASE_ADMIN_EMAIL || process.argv[2];
  const password = process.env.POCKETBASE_ADMIN_PASSWORD || process.argv[3];
  
  if (!email || !password) {
    console.error('Missing credentials. Set POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD in .env.local');
    console.error('Or run: node scripts/add-invites-collection.js <admin_email> <admin_password>');
    process.exit(1);
  }

  console.log('Connecting to PocketBase at', POCKETBASE_URL);
  console.log('Authenticating...');
  
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

  // Check if invites collection already exists
  const checkResponse = await fetch(`${POCKETBASE_URL}/api/collections/invites`, { headers });
  if (checkResponse.ok) {
    console.log('Invites collection already exists, skipping creation');
    return;
  }

  // Get users collection ID
  const usersResponse = await fetch(`${POCKETBASE_URL}/api/collections/users`, { headers });
  const usersCollection = await usersResponse.json();
  const usersId = usersCollection.id;
  console.log(`Users collection ID: ${usersId}`);

  console.log('Creating invites collection...');

  // Create invites collection
  const createResponse = await fetch(`${POCKETBASE_URL}/api/collections`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'invites',
      type: 'base',
      fields: [
        { name: 'email', type: 'email', required: true },
        { name: 'token', type: 'text', required: true, min: 32, max: 64 },
        { name: 'used', type: 'bool', required: false },
        { name: 'used_at', type: 'date', required: false },
        { name: 'used_by', type: 'relation', required: false, collectionId: usersId, cascadeDelete: false, maxSelect: 1 },
        { name: 'expires_at', type: 'date', required: false },
        { name: 'created_by', type: 'relation', required: false, collectionId: usersId, cascadeDelete: false, maxSelect: 1 },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_invites_token ON invites (token)',
        'CREATE INDEX idx_invites_email ON invites (email)',
      ],
      // Only admins can manage invites, public can view for token validation
      listRule: '@request.auth.id != "" && @request.auth.role = "admin"',
      viewRule: null, // Public access needed for token validation
      createRule: '@request.auth.id != "" && @request.auth.role = "admin"',
      updateRule: '@request.auth.id != "" && @request.auth.role = "admin"',
      deleteRule: '@request.auth.id != "" && @request.auth.role = "admin"',
    }),
  });

  if (!createResponse.ok) {
    const error = await createResponse.text();
    console.error('Failed to create invites collection:', error);
    process.exit(1);
  }

  const collection = await createResponse.json();
  console.log(`✅ Invites collection created successfully! (ID: ${collection.id})`);
  console.log('\nYou can now:');
  console.log('1. Go to Admin Settings in the app');
  console.log('2. Create invites for new team members');
  console.log('3. Share the invite links with them to register');
}

main().catch(console.error);
