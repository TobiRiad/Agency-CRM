/**
 * Seed script: Create test contacts in the outreach campaign
 * Creates a "Test 2" batch and adds all provided emails as contacts.
 *
 * Usage:
 *   NEXT_PUBLIC_POCKETBASE_URL=https://agency-crm-production-2b07.up.railway.app node scripts/seed-test-contacts.js
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      if (!process.env[key]) process.env[key] = trimmed.slice(eqIdx + 1).trim();
    }
  });
}

const PB = process.env.POCKETBASE_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://localhost:8090';

const EMAILS = [
  "lucindasmith7291@gmail.com","marcusrodriguez5042@gmail.com","felicitynguyen9015@gmail.com",
  "donovanwilliams2876@gmail.com","cynthiawilson6329@gmail.com","elliotthughes4158@gmail.com",
  "mackenzieparker92032@gmail.com","lincolnadams5634@gmail.com","isabellahall3816@gmail.com",
  "gabrielcooper8973@gmail.com","paigebrown6148@gmail.com","zacharythompson2847@gmail.com",
  "emilysanchez4791@gmail.com","owenrussell7921@gmail.com","carterbutler5682@gmail.com",
  "averymartin4018@gmail.com","lilygonzalez8261@gmail.com","ethanmurphy9407@gmail.com",
  "savannahturner6053@gmail.com","hudsonwright4196@gmail.com","nataliehill7281@gmail.com",
  "jacobroberts58291@gmail.com","zoeycollins9087@gmail.com","dylanmorris2547@gmail.com",
  "madelinecook6398@gmail.com","owenjackson7015@gmail.com","audreymorgan1285@gmail.com",
  "noahwoodward9456@gmail.com","clairekelly3769@gmail.com","brooklynrogers2937@gmail.com",
  "ronaldtaylor1265@mail.ru","lindadavis451@mail.ru","torben.russel@yandex.ru",
  "karan.bell@yandex.ru","team-ed@m365.easydmarc.com","team-ed@m365.easydmarc.co.uk",
  "team-ed@m365.easydmarc.nl","team-ed@m365.easydmarc.email","team-ed@m365.easydmarc.help",
  "jonathan.shumacher@freenet.de","easydmarc@interia.pl","clarapearce16@aol.com",
  "victoryoung939@aol.com","holmes_abel@aol.com","lucidodson585@aol.com",
  "westemily343@aol.com","adalinemcintosh69@aol.com","leejack380@aol.com",
  "ed-global@seznam.cz","ed-global2@seznam.cz","easydmarc@sfr.fr",
  "hag@checkphishing.com","ed-global@workmail.easydmarc.com","ed-global2@workmail.easydmarc.com",
  "amayathompson6274@gmx.com","finleyroberts9501@gmx.com","arianawalker3816@gmx.com",
  "asherrussell7192@gmx.com","adrianawilson5031@gmx.com","lucahamilton2954@gmx.com",
  "elliebutler6109@gmx.com","xaviercook1982@gmx.com","skylarhughes5287@gmx.com",
  "oliverrodriguez8173@gmx.com","evelynedwards6947@gmx.com","elliotprice4138@gmx.com",
  "saranichols8625@gmx.com","milesward2517@gmx.com","paigehoward2421@gmx.com",
  "ziggybeltran@yahoo.com","myers.ridley@yahoo.com","aiylacortes@yahoo.com",
  "miller.burton35@yahoo.com","sandy.allen7663@yahoo.com","burriscassidy156@yahoo.com",
  "hillnancy886@yahoo.com","fitzpatrickedgar@yahoo.com","ed-global@op.pl",
  "ed-global@onet.pl","team-ed@dmarc.am","team-ed@easydmarc.co.uk",
  "team-ed@easydmarc.email","team-ed@easydmarc.help","team-ed@easydmarc.nl",
  "norawoodard6719@zohomail.com","henrymartinez2864@zohomail.com","leohenderson1295@zohomail.com",
  "jackcoleman2964@zohomail.com","harperroberts9350@zohomail.com","sydneypeterson9012@zohomail.com",
  "evabennett2045@zohomail.com","julianramirez4758@zohomail.com","arielturner5704@zohomail.com",
  "ivycollins6097@zohomail.com","ed-global@libero.it","vincentmarshall9240@outlook.com",
  "sophiawright1707@outlook.com","nataliemorris4018@outlook.com","lucasrivera5629@outlook.com",
  "camillemurray5964@outlook.com","alexandergreen31867@outlook.com","ameliawilson5167@outlook.com",
  "isaacperry6239@outlook.com","zarahamilton3196@outlook.com","sebastiansanders4862@outlook.com",
  "elisabethpowell7854@outlook.com","joshuarobinson1629@outlook.com","madisonharris4185@outlook.com",
  "jonathanrodriguez7549@outlook.com","benjaminprice2195@outlook.com","lillianwoodard64191@outlook.com",
  "elijahbailey39781@outlook.com","scarlettcoleman6237@outlook.com","victoriaroberts85075@outlook.com",
  "ryangonzalez2164@outlook.com","easydmarc@laposte.net","hkhatchoian@icloud.com",
  "ed-global@bluetiehome.com","ed-global@centrum.cz","easydmarc@free.fr",
  "jonathan.shumacher@web.de","ed-global@att.net","jonathan.shumacher@t-online.de",
  "jonathan.shumacher@gmx.de"
];

const OUTREACH_CAMPAIGN_ID = 'cwbgvhqkr7fsred';

async function main() {
  console.log('Using PocketBase at:', PB);
  console.log(`Emails to add: ${EMAILS.length}`);

  const email = process.env.POCKETBASE_ADMIN_EMAIL;
  const password = process.env.POCKETBASE_ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('Missing credentials.');
    process.exit(1);
  }

  // Authenticate
  let authRes = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: email, password }),
  });
  if (!authRes.ok) {
    authRes = await fetch(`${PB}/api/admins/auth-with-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: email, password }),
    });
  }
  if (!authRes.ok) {
    console.error('Auth failed:', await authRes.text());
    process.exit(1);
  }
  const { token } = await authRes.json();
  const headers = { 'Content-Type': 'application/json', 'Authorization': token };

  // 1. Create "Test 2" batch
  console.log('\n1. Creating "Test 2" batch...');
  const batchRes = await fetch(`${PB}/api/collections/batches/records`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'Test 2',
      campaign: OUTREACH_CAMPAIGN_ID,
    }),
  });
  if (!batchRes.ok) {
    console.error('Failed to create batch:', await batchRes.text());
    process.exit(1);
  }
  const batch = await batchRes.json();
  console.log(`  ✓ Created batch "${batch.name}" (${batch.id})`);

  // 2. Create contacts
  console.log(`\n2. Creating ${EMAILS.length} contacts...`);
  let created = 0;
  let failed = 0;

  for (let i = 0; i < EMAILS.length; i++) {
    const contactEmail = EMAILS[i];
    try {
      const res = await fetch(`${PB}/api/collections/contacts/records`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email: contactEmail,
          first_name: 'Test',
          last_name: 'Seed',
          title: '',
          campaign: OUTREACH_CAMPAIGN_ID,
          batch: batch.id,
          is_primary: true,
        }),
      });
      if (res.ok) {
        created++;
        if (created % 20 === 0) {
          console.log(`  ... ${created}/${EMAILS.length} created`);
        }
      } else {
        const err = await res.text();
        console.error(`  ✗ Failed: ${contactEmail} — ${err}`);
        failed++;
      }
    } catch (err) {
      console.error(`  ✗ Error: ${contactEmail} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\n✓ Done! Created ${created} contacts, ${failed} failed.`);
  console.log(`  Batch: "${batch.name}" (${batch.id})`);
  console.log(`  Campaign: ${OUTREACH_CAMPAIGN_ID}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
