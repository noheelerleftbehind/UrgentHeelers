const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const SHEET_ID = '1k16DDd5JrVbb4mHI1fgsQnHY47RPffb9nhLoTIoCa8o';

const STATE_TABS = {
  'California':'CA','Texas':'TX','Arizona':'AZ','New Mexico':'NM',
  'Florida':'FL','Oklahoma':'OK','Georgia':'GA','Kansas':'KS',
  'Mississpi':'MS','Louisiana':'LA','Arkansas':'AR','Alabama':'AL',
  'S. Carolina':'SC','N. Carolina':'NC','Other States':'US'
};

const C = { name:0,urgency:1,id:2,city:3,state:4,shelter:5,sourceLink:6,igLink:7,photo:8,tempNotes:9,medNotes:10 };

function esc(s){ return (s||'').replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n|\r/g,' '); }

function dogDetailPage(d) {
  const safeId = (d.id||'').replace(/\//g,'-');
  const pageUrl = `https://noheelerleftbehind.github.io/UrgentHeelers/dogs/${safeId}.html`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${d.name||d.id} — Urgent Heeler</title>
<meta property="og:title" content="${d.name||d.id} — No Heeler Left Behind">
<meta property="og:description" content="${d.urgency||'Needs rescue'} · ${d.city}, ${d.state} · ${d.shelter}">
<meta property="og:image" content="${d.photo||''}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${pageUrl}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${d.name||d.id} — Urgent Heeler">
<meta name="twitter:description" content="${d.urgency||'Needs rescue'} · ${d.city}, ${d.state}">
<meta name="twitter:image" content="${d.photo||''}">
<style>body{font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f5f5f5}a{color:#0099cc}</style>
</head>
<body>
<p><a href="../index.html">← Back to all dogs</a></p>
${d.photo?`<img src="${d.photo}" alt="${d.name}" style="width:100%;border-radius:12px;margin-bottom:16px">`:''}
<h1>${d.name||'(Unnamed)'}</h1>
${d.urgency?`<p style="color:#e74c3c;font-weight:700">${d.urgency}</p>`:''}
<p><strong>ID:</strong> ${d.id}<br>
<strong>Location:</strong> ${d.city}, ${d.state}<br>
<strong>Shelter:</strong> ${d.shelter}</p>
${d.tempNotes?`<p><strong>Temperament:</strong> ${d.tempNotes}</p>`:''}
${d.medNotes?`<p><strong>Medical:</strong> ${d.medNotes}</p>`:''}
${d.sourceLink?`<p><a href="${d.sourceLink}" target="_blank">View source listing</a></p>`:''}
${d.igLink?`<p><a href="${d.igLink}" target="_blank">View Instagram networking post</a></p>`:''}
</body></html>`;
}

async function main() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  const sheets = google.sheets({ version:'v4', auth });

  const dogs = [];
  const seen = new Set();

  for (const [tab, abbr] of Object.entries(STATE_TABS)) {
    let rows = [];
    try {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `'${tab}'!A2:L` });
      rows = res.data.values || [];
    } catch(e) { console.warn(`Skip ${tab}: ${e.message}`); continue; }

    for (const row of rows) {
      const id = (row[C.id]||'').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const d = {
        name:(row[C.name]||'').trim(),
        urgency:(row[C.urgency]||'').trim(),
        id,
        city:(row[C.city]||'').trim(),
        state:abbr,
        shelter:(row[C.shelter]||'').trim(),
        sourceLink:(row[C.sourceLink]||'').trim(),
        igLink:(row[C.igLink]||'').trim(),
        photo:(row[C.photo]||'').trim(),
        tempNotes:(row[C.tempNotes]||'').trim(),
        medNotes:(row[C.medNotes]||'').trim()
      };
      dogs.push(d);
      const safeId = id.replace(/\//g,'-');
      const dir = 'dogs';
      if (!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true});
      fs.writeFileSync(path.join(dir,`${safeId}.html`), dogDetailPage(d), 'utf8');
    }
  }

  dogs.sort((a,b) => (b.urgency.toLowerCase().includes('urgent')?1:0) - (a.urgency.toLowerCase().includes('urgent')?1:0));

  const dogsJs = dogs.map(d =>
    `  { name: "${esc(d.name)}", urgency: "${esc(d.urgency)}", id: "${esc(d.id)}", city: "${esc(d.city)}", state: "${esc(d.state)}", shelter: "${esc(d.shelter)}", sourceLink: "${esc(d.sourceLink)}", igLink: "${esc(d.igLink)}", photo: "${esc(d.photo)}", tempNotes: "${esc(d.tempNotes)}", medNotes: "${esc(d.medNotes)}" }`
  ).join(',\n');

  let html = fs.readFileSync('index.html','utf8');
  html = html.replace(
  /const dogs = \[.*?\/\/ DOGS_START[\s\S]*?\/\/ DOGS_END\s*\];/,
  `const dogs = [ // DOGS_START\n${dogsJs}\n]; // DOGS_END`
);

  fs.writeFileSync('index.html', html, 'utf8');
  console.log(`Done — ${dogs.length} dogs written.`);
}

main().catch(e=>{ console.error(e); process.exit(1); });
