/**
 * Migration Script: Add Hunter.io settings for lead campaigns
 * 
 * Adds:
 * 1. enable_hunter (boolean) to campaigns collection - defaults to true
 * 
 * Usage:
 * node scripts/add-hunter-fields.js
 * 
 * For production:
 * POCKETBASE_URL=https://agency-crm-production-2b07.up.railway.app node scripts/add-hunter-fields.js
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
        // Get campaigns collection
        console.log('\nGetting campaigns collection...');

        const campaignsResponse = await fetch(`${POCKETBASE_URL}/api/collections/campaigns`, { headers });
        if (!campaignsResponse.ok) {
            throw new Error('Campaigns collection not found');
        }
        const campaignsCollection = await campaignsResponse.json();

        const fields = campaignsCollection.fields || campaignsCollection.schema || [];

        // Check if enable_hunter field already exists
        const hasEnableHunter = fields.some(f => f.name === 'enable_hunter');

        if (hasEnableHunter) {
            console.log('✅ Campaigns collection already has enable_hunter field');
            return;
        }

        // Add enable_hunter field
        console.log('Adding enable_hunter field to campaigns...');
        fields.push({
            name: 'enable_hunter',
            type: 'bool',
            required: false,
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

        console.log('✅ Added enable_hunter field to campaigns collection');
        console.log('\nThis field enables/disables Hunter.io people discovery for lead campaigns.');
        console.log('Default is enabled (true) for new campaigns.');
    } catch (error) {
        console.error('\n✗ Migration failed:', error);
        process.exit(1);
    }
}

main().catch(console.error);
