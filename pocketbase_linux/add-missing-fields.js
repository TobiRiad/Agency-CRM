/**
 * Add missing fields and collections
 * 
 * Run: node add-missing-fields.js <pocketbase_url> <email> <password>
 */

const POCKETBASE_URL = process.argv[2] || 'http://localhost:8090';
const EMAIL = process.argv[3];
const PASSWORD = process.argv[4];

if (!EMAIL || !PASSWORD) {
  console.error('Usage: node add-missing-fields.js <pocketbase_url> <email> <password>');
  process.exit(1);
}

async function main() {
  console.log(`Connecting to ${POCKETBASE_URL}...`);
  
  // Authenticate
  const authResponse = await fetch(`${POCKETBASE_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: EMAIL, password: PASSWORD }),
  });

  if (!authResponse.ok) {
    console.error('Authentication failed');
    process.exit(1);
  }

  const { token } = await authResponse.json();
  const headers = { 'Content-Type': 'application/json', 'Authorization': token };
  console.log('Authenticated!\n');

  // Get collection IDs
  async function getCollectionId(name) {
    const res = await fetch(`${POCKETBASE_URL}/api/collections/${name}`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    return data.id;
  }

  const usersId = await getCollectionId('users');
  const campaignsId = await getCollectionId('campaigns');
  const companiesId = await getCollectionId('companies');
  const contactsId = await getCollectionId('contacts');

  // Helper to create collection
  async function createCollection(data) {
    console.log(`Creating collection: ${data.name}...`);
    const response = await fetch(`${POCKETBASE_URL}/api/collections`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const error = await response.text();
      if (error.includes('already exists')) {
        console.log(`  ${data.name} already exists`);
        const getResponse = await fetch(`${POCKETBASE_URL}/api/collections/${data.name}`, { headers });
        return await getResponse.json();
      }
      console.log(`  Failed: ${error}`);
      return null;
    }
    
    const collection = await response.json();
    console.log(`  Created ${data.name} (ID: ${collection.id})`);
    return collection;
  }

  // Helper to add fields to collection
  async function addFields(collectionName, newFields) {
    console.log(`\nAdding fields to ${collectionName}...`);
    
    // Get current collection
    const getRes = await fetch(`${POCKETBASE_URL}/api/collections/${collectionName}`, { headers });
    if (!getRes.ok) {
      console.log(`  Collection ${collectionName} not found`);
      return;
    }
    const collection = await getRes.json();
    
    // Add new fields
    const existingNames = collection.fields.map(f => f.name);
    const fieldsToAdd = newFields.filter(f => !existingNames.includes(f.name));
    
    if (fieldsToAdd.length === 0) {
      console.log(`  All fields already exist`);
      return;
    }

    const updatedFields = [...collection.fields, ...fieldsToAdd];
    
    const updateRes = await fetch(`${POCKETBASE_URL}/api/collections/${collectionName}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ fields: updatedFields }),
    });
    
    if (!updateRes.ok) {
      console.log(`  Failed to add fields: ${await updateRes.text()}`);
    } else {
      console.log(`  Added ${fieldsToAdd.length} fields: ${fieldsToAdd.map(f => f.name).join(', ')}`);
    }
  }

  // 1. Create batches collection
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
  const batchesId = batches?.id || await getCollectionId('batches');

  // 2. Create app_settings collection
  await createCollection({
    name: 'app_settings',
    type: 'base',
    fields: [
      { name: 'key', type: 'text', required: true, min: 1, max: 100 },
      { name: 'value', type: 'json', required: false },
    ],
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != ""',
    deleteRule: '@request.auth.id != ""',
  });

  // 3. Create ai_scoring_configs collection
  await createCollection({
    name: 'ai_scoring_configs',
    type: 'base',
    fields: [
      { name: 'campaign', type: 'relation', required: true, collectionId: campaignsId, cascadeDelete: true, maxSelect: 1 },
      { name: 'name', type: 'text', required: true, min: 1, max: 200 },
      { name: 'system_prompt', type: 'text', required: false, max: 50000 },
      { name: 'enable_score', type: 'bool', required: false },
      { name: 'score_min', type: 'number', required: false },
      { name: 'score_max', type: 'number', required: false },
      { name: 'enable_classification', type: 'bool', required: false },
      { name: 'classification_label', type: 'text', required: false, max: 100 },
      { name: 'classification_options', type: 'json', required: false },
      { name: 'custom_outputs', type: 'json', required: false },
      { name: 'model', type: 'text', required: false, max: 100 },
      { name: 'temperature', type: 'number', required: false },
    ],
    listRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    viewRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    deleteRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
  });

  // 4. Add missing fields to campaigns
  await addFields('campaigns', [
    { name: 'kind', type: 'select', required: false, maxSelect: 1, values: ['leads', 'outreach'] },
    { name: 'industry_type', type: 'select', required: false, maxSelect: 1, values: ['text', 'dropdown'] },
    { name: 'industry_options', type: 'json', required: false },
    { name: 'ai_opener_prompt', type: 'text', required: false, max: 50000 },
    { name: 'enable_firecrawl', type: 'bool', required: false },
    { name: 'firecrawl_pages', type: 'json', required: false },
  ]);

  // 5. Add missing fields to companies
  await addFields('companies', [
    { name: 'email', type: 'email', required: false },
    { name: 'description', type: 'text', required: false, max: 5000 },
    { name: 'batch', type: 'relation', required: false, collectionId: batchesId, maxSelect: 1 },
    { name: 'created_by', type: 'relation', required: false, collectionId: usersId, maxSelect: 1 },
    { name: 'ai_score', type: 'number', required: false },
    { name: 'ai_classification', type: 'text', required: false, max: 200 },
    { name: 'ai_confidence', type: 'number', required: false },
    { name: 'ai_reasons', type: 'json', required: false },
    { name: 'ai_scored_at', type: 'date', required: false },
    { name: 'ai_config_version', type: 'text', required: false, max: 50 },
    { name: 'ai_data', type: 'json', required: false },
    { name: 'firecrawl_urls', type: 'json', required: false },
    { name: 'firecrawl_content', type: 'json', required: false },
    { name: 'firecrawl_mapped_at', type: 'date', required: false },
    { name: 'firecrawl_scraped_at', type: 'date', required: false },
  ]);

  // 6. Add missing fields to contacts
  await addFields('contacts', [
    { name: 'batch', type: 'relation', required: false, collectionId: batchesId, maxSelect: 1 },
    { name: 'created_by', type: 'relation', required: false, collectionId: usersId, maxSelect: 1 },
    { name: 'source_company', type: 'relation', required: false, collectionId: companiesId, maxSelect: 1 },
    { name: 'source_contact', type: 'relation', required: false, collectionId: contactsId, maxSelect: 1 },
    { name: 'ai_opener', type: 'text', required: false, max: 5000 },
  ]);

  // 7. Add role field to users
  console.log('\nAdding role field to users...');
  const usersRes = await fetch(`${POCKETBASE_URL}/api/collections/users`, { headers });
  const usersCollection = await usersRes.json();
  const hasRole = usersCollection.fields.some(f => f.name === 'role');
  
  if (!hasRole) {
    const updatedFields = [...usersCollection.fields, 
      { name: 'role', type: 'select', required: false, maxSelect: 1, values: ['admin', 'team'] }
    ];
    const updateRes = await fetch(`${POCKETBASE_URL}/api/collections/users`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ fields: updatedFields }),
    });
    if (updateRes.ok) {
      console.log('  Added role field to users');
    } else {
      console.log('  Failed to add role field:', await updateRes.text());
    }
  } else {
    console.log('  Role field already exists');
  }

  console.log('\n✅ All missing fields and collections added!');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
