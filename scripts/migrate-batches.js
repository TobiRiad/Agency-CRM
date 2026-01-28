/**
 * Migration Script: Add Batches Collection and created_by fields
 * 
 * This script:
 * 1. Creates the 'batches' collection if it doesn't exist
 * 2. Adds 'batch' and 'created_by' fields to contacts collection
 * 3. Adds 'created_by' field to companies collection
 * 4. Sets existing records' created_by to the campaign owner
 * 
 * Usage: node scripts/migrate-batches.js <admin_email> <admin_password>
 */

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://localhost:8090';

async function main() {
  const [,, email, password] = process.argv;
  
  if (!email || !password) {
    console.error('Usage: node migrate-batches.js <admin_email> <admin_password>');
    process.exit(1);
  }

  console.log('Authenticating with PocketBase...');
  
  // Try new endpoint first (PocketBase v0.23+), then fallback
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
  console.log('Authenticated successfully!');

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': token,
  };

  // Get collection IDs
  async function getCollectionId(name) {
    const response = await fetch(`${POCKETBASE_URL}/api/collections/${name}`, { headers });
    if (!response.ok) return null;
    const data = await response.json();
    return data.id;
  }

  // Get collection schema
  async function getCollection(name) {
    const response = await fetch(`${POCKETBASE_URL}/api/collections/${name}`, { headers });
    if (!response.ok) return null;
    return await response.json();
  }

  // Update collection schema
  async function updateCollection(name, updates) {
    const response = await fetch(`${POCKETBASE_URL}/api/collections/${name}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(updates),
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to update ${name}: ${error}`);
    }
    return await response.json();
  }

  // Create collection
  async function createCollection(data) {
    const response = await fetch(`${POCKETBASE_URL}/api/collections`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create collection: ${error}`);
    }
    return await response.json();
  }

  try {
    // Get necessary collection IDs
    const usersId = await getCollectionId('users');
    const campaignsId = await getCollectionId('campaigns');
    
    if (!usersId || !campaignsId) {
      console.error('Required collections not found. Run setup-pocketbase.js first.');
      process.exit(1);
    }

    console.log('\n1. Checking batches collection...');
    let batchesId = await getCollectionId('batches');
    
    if (!batchesId) {
      console.log('   Creating batches collection...');
      const batches = await createCollection({
        name: 'batches',
        type: 'base',
        fields: [
          { name: 'campaign', type: 'relation', required: true, collectionId: campaignsId, cascadeDelete: true, maxSelect: 1 },
          { name: 'name', type: 'text', required: true, min: 1, max: 100 },
        ],
        listRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
        viewRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
        deleteRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
      });
      batchesId = batches.id;
      console.log('   ✅ Created batches collection');
    } else {
      console.log('   ✅ Batches collection already exists');
    }

    // Check and update contacts collection
    console.log('\n2. Checking contacts collection...');
    const contacts = await getCollection('contacts');
    
    if (contacts) {
      const fields = contacts.fields || [];
      const hasBatch = fields.some(f => f.name === 'batch');
      const hasCreatedBy = fields.some(f => f.name === 'created_by');
      
      if (!hasBatch || !hasCreatedBy) {
        const newFields = [...fields];
        
        if (!hasBatch) {
          console.log('   Adding batch field...');
          newFields.push({
            name: 'batch',
            type: 'relation',
            required: false,
            collectionId: batchesId,
            cascadeDelete: false,
            maxSelect: 1,
          });
        }
        
        if (!hasCreatedBy) {
          console.log('   Adding created_by field...');
          newFields.push({
            name: 'created_by',
            type: 'relation',
            required: false,
            collectionId: usersId,
            cascadeDelete: false,
            maxSelect: 1,
          });
        }
        
        await updateCollection('contacts', { fields: newFields });
        console.log('   ✅ Updated contacts collection');
      } else {
        console.log('   ✅ Contacts collection already has required fields');
      }
    }

    // Check and update companies collection
    console.log('\n3. Checking companies collection...');
    const companies = await getCollection('companies');
    
    if (companies) {
      const fields = companies.fields || [];
      const hasCreatedBy = fields.some(f => f.name === 'created_by');
      
      if (!hasCreatedBy) {
        console.log('   Adding created_by field...');
        const newFields = [...fields, {
          name: 'created_by',
          type: 'relation',
          required: false,
          collectionId: usersId,
          cascadeDelete: false,
          maxSelect: 1,
        }];
        
        await updateCollection('companies', { fields: newFields });
        console.log('   ✅ Updated companies collection');
      } else {
        console.log('   ✅ Companies collection already has created_by field');
      }
    }

    // Set created_by for existing records
    console.log('\n4. Setting created_by for existing records...');
    
    // Get all campaigns with their owners
    const campaignsResponse = await fetch(`${POCKETBASE_URL}/api/collections/campaigns/records?perPage=500`, { headers });
    const campaignsData = await campaignsResponse.json();
    const campaigns = campaignsData.items || [];
    
    for (const campaign of campaigns) {
      const ownerId = campaign.user;
      
      // Update contacts without created_by
      const contactsResponse = await fetch(
        `${POCKETBASE_URL}/api/collections/contacts/records?filter=${encodeURIComponent(`campaign="${campaign.id}" && created_by=""`)}`,
        { headers }
      );
      const contactsData = await contactsResponse.json();
      
      for (const contact of (contactsData.items || [])) {
        await fetch(`${POCKETBASE_URL}/api/collections/contacts/records/${contact.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ created_by: ownerId }),
        });
      }
      
      // Update companies without created_by
      const companiesResponse = await fetch(
        `${POCKETBASE_URL}/api/collections/companies/records?filter=${encodeURIComponent(`campaign="${campaign.id}" && created_by=""`)}`,
        { headers }
      );
      const companiesData = await companiesResponse.json();
      
      for (const company of (companiesData.items || [])) {
        await fetch(`${POCKETBASE_URL}/api/collections/companies/records/${company.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ created_by: ownerId }),
        });
      }
    }
    
    console.log('   ✅ Updated existing records');

    console.log('\n✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
