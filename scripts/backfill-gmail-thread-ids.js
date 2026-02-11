/**
 * Backfill Gmail thread IDs for email_sends records.
 * 
 * This script finds email_sends records that are missing thread_id,
 * matches them with actual Gmail sent messages, and updates the records.
 * 
 * Usage:
 *   node scripts/backfill-gmail-thread-ids.js           # Dry run (default)
 *   node scripts/backfill-gmail-thread-ids.js --apply    # Actually update records
 * 
 * Skips:
 *   - Contacts that have replied (follow_up_cancelled = true)
 *   - Records that already have thread_id
 */

const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      // Don't overwrite vars already set (allows CLI overrides)
      if (!process.env[key]) {
        process.env[key] = trimmed.slice(eqIdx + 1).trim();
      }
    }
  });
}

const { google } = require('googleapis');

const POCKETBASE_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://localhost:8090';
const ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const DRY_RUN = !process.argv.includes('--apply');

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Gmail Thread ID Backfill Script`);
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (use --apply to save)' : 'APPLY MODE - will update records'}`);
  console.log(`${'='.repeat(60)}\n`);

  // 1. Authenticate with PocketBase
  console.log('1. Authenticating with PocketBase...');
  const authRes = await fetch(`${POCKETBASE_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!authRes.ok) throw new Error(`PocketBase auth failed: ${await authRes.text()}`);
  const { token } = await authRes.json();
  const headers = { 'Content-Type': 'application/json', 'Authorization': token };
  console.log('   ✓ Authenticated\n');

  // 2. Get Gmail refresh token from app_settings
  console.log('2. Getting Gmail credentials...');
  const settingsRes = await fetch(
    `${POCKETBASE_URL}/api/collections/app_settings/records?filter=key="gmail_refresh_token"||key="gmail_email"`,
    { headers }
  );
  const settingsData = await settingsRes.json();
  
  let gmailRefreshToken = '';
  let gmailEmail = '';
  for (const item of settingsData.items || []) {
    if (item.key === 'gmail_refresh_token') gmailRefreshToken = item.value?.token || '';
    if (item.key === 'gmail_email') gmailEmail = item.value?.email || '';
  }

  if (!gmailRefreshToken || !gmailEmail) {
    console.error('   ✗ Gmail credentials not found in app_settings. Is Gmail configured?');
    process.exit(1);
  }
  console.log(`   ✓ Gmail account: ${gmailEmail}\n`);

  // 3. Create Gmail client
  console.log('3. Connecting to Gmail API...');
  const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: gmailRefreshToken });
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  
  // Quick test
  const profile = await gmail.users.getProfile({ userId: 'me' });
  console.log(`   ✓ Connected as ${profile.data.emailAddress}\n`);

  // 4. Fetch email_sends that are missing thread_id, expand contact and template
  console.log('4. Fetching email_sends missing thread_id...');
  let page = 1;
  let allSends = [];
  while (true) {
    const sendsRes = await fetch(
      `${POCKETBASE_URL}/api/collections/email_sends/records?` +
      `filter=(thread_id="" || thread_id=null)&` +
      `expand=contact,template&` +
      `perPage=200&page=${page}&sort=-sent_at`,
      { headers }
    );
    const sendsData = await sendsRes.json();
    allSends.push(...(sendsData.items || []));
    if (page >= sendsData.totalPages) break;
    page++;
  }
  console.log(`   Found ${allSends.length} email_sends without thread_id\n`);

  if (allSends.length === 0) {
    console.log('Nothing to backfill! All records already have thread IDs.');
    return;
  }

  // 5. Filter out contacts that have replied (follow_up_cancelled)
  console.log('5. Filtering out replied contacts...');
  const beforeFilter = allSends.length;
  allSends = allSends.filter(send => {
    const contact = send.expand?.contact;
    if (!contact) return true; // Keep if no contact data (shouldn't happen)
    return contact.follow_up_cancelled !== true;
  });
  const skippedReplied = beforeFilter - allSends.length;
  console.log(`   Skipped ${skippedReplied} records (contact replied)`);
  console.log(`   ${allSends.length} records to process\n`);

  if (allSends.length === 0) {
    console.log('Nothing to backfill after filtering!');
    return;
  }

  // 6. Process each email_send
  console.log('6. Matching with Gmail sent messages...\n');
  
  let matched = 0;
  let notFound = 0;
  let ambiguous = 0;
  let errors = 0;
  const results = [];

  for (let i = 0; i < allSends.length; i++) {
    const send = allSends[i];
    const contact = send.expand?.contact;
    const template = send.expand?.template;
    const recipientEmail = contact?.email || '';
    const templateSubject = template?.subject || '';
    const sentAt = send.sent_at;

    const label = `[${i + 1}/${allSends.length}]`;
    
    if (!recipientEmail) {
      console.log(`${label} SKIP - no recipient email (send ID: ${send.id})`);
      notFound++;
      continue;
    }

    try {
      let gmailMessageId = null;
      let gmailThreadId = null;
      let matchMethod = '';

      // Method A: If we have a resend_id (which is actually Gmail message ID), fetch it directly
      if (send.resend_id && send.resend_id.length > 10) {
        try {
          const msg = await gmail.users.messages.get({
            userId: 'me',
            id: send.resend_id,
            format: 'metadata',
            metadataHeaders: ['Subject', 'To', 'Message-ID'],
          });
          gmailMessageId = msg.data.id;
          gmailThreadId = msg.data.threadId;
          matchMethod = 'direct (resend_id)';
        } catch (e) {
          // Message ID might not be valid, fall through to search
        }
      }

      // Method B: Search Gmail by recipient + time window
      if (!gmailThreadId) {
        // Build a time window: sent_at ± 5 minutes
        const sentDate = new Date(sentAt);
        const afterDate = new Date(sentDate.getTime() - 5 * 60 * 1000);
        const beforeDate = new Date(sentDate.getTime() + 5 * 60 * 1000);
        
        // Format for Gmail: YYYY/MM/DD
        const afterStr = `${afterDate.getFullYear()}/${String(afterDate.getMonth() + 1).padStart(2, '0')}/${String(afterDate.getDate()).padStart(2, '0')}`;
        const beforeStr = `${beforeDate.getFullYear()}/${String(beforeDate.getMonth() + 1).padStart(2, '0')}/${String(beforeDate.getDate()).padStart(2, '0')}`;
        
        // Gmail search: sent to this person around this time
        const query = `to:${recipientEmail} in:sent after:${afterStr} before:${beforeStr}`;
        
        const searchRes = await gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: 10,
        });

        const messages = searchRes.data.messages || [];

        if (messages.length === 1) {
          // Exact match - only one message in the window
          const msg = await gmail.users.messages.get({
            userId: 'me',
            id: messages[0].id,
            format: 'metadata',
            metadataHeaders: ['Subject', 'To', 'Message-ID'],
          });
          gmailMessageId = msg.data.id;
          gmailThreadId = msg.data.threadId;
          matchMethod = 'time window (1 result)';
        } else if (messages.length > 1) {
          // Multiple messages - narrow down by subject
          let subjectMatch = null;
          let subjectMatchCount = 0;

          for (const m of messages) {
            const msg = await gmail.users.messages.get({
              userId: 'me',
              id: m.id,
              format: 'metadata',
              metadataHeaders: ['Subject', 'To', 'Message-ID', 'Date'],
            });
            
            const subjectHeader = (msg.data.payload?.headers || [])
              .find(h => h.name === 'Subject')?.value || '';

            // Compare subjects (strip Re:/Fwd: prefixes and whitespace)
            const cleanSubject = (s) => s.replace(/^(Re|Fwd|FW|RE):\s*/gi, '').trim().toLowerCase();
            
            if (cleanSubject(subjectHeader) === cleanSubject(templateSubject)) {
              subjectMatch = msg;
              subjectMatchCount++;
            }
          }

          if (subjectMatchCount === 1 && subjectMatch) {
            gmailMessageId = subjectMatch.data.id;
            gmailThreadId = subjectMatch.data.threadId;
            matchMethod = `subject match (${messages.length} candidates)`;
          } else if (subjectMatchCount > 1) {
            // Multiple subject matches - try to narrow by closest timestamp
            let bestMatch = null;
            let bestDiff = Infinity;

            for (const m of messages) {
              const msg = await gmail.users.messages.get({
                userId: 'me',
                id: m.id,
                format: 'metadata',
                metadataHeaders: ['Subject', 'Date'],
              });
              
              const subjectHeader = (msg.data.payload?.headers || [])
                .find(h => h.name === 'Subject')?.value || '';
              const cleanSubject = (s) => s.replace(/^(Re|Fwd|FW|RE):\s*/gi, '').trim().toLowerCase();
              
              if (cleanSubject(subjectHeader) === cleanSubject(templateSubject)) {
                const msgDate = parseInt(msg.data.internalDate || '0');
                const diff = Math.abs(msgDate - sentDate.getTime());
                if (diff < bestDiff) {
                  bestDiff = diff;
                  bestMatch = msg;
                }
              }
            }

            if (bestMatch && bestDiff < 10 * 60 * 1000) { // Within 10 minutes
              gmailMessageId = bestMatch.data.id;
              gmailThreadId = bestMatch.data.threadId;
              matchMethod = `closest timestamp (${subjectMatchCount} subject matches, diff: ${Math.round(bestDiff / 1000)}s)`;
            }
          }

          if (!gmailThreadId) {
            // Still no match - try wider date range as fallback
            // Search with just the day, not time window
            const dayQuery = `to:${recipientEmail} in:sent after:${afterStr}`;
            // Already searched, just report ambiguous
          }
        }
        
        if (!gmailThreadId && messages.length === 0) {
          // Try a wider window (same day)
          const dayStart = `${sentDate.getFullYear()}/${String(sentDate.getMonth() + 1).padStart(2, '0')}/${String(sentDate.getDate()).padStart(2, '0')}`;
          const nextDay = new Date(sentDate.getTime() + 24 * 60 * 60 * 1000);
          const dayEnd = `${nextDay.getFullYear()}/${String(nextDay.getMonth() + 1).padStart(2, '0')}/${String(nextDay.getDate()).padStart(2, '0')}`;
          
          const wideQuery = `to:${recipientEmail} in:sent after:${dayStart} before:${dayEnd}`;
          const wideRes = await gmail.users.messages.list({
            userId: 'me',
            q: wideQuery,
            maxResults: 10,
          });
          
          const wideMessages = wideRes.data.messages || [];
          if (wideMessages.length === 1) {
            const msg = await gmail.users.messages.get({
              userId: 'me',
              id: wideMessages[0].id,
              format: 'metadata',
              metadataHeaders: ['Subject', 'Message-ID'],
            });
            gmailMessageId = msg.data.id;
            gmailThreadId = msg.data.threadId;
            matchMethod = 'wide window (same day, 1 result)';
          } else if (wideMessages.length > 1 && templateSubject) {
            // Try subject matching on wide results
            for (const m of wideMessages) {
              const msg = await gmail.users.messages.get({
                userId: 'me',
                id: m.id,
                format: 'metadata',
                metadataHeaders: ['Subject'],
              });
              const subjectHeader = (msg.data.payload?.headers || [])
                .find(h => h.name === 'Subject')?.value || '';
              const cleanSubject = (s) => s.replace(/^(Re|Fwd|FW|RE):\s*/gi, '').trim().toLowerCase();
              
              if (cleanSubject(subjectHeader) === cleanSubject(templateSubject)) {
                gmailMessageId = msg.data.id;
                gmailThreadId = msg.data.threadId;
                matchMethod = `wide window subject match (${wideMessages.length} candidates)`;
                break; // Take the first subject match
              }
            }
          }
        }
      }

      // Report result
      if (gmailThreadId) {
        matched++;
        const messageIdDisplay = gmailMessageId ? `msgId=${gmailMessageId}` : '';
        console.log(`${label} ✓ MATCHED  ${recipientEmail.padEnd(35)} → threadId=${gmailThreadId} ${messageIdDisplay} [${matchMethod}]`);
        
        results.push({
          sendId: send.id,
          gmailMessageId,
          gmailThreadId,
          recipientEmail,
          matchMethod,
        });
      } else {
        notFound++;
        console.log(`${label} ✗ NOT FOUND ${recipientEmail.padEnd(35)} (sent: ${sentAt?.substring(0, 10)}, subject: "${templateSubject?.substring(0, 40)}")`);
      }

      // Rate limiting: Gmail API has 250 quota units/second for users.messages
      // Each get is 5 units, each list is 5 units. Be conservative.
      if (i % 5 === 4) {
        await new Promise(r => setTimeout(r, 500));
      }

    } catch (err) {
      errors++;
      console.log(`${label} ✗ ERROR    ${recipientEmail.padEnd(35)} → ${err.message}`);
    }
  }

  // 7. Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Results Summary`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  Total processed: ${allSends.length}`);
  console.log(`  Matched:         ${matched}`);
  console.log(`  Not found:       ${notFound}`);
  console.log(`  Ambiguous:       ${ambiguous}`);
  console.log(`  Errors:          ${errors}`);
  console.log(`${'='.repeat(60)}\n`);

  // 8. Apply if not dry run
  if (DRY_RUN) {
    if (matched > 0) {
      console.log(`DRY RUN complete. Run with --apply to update ${matched} records.`);
      console.log(`  node scripts/backfill-gmail-thread-ids.js --apply\n`);
    }
  } else {
    if (matched === 0) {
      console.log('No records to update.');
      return;
    }

    console.log(`Updating ${matched} records...\n`);
    let updated = 0;
    let updateErrors = 0;

    for (const result of results) {
      try {
        // Build a Message-ID header value from the Gmail message
        let messageIdHeader = '';
        try {
          const msg = await gmail.users.messages.get({
            userId: 'me',
            id: result.gmailMessageId,
            format: 'metadata',
            metadataHeaders: ['Message-ID'],
          });
          messageIdHeader = (msg.data.payload?.headers || [])
            .find(h => h.name === 'Message-ID')?.value || '';
        } catch (e) {
          // Not critical, continue without it
        }

        const updateData = {
          thread_id: result.gmailThreadId,
          message_id: messageIdHeader || '',
        };

        // Also update resend_id if it was empty (store Gmail message ID)
        const originalSend = allSends.find(s => s.id === result.sendId);
        if (!originalSend?.resend_id) {
          updateData.resend_id = result.gmailMessageId;
        }

        const updateRes = await fetch(
          `${POCKETBASE_URL}/api/collections/email_sends/records/${result.sendId}`,
          {
            method: 'PATCH',
            headers,
            body: JSON.stringify(updateData),
          }
        );

        if (updateRes.ok) {
          updated++;
          console.log(`  ✓ Updated ${result.sendId} (${result.recipientEmail})`);
        } else {
          updateErrors++;
          const err = await updateRes.text();
          console.log(`  ✗ Failed ${result.sendId}: ${err}`);
        }

        // Rate limit PB updates
        if (updated % 10 === 0) await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        updateErrors++;
        console.log(`  ✗ Error updating ${result.sendId}: ${err.message}`);
      }
    }

    console.log(`\nUpdate complete: ${updated} updated, ${updateErrors} errors.`);
  }
}

main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
