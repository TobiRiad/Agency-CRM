/**
 * Migration Script: Add pushed_to_campaigns field for tracking pushed companies
 * 
 * Adds:
 * 1. pushed_to_campaigns (json) to companies collection
 *    - Stores an array of outreach campaign IDs that this lead company has been pushed to
 * 
 * Usage:
 * node scripts/add-pushed-to-campaigns.js
 * 
 * For production:
 * POCKETBASE_URL=https://agency-crm-production-2b07.up.railway.app node scripts/add-pushed-to-campaigns.js
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
        // Get companies collection
        console.log('\nGetting companies collection...');

        const companiesResponse = await fetch(`${POCKETBASE_URL}/api/collections/companies`, { headers });
        if (!companiesResponse.ok) {
            throw new Error('Companies collection not found');
        }
        const companiesCollection = await companiesResponse.json();

        const fields = companiesCollection.fields || companiesCollection.schema || [];

        // Check if pushed_to_campaigns field already exists
        const hasPushedToCampaigns = fields.some(f => f.name === 'pushed_to_campaigns');

        if (hasPushedToCampaigns) {
            console.log('✅ Companies collection already has pushed_to_campaigns field');
            return;
        }

        // Add pushed_to_campaigns field
        console.log('Adding pushed_to_campaigns field to companies...');
        fields.push({
            name: 'pushed_to_campaigns',
            type: 'json',
            required: false,
        });

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

        console.log('✅ Added pushed_to_campaigns field to companies collection');
        console.log('\nThis field tracks which outreach campaigns a lead company has been pushed to.');
        console.log('When a company is pushed to an outreach campaign, the campaign ID is added to this array.');
        console.log('The UI will display a checkmark and show which campaigns the company was pushed to.');
    } catch (error) {
        console.error('\n✗ Migration failed:', error);
        process.exit(1);
    }
}

main().catch(console.error);
