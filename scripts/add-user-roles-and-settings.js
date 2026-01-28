/**
 * Migration Script: Add User Roles and App Settings
 * 
 * This script adds:
 * 1. A "role" field to the users collection (admin/team)
 * 2. An "app_settings" collection for system-wide configuration
 * 
 * Usage:
 * node scripts/add-user-roles-and-settings.js
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
    console.error('Or run: node scripts/add-user-roles-and-settings.js <admin_email> <admin_password>');
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
    // 1. Update users collection to add "role" field
    console.log('\n1. Adding "role" field to users collection...');
    
    const usersResponse = await fetch(`${POCKETBASE_URL}/api/collections/users`, { headers });
    const usersCollection = await usersResponse.json();
    
    // Check if role field already exists
    const hasRoleField = usersCollection.fields?.some(f => f.name === 'role') || 
                         usersCollection.schema?.some(f => f.name === 'role');
    
    if (hasRoleField) {
      console.log('  Role field already exists, skipping...');
    } else {
      // Add role field to the users collection
      const fields = usersCollection.fields || usersCollection.schema || [];
      fields.push({
        name: 'role',
        type: 'select',
        required: false,
        maxSelect: 1,
        values: ['admin', 'team'],
      });

      const updatePayload = usersCollection.fields 
        ? { fields } 
        : { schema: fields };

      const updateResponse = await fetch(`${POCKETBASE_URL}/api/collections/users`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(updatePayload),
      });

      if (!updateResponse.ok) {
        const error = await updateResponse.text();
        throw new Error(`Failed to update users collection: ${error}`);
      }
      console.log('  Added "role" field to users collection');
    }

    // 2. Create app_settings collection
    console.log('\n2. Creating app_settings collection...');
    
    // Check if collection exists
    const checkResponse = await fetch(`${POCKETBASE_URL}/api/collections/app_settings`, { headers });
    
    if (checkResponse.ok) {
      console.log('  app_settings collection already exists, skipping...');
    } else {
      const createResponse = await fetch(`${POCKETBASE_URL}/api/collections`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: 'app_settings',
          type: 'base',
          fields: [
            { name: 'key', type: 'text', required: true, min: 1, max: 100 },
            { name: 'value', type: 'json', required: false, maxSize: 50000 },
          ],
          indexes: ['CREATE UNIQUE INDEX idx_app_settings_key ON app_settings (key)'],
          listRule: '@request.auth.id != ""',
          viewRule: '@request.auth.id != ""',
          createRule: '@request.auth.id != "" && @request.auth.role = "admin"',
          updateRule: '@request.auth.id != "" && @request.auth.role = "admin"',
          deleteRule: '@request.auth.id != "" && @request.auth.role = "admin"',
        }),
      });

      if (!createResponse.ok) {
        const error = await createResponse.text();
        throw new Error(`Failed to create app_settings collection: ${error}`);
      }
      
      const collection = await createResponse.json();
      console.log(`  Created app_settings collection (ID: ${collection.id})`);
    }

    // 3. Set the current user as admin (optional prompt)
    console.log('\n3. Setting up initial admin user...');
    
    // Get the first user (or prompt for user ID)
    const usersListResponse = await fetch(`${POCKETBASE_URL}/api/collections/users/records?perPage=1`, { headers });
    const usersList = await usersListResponse.json();
    
    if (usersList.items && usersList.items.length > 0) {
      const firstUser = usersList.items[0];
      
      if (!firstUser.role) {
        const setAdminResponse = await fetch(`${POCKETBASE_URL}/api/collections/users/records/${firstUser.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ role: 'admin' }),
        });

        if (setAdminResponse.ok) {
          console.log(`  Set user "${firstUser.email}" as admin`);
        } else {
          console.log('  Could not set admin role (user may need to be set manually)');
        }
      } else {
        console.log(`  User "${firstUser.email}" already has role: ${firstUser.role}`);
      }
    } else {
      console.log('  No users found. First user to register should be set as admin manually.');
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Go to PocketBase Admin UI: http://localhost:8090/_/');
    console.log('2. Set your user role to "admin" in the users collection');
    console.log('3. You can now access Admin Settings in the CRM to configure email providers');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
