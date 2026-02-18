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

  // All batches in outreach campaign
  const campaignId = 'cwbgvhqkr7fsred';
  const b = await fetch(PB + '/api/collections/batches/records?filter=' + encodeURIComponent('campaign="' + campaignId + '"') + '&sort=name&perPage=50&fields=id,name', { headers: h }).then(r => r.json());
  console.log('All outreach batches (' + b.totalItems + '):');

  for (const batch of b.items) {
    const ct = await fetch(PB + '/api/collections/contacts/records?filter=' + encodeURIComponent('batch="' + batch.id + '"') + '&perPage=1&fields=id', { headers: h }).then(r => r.json());
    console.log('  ' + batch.name.padEnd(30) + ' (' + batch.id + ') - ' + ct.totalItems + ' contacts');
  }

  // Now check the day 2 batch contacts specifically
  const day2Batch = b.items.find(x => x.name.toLowerCase().includes('day 2'));
  if (day2Batch) {
    console.log('\n--- Day 2 batch: ' + day2Batch.name + ' (' + day2Batch.id + ') ---');
    const contacts = await fetch(PB + '/api/collections/contacts/records?filter=' + encodeURIComponent('batch="' + day2Batch.id + '"') + '&perPage=50&fields=id,email,first_name,last_name', { headers: h }).then(r => r.json());
    console.log('Contacts: ' + contacts.totalItems);

    let withThread = 0, withoutThread = 0, noSends = 0;
    for (const c of contacts.items) {
      const sends = await fetch(PB + '/api/collections/email_sends/records?filter=' + encodeURIComponent('contact="' + c.id + '"') + '&sort=-sent_at&perPage=5&fields=id,thread_id,message_id,sent_at,is_follow_up', { headers: h }).then(r => r.json());
      const lastSend = sends.items[0];
      if (lastSend) {
        if (lastSend.thread_id) withThread++; else withoutThread++;
        console.log('  ' + (c.first_name + ' ' + c.last_name).padEnd(25) + ' thread:' + (lastSend.thread_id ? 'YES' : 'NO') + ' msg:' + (lastSend.message_id ? 'YES' : 'NO') + ' sends:' + sends.totalItems + ' sent:' + lastSend.sent_at);
      } else {
        noSends++;
        console.log('  ' + (c.first_name + ' ' + c.last_name).padEnd(25) + ' NO SENDS');
      }
    }
    console.log('\nSummary: ' + withThread + ' with thread, ' + withoutThread + ' without, ' + noSends + ' no sends');
  }

  // Also check: contacts in the follow-up page query (follow_up_date due, not cancelled, etc.)
  const today = new Date().toISOString().split('T')[0];
  console.log('\n--- Contacts due for follow-up (date <= ' + today + ') ---');
  const followUps = await fetch(PB + '/api/collections/contacts/records?filter=' + encodeURIComponent('campaign="' + campaignId + '" && follow_up_date != "" && follow_up_date <= "' + today + ' 23:59:59" && follow_up_cancelled != true && unsubscribed != true') + '&perPage=10&fields=id,email,first_name,last_name,batch,follow_up_date', { headers: h }).then(r => r.json());
  console.log('Due contacts: ' + followUps.totalItems);
  for (const c of followUps.items) {
    console.log('  ' + c.first_name + ' ' + c.last_name + ' - ' + c.email + ' - batch:' + c.batch + ' - followup:' + c.follow_up_date);
  }
})();
