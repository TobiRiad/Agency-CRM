const fs = require('fs'), path = require('path');
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(l => {
    const t = l.trim(); if (!t || t.startsWith('#')) return;
    const e = t.indexOf('='); if (e > 0) { const k = t.slice(0, e).trim(); if (!process.env[k]) process.env[k] = t.slice(e + 1).trim(); }
  });
}
const PB = process.env.NEXT_PUBLIC_POCKETBASE_URL;
(async () => {
  let a = await fetch(PB + '/api/collections/_superusers/auth-with-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: process.env.POCKETBASE_ADMIN_EMAIL, password: process.env.POCKETBASE_ADMIN_PASSWORD }),
  });
  if (!a.ok) a = await fetch(PB + '/api/admins/auth-with-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: process.env.POCKETBASE_ADMIN_EMAIL, password: process.env.POCKETBASE_ADMIN_PASSWORD }),
  });
  const { token } = await a.json();
  const h = { Authorization: token };
  const campaignId = 'cwbgvhqkr7fsred';

  // Get all outreach batches
  const b = await fetch(PB + '/api/collections/batches/records?filter=' + encodeURIComponent('campaign="' + campaignId + '"') + '&sort=name&perPage=50&fields=id,name', { headers: h }).then(r => r.json());

  for (const batch of b.items) {
    if (batch.name.startsWith('Test')) continue;
    const contacts = await fetch(PB + '/api/collections/contacts/records?filter=' + encodeURIComponent('batch="' + batch.id + '"') + '&perPage=200&fields=id', { headers: h }).then(r => r.json());
    
    let withThread = 0, withoutThread = 0, noSends = 0;
    for (const c of contacts.items) {
      const sends = await fetch(PB + '/api/collections/email_sends/records?filter=' + encodeURIComponent('contact="' + c.id + '"') + '&sort=-sent_at&perPage=1&fields=thread_id,message_id', { headers: h }).then(r => r.json());
      if (sends.items.length > 0) {
        if (sends.items[0].thread_id) withThread++; else withoutThread++;
      } else {
        noSends++;
      }
    }
    console.log(batch.name.padEnd(30) + ' contacts:' + String(contacts.totalItems).padEnd(4) + ' thread:' + String(withThread).padEnd(4) + ' noThread:' + String(withoutThread).padEnd(4) + ' noSends:' + noSends);
  }
})();
