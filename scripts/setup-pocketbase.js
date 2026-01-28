/**
 * PocketBase Setup Script
 * 
 * This script creates all the necessary collections for the CRM.
 * 
 * Usage:
 * 1. Start PocketBase: cd pocketbase && ./pocketbase.exe serve
 * 2. Create an admin account at http://localhost:8090/_/
 * 3. Run: node scripts/setup-pocketbase.js <admin_email> <admin_password>
 */

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://localhost:8090';

async function main() {
  const [,, email, password] = process.argv;
  
  if (!email || !password) {
    console.error('Usage: node setup-pocketbase.js <admin_email> <admin_password>');
    console.error('Example: node setup-pocketbase.js admin@example.com mypassword123');
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

  // Helper to delete a collection if it exists
  async function deleteCollection(name) {
    try {
      const response = await fetch(`${POCKETBASE_URL}/api/collections/${name}`, {
        method: 'DELETE',
        headers,
      });
      if (response.ok) {
        console.log(`  Deleted existing ${name}`);
      }
    } catch (e) {}
  }

  // Helper to create a collection with fields (new PocketBase v0.23+ format)
  async function createCollection(data) {
    console.log(`Creating collection: ${data.name}...`);
    
    const response = await fetch(`${POCKETBASE_URL}/api/collections`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create ${data.name}: ${error}`);
    }
    
    const collection = await response.json();
    console.log(`  Created ${data.name} (ID: ${collection.id})`);
    return collection;
  }

  // Get users collection ID
  const usersResponse = await fetch(`${POCKETBASE_URL}/api/collections/users`, { headers });
  const usersCollection = await usersResponse.json();
  const usersId = usersCollection.id;
  console.log(`Users collection ID: ${usersId}`);

  // Delete existing collections in reverse order (to handle foreign keys)
  console.log('\nDeleting existing collections...');
  const collectionsToDelete = [
    'follow_up_steps', 'follow_up_sequences', 'contact_stages', 'funnel_stages',
    'email_sends', 'email_templates', 'email_template_groups', 'contact_field_values',
    'custom_fields', 'contacts', 'batches', 'companies', 'campaigns'
  ];
  for (const name of collectionsToDelete) {
    await deleteCollection(name);
  }

  try {
    // 1. Create campaigns - using "fields" array (new format)
    const campaigns = await createCollection({
      name: 'campaigns',
      type: 'base',
      fields: [
        { name: 'user', type: 'relation', required: true, collectionId: usersId, cascadeDelete: false, maxSelect: 1 },
        { name: 'name', type: 'text', required: true, min: 1, max: 200 },
        { name: 'description', type: 'text', required: false, max: 2000 },
      ],
      listRule: '@request.auth.id != "" && user = @request.auth.id',
      viewRule: '@request.auth.id != "" && user = @request.auth.id',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != "" && user = @request.auth.id',
      deleteRule: '@request.auth.id != "" && user = @request.auth.id',
    });

    // 2. Create companies
    const companies = await createCollection({
      name: 'companies',
      type: 'base',
      fields: [
        { name: 'campaign', type: 'relation', required: true, collectionId: campaigns.id, cascadeDelete: true, maxSelect: 1 },
        { name: 'name', type: 'text', required: true, min: 1, max: 200 },
        { name: 'website', type: 'url', required: false },
        { name: 'industry', type: 'text', required: false, max: 100 },
        { name: 'created_by', type: 'relation', required: false, collectionId: usersId, cascadeDelete: false, maxSelect: 1 },
      ],
      listRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
      viewRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
      deleteRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    });

    // 3. Create batches
    const batches = await createCollection({
      name: 'batches',
      type: 'base',
      fields: [
        { name: 'campaign', type: 'relation', required: true, collectionId: campaigns.id, cascadeDelete: true, maxSelect: 1 },
        { name: 'name', type: 'text', required: true, min: 1, max: 100 },
      ],
      listRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
      viewRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
      deleteRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    });

    // 4. Create contacts
    const contacts = await createCollection({
      name: 'contacts',
      type: 'base',
      fields: [
        { name: 'campaign', type: 'relation', required: true, collectionId: campaigns.id, cascadeDelete: true, maxSelect: 1 },
        { name: 'company', type: 'relation', required: false, collectionId: companies.id, cascadeDelete: false, maxSelect: 1 },
        { name: 'batch', type: 'relation', required: false, collectionId: batches.id, cascadeDelete: false, maxSelect: 1 },
        { name: 'email', type: 'email', required: true },
        { name: 'first_name', type: 'text', required: false, max: 100 },
        { name: 'last_name', type: 'text', required: false, max: 100 },
        { name: 'title', type: 'text', required: false, max: 100 },
        { name: 'created_by', type: 'relation', required: false, collectionId: usersId, cascadeDelete: false, maxSelect: 1 },
      ],
      listRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
      viewRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
      deleteRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    });

    // 5. Create custom_fields
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
      listRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
      viewRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
      deleteRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    });

    // 6. Create contact_field_values
    const contactFieldValues = await createCollection({
      name: 'contact_field_values',
      type: 'base',
      fields: [
        { name: 'contact', type: 'relation', required: true, collectionId: contacts.id, cascadeDelete: true, maxSelect: 1 },
        { name: 'custom_field', type: 'relation', required: true, collectionId: customFields.id, cascadeDelete: true, maxSelect: 1 },
        { name: 'value', type: 'text', required: false, max: 5000 },
      ],
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
    });

    // 7. Create email_template_groups
    const emailTemplateGroups = await createCollection({
      name: 'email_template_groups',
      type: 'base',
      fields: [
        { name: 'campaign', type: 'relation', required: true, collectionId: campaigns.id, cascadeDelete: true, maxSelect: 1 },
        { name: 'name', type: 'text', required: true, min: 1, max: 200 },
      ],
      listRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
      viewRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
      deleteRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    });

    // 8. Create email_templates
    const emailTemplates = await createCollection({
      name: 'email_templates',
      type: 'base',
      fields: [
        { name: 'group', type: 'relation', required: true, collectionId: emailTemplateGroups.id, cascadeDelete: true, maxSelect: 1 },
        { name: 'subject', type: 'text', required: true, min: 1, max: 500 },
        { name: 'body', type: 'text', required: true, min: 1, max: 50000 },
        { name: 'is_active', type: 'bool', required: false },
      ],
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
    });

    // 9. Create email_sends
    const emailSends = await createCollection({
      name: 'email_sends',
      type: 'base',
      fields: [
        { name: 'contact', type: 'relation', required: true, collectionId: contacts.id, cascadeDelete: false, maxSelect: 1 },
        { name: 'template', type: 'relation', required: true, collectionId: emailTemplates.id, cascadeDelete: false, maxSelect: 1 },
        { name: 'campaign', type: 'relation', required: true, collectionId: campaigns.id, cascadeDelete: false, maxSelect: 1 },
        { name: 'resend_id', type: 'text', required: false, max: 100 },
        { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed'] },
        { name: 'sent_at', type: 'date', required: false },
        { name: 'delivered_at', type: 'date', required: false },
        { name: 'opened_at', type: 'date', required: false },
        { name: 'clicked_at', type: 'date', required: false },
        { name: 'bounced_at', type: 'date', required: false },
        { name: 'error_message', type: 'text', required: false, max: 1000 },
      ],
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
    });

    // 10. Create funnel_stages
    const funnelStages = await createCollection({
      name: 'funnel_stages',
      type: 'base',
      fields: [
        { name: 'campaign', type: 'relation', required: true, collectionId: campaigns.id, cascadeDelete: true, maxSelect: 1 },
        { name: 'name', type: 'text', required: true, min: 1, max: 100 },
        { name: 'order', type: 'number', required: false, min: 0 },
        { name: 'color', type: 'text', required: false, max: 20 },
      ],
      listRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
      viewRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
      deleteRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    });

    // 11. Create contact_stages
    const contactStages = await createCollection({
      name: 'contact_stages',
      type: 'base',
      fields: [
        { name: 'contact', type: 'relation', required: true, collectionId: contacts.id, cascadeDelete: true, maxSelect: 1 },
        { name: 'stage', type: 'relation', required: true, collectionId: funnelStages.id, cascadeDelete: true, maxSelect: 1 },
        { name: 'moved_at', type: 'date', required: false },
      ],
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
    });

    // 12. Create follow_up_sequences
    const followUpSequences = await createCollection({
      name: 'follow_up_sequences',
      type: 'base',
      fields: [
        { name: 'campaign', type: 'relation', required: true, collectionId: campaigns.id, cascadeDelete: true, maxSelect: 1 },
        { name: 'name', type: 'text', required: true, min: 1, max: 200 },
        { name: 'is_active', type: 'bool', required: false },
      ],
      listRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
      viewRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
      deleteRule: '@request.auth.id != "" && campaign.user = @request.auth.id',
    });

    // 13. Create follow_up_steps
    const followUpSteps = await createCollection({
      name: 'follow_up_steps',
      type: 'base',
      fields: [
        { name: 'sequence', type: 'relation', required: true, collectionId: followUpSequences.id, cascadeDelete: true, maxSelect: 1 },
        { name: 'template_group', type: 'relation', required: true, collectionId: emailTemplateGroups.id, cascadeDelete: false, maxSelect: 1 },
        { name: 'delay_days', type: 'number', required: true, min: 1, max: 365 },
        { name: 'order', type: 'number', required: false, min: 0 },
      ],
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
    });

    console.log('\n✅ All collections created successfully with proper rules!');
    console.log('\nYou can now:');
    console.log('1. Run: npm run dev');
    console.log('2. Open: http://localhost:3000');
    console.log('3. Register a new user account');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
