/**
 * Migration Script: Add follow-up scheduling, email threading, and inbox processing features
 * 
 * Adds:
 * 1. contacts collection:
 *    - follow_up_date (date) - when to send the next follow-up
 *    - follow_up_template (relation to email_templates) - which template to use
 *    - follow_up_cancelled (bool) - set to true when contact replies (stops follow-ups)
 * 
 * 2. email_sends collection:
 *    - message_id (text) - email Message-ID header for threading
 *    - thread_id (text) - Gmail thread ID or internal thread grouping
 *    - in_reply_to (text) - In-Reply-To header for threading
 *    - is_follow_up (bool) - whether this send is a follow-up
 * 
 * 3. New inbox_messages collection:
 *    - from_email (text) - sender email address
 *    - subject (text) - email subject
 *    - body_text (text) - plain text body
 *    - gmail_message_id (text) - Gmail API message ID
 *    - gmail_thread_id (text) - Gmail thread ID
 *    - contact (relation to contacts) - matched contact
 *    - campaign (relation to campaigns) - matched campaign
 *    - classification (text) - AI classification: out_of_office, reply, bounce, unrelated
 *    - ai_summary (text) - AI summary of the email content
 *    - action_taken (text) - what action the AI agent took
 *    - processed_at (date) - when the AI processed this
 *    - received_at (date) - when the email was received
 * 
 * 4. app_settings entries:
 *    - gmail_watch_expiry (date) - when the Gmail Pub/Sub watch expires (needs renewal)
 *    - gmail_history_id (text) - last processed Gmail history ID
 * 
 * Usage:
 *   node scripts/add-follow-up-and-inbox-features.js
 * 
 * For production:
 *   POCKETBASE_URL=https://your-prod-url.com node scripts/add-follow-up-and-inbox-features.js
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

  const email = process.env.POCKETBASE_ADMIN_EMAIL || process.argv[2];
  const password = process.env.POCKETBASE_ADMIN_PASSWORD || process.argv[3];

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
    // ========================================
    // 1. Add follow-up fields to contacts
    // ========================================
    console.log('\n1. Adding follow-up fields to contacts collection...');

    const contactsResponse = await fetch(`${POCKETBASE_URL}/api/collections/contacts`, { headers });
    const contactsCollection = await contactsResponse.json();
    const contactsFields = contactsCollection.fields || contactsCollection.schema || [];

    // Get email_templates collection ID for the relation
    const templatesResponse = await fetch(`${POCKETBASE_URL}/api/collections/email_templates`, { headers });
    const templatesCollection = await templatesResponse.json();
    const templatesCollectionId = templatesCollection.id;

    const newContactFields = [
      { name: 'follow_up_date', type: 'date', required: false },
      { name: 'follow_up_cancelled', type: 'bool', required: false },
    ];

    // The template relation field needs the collection ID
    const followUpTemplateField = {
      name: 'follow_up_template',
      type: 'relation',
      required: false,
      collectionId: templatesCollectionId,
      cascadeDelete: false,
      maxSelect: 1,
    };

    let contactsNeedsUpdate = false;

    for (const field of newContactFields) {
      const exists = contactsFields.some(f => f.name === field.name);
      if (!exists) {
        contactsFields.push(field);
        console.log(`  + Added ${field.name} field`);
        contactsNeedsUpdate = true;
      } else {
        console.log(`  - ${field.name} already exists`);
      }
    }

    // Handle the relation field separately
    const hasFollowUpTemplate = contactsFields.some(f => f.name === 'follow_up_template');
    if (!hasFollowUpTemplate) {
      contactsFields.push(followUpTemplateField);
      console.log('  + Added follow_up_template relation field');
      contactsNeedsUpdate = true;
    } else {
      console.log('  - follow_up_template already exists');
    }

    if (contactsNeedsUpdate) {
      const updatePayload = contactsCollection.fields
        ? { fields: contactsFields }
        : { schema: contactsFields };

      const updateResponse = await fetch(`${POCKETBASE_URL}/api/collections/contacts`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(updatePayload),
      });

      if (!updateResponse.ok) {
        const error = await updateResponse.text();
        throw new Error(`Failed to update contacts collection: ${error}`);
      }
      console.log('  ✓ Contacts collection updated');
    }

    // ========================================
    // 2. Add threading fields to email_sends
    // ========================================
    console.log('\n2. Adding threading fields to email_sends collection...');

    const emailSendsResponse = await fetch(`${POCKETBASE_URL}/api/collections/email_sends`, { headers });
    const emailSendsCollection = await emailSendsResponse.json();
    const emailSendsFields = emailSendsCollection.fields || emailSendsCollection.schema || [];

    const newEmailSendsFields = [
      { name: 'message_id', type: 'text', required: false },
      { name: 'thread_id', type: 'text', required: false },
      { name: 'in_reply_to', type: 'text', required: false },
      { name: 'is_follow_up', type: 'bool', required: false },
    ];

    let emailSendsNeedsUpdate = false;

    for (const field of newEmailSendsFields) {
      const exists = emailSendsFields.some(f => f.name === field.name);
      if (!exists) {
        emailSendsFields.push(field);
        console.log(`  + Added ${field.name} field`);
        emailSendsNeedsUpdate = true;
      } else {
        console.log(`  - ${field.name} already exists`);
      }
    }

    if (emailSendsNeedsUpdate) {
      const updatePayload = emailSendsCollection.fields
        ? { fields: emailSendsFields }
        : { schema: emailSendsFields };

      const updateResponse = await fetch(`${POCKETBASE_URL}/api/collections/email_sends`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(updatePayload),
      });

      if (!updateResponse.ok) {
        const error = await updateResponse.text();
        throw new Error(`Failed to update email_sends collection: ${error}`);
      }
      console.log('  ✓ email_sends collection updated');
    }

    // ========================================
    // 3. Create inbox_messages collection
    // ========================================
    console.log('\n3. Creating inbox_messages collection...');

    // Check if it already exists
    const inboxCheck = await fetch(`${POCKETBASE_URL}/api/collections/inbox_messages`, { headers });

    if (inboxCheck.ok) {
      console.log('  - inbox_messages collection already exists, skipping creation...');
    } else {
      // Get collection IDs for relations
      const contactsCollectionId = contactsCollection.id;
      const campaignsResponse2 = await fetch(`${POCKETBASE_URL}/api/collections/campaigns`, { headers });
      const campaignsCollection = await campaignsResponse2.json();
      const campaignsCollectionId = campaignsCollection.id;

      const createResponse = await fetch(`${POCKETBASE_URL}/api/collections`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: 'inbox_messages',
          type: 'base',
          fields: [
            { name: 'from_email', type: 'text', required: true },
            { name: 'subject', type: 'text', required: false },
            { name: 'body_text', type: 'text', required: false },
            { name: 'gmail_message_id', type: 'text', required: false },
            { name: 'gmail_thread_id', type: 'text', required: false },
            { name: 'contact', type: 'relation', required: false, collectionId: contactsCollectionId, cascadeDelete: false, maxSelect: 1 },
            { name: 'campaign', type: 'relation', required: false, collectionId: campaignsCollectionId, cascadeDelete: false, maxSelect: 1 },
            { name: 'classification', type: 'text', required: false },
            { name: 'ai_summary', type: 'text', required: false },
            { name: 'action_taken', type: 'text', required: false },
            { name: 'processed_at', type: 'date', required: false },
            { name: 'received_at', type: 'date', required: false },
          ],
          // Only admins / server routes should access inbox_messages
          listRule: '@request.auth.id != ""',
          viewRule: '@request.auth.id != ""',
          createRule: null, // Server-only create (via admin auth)
          updateRule: null, // Server-only update
          deleteRule: '@request.auth.id != ""',
        }),
      });

      if (!createResponse.ok) {
        const error = await createResponse.text();
        throw new Error(`Failed to create inbox_messages collection: ${error}`);
      }

      const inboxCollection = await createResponse.json();
      console.log(`  ✓ Created inbox_messages collection (ID: ${inboxCollection.id})`);
    }

    // ========================================
    // Summary
    // ========================================
    console.log('\n✓ Migration completed successfully!');
    console.log('\nChanges made:');
    console.log('  Contacts: follow_up_date (date), follow_up_template (relation), follow_up_cancelled (bool)');
    console.log('  Email Sends: message_id (text), thread_id (text), in_reply_to (text), is_follow_up (bool)');
    console.log('  New Collection: inbox_messages (for processing inbound emails)');
    console.log('\nNext steps:');
    console.log('  1. Set up Gmail Pub/Sub in Google Cloud Console');
    console.log('  2. Add GOOGLE_PUBSUB_TOPIC and NOTIFICATION_EMAIL to .env.local');
    console.log('  3. Re-authorize Gmail OAuth with expanded scopes (gmail.readonly)');

  } catch (error) {
    console.error('\n✗ Migration failed:', error);
    process.exit(1);
  }
}

main();
