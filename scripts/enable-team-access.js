/**
 * Enable Team Access Script
 * 
 * Updates PocketBase collection rules so all authenticated users
 * can see and work on all campaigns (team collaboration).
 * 
 * Admin-only features remain restricted.
 * 
 * Usage: node scripts/enable-team-access.js
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
  const email = process.env.POCKETBASE_ADMIN_EMAIL || process.argv[2];
  const password = process.env.POCKETBASE_ADMIN_PASSWORD || process.argv[3];
  
  if (!email || !password) {
    console.error('Missing credentials. Set POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD in .env.local');
    process.exit(1);
  }

  console.log('Connecting to PocketBase at', POCKETBASE_URL);
  
  // Authenticate
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
    console.error('Authentication failed');
    process.exit(1);
  }

  const authData = await authResponse.json();
  const token = authData.token;
  console.log('Authenticated successfully!\n');

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': token,
  };

  // Collections to update with team access rules
  // All authenticated users can view/edit, but we track who created what
  const collectionsToUpdate = [
    {
      name: 'campaigns',
      rules: {
        listRule: '@request.auth.id != ""',
        viewRule: '@request.auth.id != ""',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id != ""',
        deleteRule: '@request.auth.id != "" && @request.auth.role = "admin"', // Only admins can delete campaigns
      }
    },
    {
      name: 'companies',
      rules: {
        listRule: '@request.auth.id != ""',
        viewRule: '@request.auth.id != ""',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id != ""',
        deleteRule: '@request.auth.id != ""',
      }
    },
    {
      name: 'contacts',
      rules: {
        listRule: '@request.auth.id != ""',
        viewRule: '@request.auth.id != ""',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id != ""',
        deleteRule: '@request.auth.id != ""',
      }
    },
    {
      name: 'batches',
      rules: {
        listRule: '@request.auth.id != ""',
        viewRule: '@request.auth.id != ""',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id != ""',
        deleteRule: '@request.auth.id != ""',
      }
    },
    {
      name: 'custom_fields',
      rules: {
        listRule: '@request.auth.id != ""',
        viewRule: '@request.auth.id != ""',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id != ""',
        deleteRule: '@request.auth.id != ""',
      }
    },
    {
      name: 'funnel_stages',
      rules: {
        listRule: '@request.auth.id != ""',
        viewRule: '@request.auth.id != ""',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id != ""',
        deleteRule: '@request.auth.id != ""',
      }
    },
    {
      name: 'email_template_groups',
      rules: {
        listRule: '@request.auth.id != ""',
        viewRule: '@request.auth.id != ""',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id != ""',
        deleteRule: '@request.auth.id != ""',
      }
    },
    {
      name: 'follow_up_sequences',
      rules: {
        listRule: '@request.auth.id != ""',
        viewRule: '@request.auth.id != ""',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id != ""',
        deleteRule: '@request.auth.id != ""',
      }
    },
    {
      name: 'ai_scoring_configs',
      rules: {
        listRule: '@request.auth.id != ""',
        viewRule: '@request.auth.id != ""',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id != ""',
        deleteRule: '@request.auth.id != ""',
      }
    },
  ];

  for (const collection of collectionsToUpdate) {
    try {
      // Get collection
      const getResponse = await fetch(`${POCKETBASE_URL}/api/collections/${collection.name}`, { headers });
      
      if (!getResponse.ok) {
        console.log(`⚠️  Collection '${collection.name}' not found, skipping`);
        continue;
      }

      // Update collection rules
      const updateResponse = await fetch(`${POCKETBASE_URL}/api/collections/${collection.name}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(collection.rules),
      });

      if (updateResponse.ok) {
        console.log(`✅ Updated '${collection.name}' - team access enabled`);
      } else {
        const error = await updateResponse.text();
        console.log(`❌ Failed to update '${collection.name}': ${error}`);
      }
    } catch (error) {
      console.log(`❌ Error updating '${collection.name}':`, error.message);
    }
  }

  console.log('\n✅ Team access enabled!');
  console.log('\nNow all authenticated users can:');
  console.log('  - View all campaigns');
  console.log('  - Add/edit companies, contacts, etc.');
  console.log('  - Only admins can delete campaigns');
  console.log('\nAdmin-only features (invites, settings) remain restricted.');
}

main().catch(console.error);
