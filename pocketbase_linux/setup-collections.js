/**
 * PocketBase Collections Setup Script
 * 
 * Run this after your PocketBase is running:
 * node setup-collections.js <pocketbase_url> <superuser_email> <superuser_password>
 * 
 * Example:
 * node setup-collections.js https://your-app.railway.app admin@example.com yourpassword
 */

const POCKETBASE_URL = process.argv[2] || 'http://localhost:8090';
const EMAIL = process.argv[3];
const PASSWORD = process.argv[4];

if (!EMAIL || !PASSWORD) {
  console.error('Usage: node setup-collections.js <pocketbase_url> <email> <password>');
  process.exit(1);
}

async function main() {
  console.log(`Connecting to ${POCKETBASE_URL}...`);
  
  // Authenticate as superuser
  const authResponse = await fetch(`${POCKETBASE_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: EMAIL, password: PASSWORD }),
  });

  if (!authResponse.ok) {
    console.error('Authentication failed:', await authResponse.text());
    process.exit(1);
  }

  const { token } = await authResponse.json();
  const headers = { 'Content-Type': 'application/json', 'Authorization': token };
  console.log('Authenticated successfully!\n');

  // Get users collection ID
  const usersResponse = await fetch(`${POCKETBASE_URL}/api/collections/users`, { headers });
  const usersCollection = await usersResponse.json();
  const usersId = usersCollection.id;
  console.log(`Users collection ID: ${usersId}\n`);

  // Helper to create collection
  async function createCollection(data) {
    console.log(`Creating: ${data.name}...`);
    const response = await fetch(`${POCKETBASE_URL}/api/collections`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const error = await response.text();
      if (error.includes('already exists')) {
        console.log(`  ${data.name} already exists, fetching...`);
        const getResponse = await fetch(`${POCKETBASE_URL}/api/collections/${data.name}`, { headers });
        return await getResponse.json();
      }
      throw new Error(`Failed to create ${data.name}: ${error}`);
    }
    
    const collection = await response.json();
    console.log(`  Created ${data.name} (ID: ${collection.id})`);
    return collection;
  }

  // Helper to update collection rules
  async function updateRules(name, rules) {
    console.log(`Updating rules for: ${name}...`);
    const response = await fetch(`${POCKETBASE_URL}/api/collections/${name}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(rules),
    });
    if (!response.ok) {
      console.log(`  Warning: Could not update rules for ${name}: ${await response.text()}`);
    } else {
      console.log(`  Rules updated for ${name}`);
    }
  }

  // 1. Create campaigns (depends on users)
  const campaigns = await createCollection({
    name: 'campaigns',
    type: 'base',
    fields: [
      { name: 'user', type: 'relation', required: true, collectionId: usersId, maxSelect: 1 },
      { name: 'name', type: 'text', required: true, min: 1, max: 200 },
      { name: 'description', type: 'text', required: false, max: 2000 },
    ],
  });

  // 2. Create companies (depends on campaigns)
  const companies = await createCollection({
    name: 'companies',
    type: 'base',
    fields: [
      { name: 'campaign', type: 'relation', required: true, collectionId: campaigns.id, cascadeDelete: true, maxSelect: 1 },
      { name: 'name', type: 'text', required: true, min: 1, max: 200 },
      { name: 'website', type: 'url', required: false },
      { name: 'industry', type: 'text', required: false, max: 100 },
    ],
  });

  // 3. Create contacts (depends on campaigns, companies)
  const contacts = await createCollection({
    name: 'contacts',
    type: 'base',
    fields: [
      { name: 'company', type: 'relation', required: false, collectionId: companies.id, maxSelect: 1 },
      { name: 'campaign', type: 'relation', required: true, collectionId: campaigns.id, cascadeDelete: true, maxSelect: 1 },
      { name: 'email', type: 'email', required: true },
      { name: 'first_name', type: 'text', required: false, max: 100 },
      { name: 'last_name', type: 'text', required: false, max: 100 },
      { name: 'title', type: 'text', required: false, max: 100 },
    ],
  });

  // 4. Create custom_fields (depends on campaigns)
  const customFields = await createCollection({
    name: 'custom_fields',
    type: 'base',
    fields: [
      { name: 'campaign', type: 'relation', required: true, collectionId: campaigns.id, cascadeDelete: true, maxSelect: 1 },
      { name: 'name', type: 'text', required: true, min: 1, max: 100 },
      { name: 'field_type', type: 'select', required: true, maxSelect: 1, values: ['text', 'number', 'boolean', 'select'] },
      { name: 'options', type: 'json', required: false },
      { name: 'order', type: 'number', required: false, min: 0 },
    ],
  });

  // 5. Create contact_field_values (depends on contacts, custom_fields)
  const contactFieldValues = await createCollection({
    name: 'contact_field_values',
    type: 'base',
    fields: [
      { name: 'contact', type: 'relation', required: true, collectionId: contacts.id, cascadeDelete: true, maxSelect: 1 },
      { name: 'custom_field', type: 'relation', required: true, collectionId: customFields.id, cascadeDelete: true, maxSelect: 1 },
      { name: 'value', type: 'text', required: false, max: 5000 },
    ],
  });

  // 6. Create email_template_groups (depends on campaigns)
  const emailTemplateGroups = await createCollection({
    name: 'email_template_groups',
    type: 'base',
    fields: [
      { name: 'campaign', type: 'relation', required: true, collectionId: campaigns.id, cascadeDelete: true, maxSelect: 1 },
      { name: 'name', type: 'text', required: true, min: 1, max: 200 },
    ],
  });

  // 7. Create email_templates (depends on email_template_groups)
  const emailTemplates = await createCollection({
    name: 'email_templates',
    type: 'base',
    fields: [
      { name: 'group', type: 'relation', required: true, collectionId: emailTemplateGroups.id, cascadeDelete: true, maxSelect: 1 },
      { name: 'subject', type: 'text', required: true, min: 1, max: 500 },
      { name: 'body', type: 'text', required: true, min: 1, max: 50000 },
      { name: 'is_active', type: 'bool', required: false },
    ],
  });

  // 8. Create email_sends (depends on contacts, email_templates, campaigns)
  const emailSends = await createCollection({
    name: 'email_sends',
    type: 'base',
    fields: [
      { name: 'contact', type: 'relation', required: true, collectionId: contacts.id, maxSelect: 1 },
      { name: 'template', type: 'relation', required: true, collectionId: emailTemplates.id, maxSelect: 1 },
      { name: 'campaign', type: 'relation', required: true, collectionId: campaigns.id, maxSelect: 1 },
      { name: 'resend_id', type: 'text', required: false, max: 100 },
      { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed'] },
      { name: 'sent_at', type: 'date', required: false },
      { name: 'delivered_at', type: 'date', required: false },
      { name: 'opened_at', type: 'date', required: false },
      { name: 'clicked_at', type: 'date', required: false },
      { name: 'bounced_at', type: 'date', required: false },
      { name: 'error_message', type: 'text', required: false, max: 1000 },
    ],
  });

  // 9. Create funnel_stages (depends on campaigns)
  const funnelStages = await createCollection({
    name: 'funnel_stages',
    type: 'base',
    fields: [
      { name: 'campaign', type: 'relation', required: true, collectionId: campaigns.id, cascadeDelete: true, maxSelect: 1 },
      { name: 'name', type: 'text', required: true, min: 1, max: 100 },
      { name: 'order', type: 'number', required: false, min: 0 },
      { name: 'color', type: 'text', required: false, max: 20 },
    ],
  });

  // 10. Create contact_stages (depends on contacts, funnel_stages)
  const contactStages = await createCollection({
    name: 'contact_stages',
    type: 'base',
    fields: [
      { name: 'contact', type: 'relation', required: true, collectionId: contacts.id, cascadeDelete: true, maxSelect: 1 },
      { name: 'stage', type: 'relation', required: true, collectionId: funnelStages.id, cascadeDelete: true, maxSelect: 1 },
      { name: 'moved_at', type: 'date', required: false },
    ],
  });

  // 11. Create follow_up_sequences (depends on campaigns)
  const followUpSequences = await createCollection({
    name: 'follow_up_sequences',
    type: 'base',
    fields: [
      { name: 'campaign', type: 'relation', required: true, collectionId: campaigns.id, cascadeDelete: true, maxSelect: 1 },
      { name: 'name', type: 'text', required: true, min: 1, max: 200 },
      { name: 'is_active', type: 'bool', required: false },
    ],
  });

  // 12. Create follow_up_steps (depends on follow_up_sequences, email_template_groups)
  const followUpSteps = await createCollection({
    name: 'follow_up_steps',
    type: 'base',
    fields: [
      { name: 'sequence', type: 'relation', required: true, collectionId: followUpSequences.id, cascadeDelete: true, maxSelect: 1 },
      { name: 'template_group', type: 'relation', required: true, collectionId: emailTemplateGroups.id, maxSelect: 1 },
      { name: 'delay_days', type: 'number', required: true, min: 1, max: 365 },
      { name: 'order', type: 'number', required: false, min: 0 },
    ],
  });

  console.log('\n--- All collections created! ---\n');

  // Now update API rules
  console.log('Setting up API rules...\n');

  await updateRules('campaigns', {
    listRule: '@request.auth.id != "" && user = @request.auth.id',
    viewRule: '@request.auth.id != "" && user = @request.auth.id',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != "" && user = @request.auth.id',
    deleteRule: '@request.auth.id != "" && user = @request.auth.id',
  });

  await updateRules('companies', {
    listRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    viewRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    deleteRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
  });

  await updateRules('contacts', {
    listRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    viewRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    deleteRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
  });

  await updateRules('custom_fields', {
    listRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    viewRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    deleteRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
  });

  await updateRules('contact_field_values', {
    listRule: '@request.auth.id != "" && contact.campaign.user = @request.auth.id',
    viewRule: '@request.auth.id != "" && contact.campaign.user = @request.auth.id',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != "" && contact.campaign.user = @request.auth.id',
    deleteRule: '@request.auth.id != "" && contact.campaign.user = @request.auth.id',
  });

  await updateRules('email_template_groups', {
    listRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    viewRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    deleteRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
  });

  await updateRules('email_templates', {
    listRule: '@request.auth.id != "" && group.campaign.user = @request.auth.id',
    viewRule: '@request.auth.id != "" && group.campaign.user = @request.auth.id',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != "" && group.campaign.user = @request.auth.id',
    deleteRule: '@request.auth.id != "" && group.campaign.user = @request.auth.id',
  });

  await updateRules('email_sends', {
    listRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    viewRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    deleteRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
  });

  await updateRules('funnel_stages', {
    listRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    viewRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    deleteRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
  });

  await updateRules('contact_stages', {
    listRule: '@request.auth.id != "" && contact.campaign.user = @request.auth.id',
    viewRule: '@request.auth.id != "" && contact.campaign.user = @request.auth.id',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != "" && contact.campaign.user = @request.auth.id',
    deleteRule: '@request.auth.id != "" && contact.campaign.user = @request.auth.id',
  });

  await updateRules('follow_up_sequences', {
    listRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    viewRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    deleteRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
  });

  await updateRules('follow_up_steps', {
    listRule: '@request.auth.id != "" && sequence.campaign.user = @request.auth.id',
    viewRule: '@request.auth.id != "" && sequence.campaign.user = @request.auth.id',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != "" && sequence.campaign.user = @request.auth.id',
    deleteRule: '@request.auth.id != "" && sequence.campaign.user = @request.auth.id',
  });

  console.log('\n✅ Setup complete! All collections and rules are configured.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
