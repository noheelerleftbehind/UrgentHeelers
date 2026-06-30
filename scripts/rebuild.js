const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const SHEET_ID = '1k16DDd5JrVbb4mHI1fgsQnHY47RPffb9nhLoTIoCa8o';

const STATE_TABS = {
  'California': 'CA',
  'Texas': 'TX',
  'Arizona': 'AZ',
  'New Mexico': 'NM',
  'Florida': 'FL',
  'Oklahoma': 'OK',
  'Georgia': 'GA',
  'Kansas': 'KS',
  'Mississippi': 'MS',
  'Louisiana': 'LA',
  'Arkansas': 'AR',
  'Alabama': 'AL',
  'S. Carolina': 'SC',
  'N. Carolina': 'NC',
  'Other States': 'US'
};

const C = {
  name: 0, urgency: 1, id: 2, city: 3, state: 4,
  shelter: 5, sourceLink: 6, igLink: 7, photo: 8,
  tempNotes: 9, medNotes: 10
};

function esc(s) {
  return (s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n|\r/g, ' ');
}

function downloadPhoto(url, dest) {
  return new Promise((resolve) => {
    if (!url) return resolve(false);
    if (fs.existsSync(dest)) return resolve(true);
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    client.get(url, (res) => {
      if (res.statusCode !== 200) { file.close(); fs.unlinkSync(dest); return resolve(false); }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(true); });
    }).on('error', () => { try { fs.unlinkSync(dest); } catch(e) {} resolve(false); });
  });
}

function dogDetailPage(d) {
  const safeId = (d.id || '').replace(/[^a-zA-Z0-9-_]/g, '-');
  const pageUrl = `https://noheelerleftbehind.github.io/UrgentHeelers/dogs/${safeId}.html`;
  const photoUrl = d.photo || '';
  const title = d.name ? `${d.name} — No Heeler Left Behind` : `${d.id} — No Heeler Left Behind`;
  const description = `${d.urgency || 'Needs rescue'} · ${d.city}, ${d.state} · ${d.shelter}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title}</title>
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${photoUrl}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${pageUrl}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${photoUrl}">
<style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5; line-height: 1.6; }
a { color: #0099cc; text-decoration: none; }
a:hover { text-decoration: underline; }
img { max-width: 100%; border-radius: 12px; margin-bottom: 16px; }
h1 { margin-top: 0; }
.urgent { color: #e74c3c; font-weight: 700; }
.info { background: white; padding: 16px; border-radius: 8px; margin: 16px 0; }
.back { margin-bottom: 16px; display: block; }
</style>
</head>
<body>
<a class="back" href="../index.html">← Back to all dogs</a>
${photoUrl ? `<img src="${photoUrl}" alt="${d.name || d.id}" />` : ''}
<h1>${d.name || '(Unnamed)'}</h1>
${d.urgency ? `<p class="urgent">${d.urgency}</p>` : ''}
<div class="info">
<p><strong>ID:</strong> ${d.id}<br>
<strong>Location:</strong> ${d.city}, ${d.state}<br>
<strong>Shelter:</strong> ${d.shelter}</p>
${d.tempNotes ? `<p><strong>Temperament:</strong> ${d.tempNotes}</p>` : ''}
${d.medNotes ? `<p><strong>Medical:</strong> ${d.medNotes}</p>` : ''}
</div>
${d.sourceLink ? `<p><a href="${d.sourceLink}" target="_blank">View source listing →</a></p>` : ''}
${d.igLink ? `<p><a href="${d.igLink}" target="_blank">View Instagram networking post →</a></p>` : ''}
<p><a href="${pageUrl}">🔗 Share this dog</a></p>
</body>
</html>`;
}

async function main() {
  try {
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const dogs = [];
    const seen = new Set();

    if (!fs.existsSync('photos')) fs.mkdirSync('photos', { recursive: true });
    if (!fs.existsSync('dogs')) fs.mkdirSync('dogs', { recursive: true });

    for (const [tab, abbr] of Object.entries(STATE_TABS)) {
      let rows = [];
      try {
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId: SHEET_ID,
          range: `'${tab}'!A2:L`
        });
        rows = res.data.values || [];
      } catch (e) {
        console.warn(`⚠️  Skip ${tab}: ${e.message}`);
        continue;
      }

      for (const row of rows) {
        const id = (row[C.id] || '').trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);

        const safeId = id.replace(/[^a-zA-Z0-9-_]/g, '-');
        const localPhoto = `photos/${safeId}.jpg`;
        const sheetPhotoUrl = (row[C.photo] || '').trim();

        // Download photo if missing
        if (sheetPhotoUrl && !fs.existsSync(localPhoto)) {
          console.log(`📷 Downloading photo for ${id}...`);
          await downloadPhoto(sheetPhotoUrl, localPhoto);
        }

        const photoUrl = fs.existsSync(localPhoto)
          ? `https://noheelerleftbehind.github.io/UrgentHeelers/photos/${safeId}.jpg`
          : sheetPhotoUrl;

        const d = {
          name: (row[C.name] || '').trim(),
          urgency: (row[C.urgency] || '').trim(),
          id,
          city: (row[C.city] || '').trim(),
          state: abbr,
          shelter: (row[C.shelter] || '').trim(),
          sourceLink: (row[C.sourceLink] || '').trim(),
          igLink: (row[C.igLink] || '').trim(),
          photo: photoUrl,
          tempNotes: (row[C.tempNotes] || '').trim(),
          medNotes: (row[C.medNotes] || '').trim()
        };

        dogs.push(d);

        // Write dog detail page
        fs.writeFileSync(path.join('dogs', `${safeId}.html`), dogDetailPage(d), 'utf8');
      }
    }

    // Sort urgent first
    dogs.sort((a, b) => {
      const aU = a.urgency.toLowerCase().includes('urgent') ? 0 : 1;
      const bU = b.urgency.toLowerCase().includes('urgent') ? 0 : 1;
      return aU - bU;
    });

    // Build dogs array with clickable card link
    const dogsJs = dogs.map(d => {
      const safeId = d.id.replace(/[^a-zA-Z0-9-_]/g, '-');
      return `  { name: "${esc(d.name)}", urgency: "${esc(d.urgency)}", id: "${esc(d.id)}", city: "${esc(d.city)}", state: "${esc(d.state)}", shelter: "${esc(d.shelter)}", sourceLink: "${esc(d.sourceLink)}", igLink: "${esc(d.igLink)}", photo: "${esc(d.photo)}", tempNotes: "${esc(d.tempNotes)}", medNotes: "${esc(d.medNotes)}", detailPage: "dogs/${safeId}.html" }`;
    }).join(',\n');

    let html = fs.readFileSync('index.html', 'utf8');
    html = html.replace(
      /const dogs = \[.*?\/\/ DOGS_START[\s\S]*?\/\/ DOGS_END\s*\];/,
      `const dogs = [ // DOGS_START\n${dogsJs}\n]; // DOGS_END`
    );
    fs.writeFileSync('index.html', html, 'utf8');

    console.log(`✅ Done — ${dogs.length} dogs written to site.`);
  } catch (e) {
    console.error('❌ Error:', e);
    process.exit(1);
  }
}

main();
