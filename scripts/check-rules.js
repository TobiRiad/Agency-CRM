const POCKETBASE_URL = 'http://localhost:8090';

async function main() {
  const [,, email, password] = process.argv;
  
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

  const { token } = await authResponse.json();
  const headers = { 'Authorization': token };

  // Fetch campaigns collection
  const response = await fetch(`${POCKETBASE_URL}/api/collections/campaigns`, { headers });
  const collection = await response.json();
  
  console.log('Campaigns collection rules:');
  console.log('  listRule:', JSON.stringify(collection.listRule));
  console.log('  viewRule:', JSON.stringify(collection.viewRule));
  console.log('  createRule:', JSON.stringify(collection.createRule));
  console.log('  updateRule:', JSON.stringify(collection.updateRule));
  console.log('  deleteRule:', JSON.stringify(collection.deleteRule));
  console.log('\nFields:');
  collection.fields?.forEach(f => {
    if (!f.system) console.log(`  - ${f.name} (${f.type})`);
  });
}

main().catch(console.error);
