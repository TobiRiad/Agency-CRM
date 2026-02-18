const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const t = line.trim(); if (!t || t.startsWith('#')) return;
    const eq = t.indexOf('='); if (eq > 0) { const k = t.slice(0,eq).trim(); if (!process.env[k]) process.env[k] = t.slice(eq+1).trim(); }
  });
}
const PB = process.env.NEXT_PUBLIC_POCKETBASE_URL;
(async () => {
  let authRes = await fetch(PB + '/api/collections/_superusers/auth-with-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: process.env.POCKETBASE_ADMIN_EMAIL, password: process.env.POCKETBASE_ADMIN_PASSWORD }),
  });
  if (!authRes.ok) authRes = await fetch(PB + '/api/admins/auth-with-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: process.env.POCKETBASE_ADMIN_EMAIL, password: process.env.POCKETBASE_ADMIN_PASSWORD }),
  });
  const { token } = await authRes.json();
  const headers = { Authorization: token };

  // Find batches with 'day 2' in name
  const batches = await fetch(PB + '/api/collections/batches/records?filter=' + encodeURIComponent('name~"day 2"'), { headers }).then(r=>r.json());
  console.log('Batches matching "day 2":');
  for (const b of batches.items) {
    console.log('  ' + b.id + ' - ' + b.name + ' (campaign: ' + b.campaign + ')');
  }

  if (batches.items.length === 0) { console.log('No batch found!'); return; }

  const batchId = batches.items[0].id;

  // Get contacts in that batch
  const contacts = await fetch(PB + '/api/collections/contacts/records?filter=' + encodeURIComponent('batch="' + batchId + '"') + '&perPage=200&fields=id,email,first_name,last_name', { headers }).then(r=>r.json());
  console.log('\nContacts in batch: ' + contacts.totalItems);

  let withThread = 0;
  let withoutThread = 0;
  let noSends = 0;

  for (const c of contacts.items) {
    const sends = await fetch(PB + '/api/collections/email_sends/records?filter=' + encodeURIComponent('contact="' + c.id + '"') + '&sort=-sent_at&perPage=5&fields=id,thread_id,message_id,sent_at,is_follow_up', { headers }).then(r=>r.json());
    const lastSend = sends.items[0];
    if (lastSend) {
      const has = lastSend.thread_id ? 'HAS thread' : 'NO thread ';
      if (lastSend.thread_id) withThread++; else withoutThread++;
      console.log('  ' + (c.first_name + ' ' + c.last_name).padEnd(25) + ' - ' + has + ' | thread_id: ' + (lastSend.thread_id || 'EMPTY') + ' | msg_id: ' + (lastSend.message_id || 'EMPTY') + ' | sent: ' + lastSend.sent_at);
    } else {
      noSends++;
      console.log('  ' + (c.first_name + ' ' + c.last_name).padEnd(25) + ' - NO SENDS');
    }
  }
  console.log('\nSummary: ' + withThread + ' with thread, ' + withoutThread + ' without thread, ' + noSends + ' no sends');
})();
