const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

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
  'Mississpi': 'MS',
  'Louisiana': 'LA',
  'Arkansas': 'AR',
  'Alabama': 'AL',
  'S. Carolina': 'SC',
  'N. Carolina': 'NC',
  'Other States': 'US'
};

// Column indices (0-based, matching sheet columns A-N)
const C = {
  name: 0, urgency: 1, status: 2, id: 3, city: 4, state: 5,
  shelter: 6, sourceLink: 7, igLink: 8, fbLink: 9, xLink: 10,
  tempNotes: 11, medNotes: 12, photo: 13
};

function esc(s) {
  return (s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n|\r/g, ' ');
}

function fetchCsv(tabName) {
  return new Promise((resolve, reject) => {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchCsvUrl(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseCsv(csv) {
  const lines = csv.trim().split('\n');
  return lines.slice(1).map(line => {
    const cols = [];
    let inQuote = false, cur = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && !inQuote) { inQuote = true; }
      else if (ch === '"' && inQuote && line[i+1] === '"') { cur += '"'; i++; }
      else if (ch === '"' && inQuote) { inQuote = false; }
      else if (ch === ',' && !inQuote) { cols.push(cur); cur = ''; }
      else { cur += ch; }
    }
    cols.push(cur);
    return cols;
  });
}

function downloadPhoto(url, dest) {
  return new Promise((resolve) => {
    if (!url) return resolve(false);
    if (fs.existsSync(dest)) return resolve(true);
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    client.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        try { fs.unlinkSync(dest); } catch(e) {}
        return downloadPhoto(res.headers.location, dest).then(resolve);
      }
      if (res.statusCode !== 200) { file.close(); try { fs.unlinkSync(dest); } catch(e){} return resolve(false); }
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
    const dogs = [];
    const seen = new Set();

    if (!fs.existsSync('photos')) fs.mkdirSync('photos', { recursive: true });
    if (!fs.existsSync('dogs')) fs.mkdirSync('dogs', { recursive: true });

    for (const [tab, abbr] of Object.entries(STATE_TABS)) {
      let rows = [];
      try {
        const csv = await fetchCsv(tab);
        rows = parseCsv(csv);
      } catch (e) {
        console.warn(`⚠️  Skip ${tab}: ${e.message}`);
        continue;
      }

      for (const row of rows) {
        const rawId = (row[C.id] || '').trim();
        const name = (row[C.name] || '').trim();
        const rowState = (row[C.state] || '').trim();
        const id = rawId || (name && rowState ? (name + '-' + rowState).replace(/[^a-zA-Z0-9-_]/g, '-') : '');
        if (!id || seen.has(id)) continue;
        seen.add(id);

        const safeId = id.replace(/[^a-zA-Z0-9-_]/g, '-');
        const localPhoto = `photos/${safeId}.jpg`;
        const sheetPhotoUrl = (row[C.photo] || '').trim();

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
        fs.writeFileSync(path.join('dogs', `${safeId}.html`), dogDetailPage(d), 'utf8');
        console.log(`✓ ${id} — ${d.name || '(unnamed)'}`);
      }
    }

    // Sort urgent/eligible first
    dogs.sort((a, b) => {
      const aU = /urgent|eligible/i.test(a.urgency) ? 0 : 1;
      const bU = /urgent|eligible/i.test(b.urgency) ? 0 : 1;
      return aU - bU;
    });

    const dogsJs = dogs.map(d => {
      const safeId = d.id.replace(/[^a-zA-Z0-9-_]/g, '-');
      return `   { name: "${esc(d.name)}", urgency: "${esc(d.urgency)}", id: "${esc(d.id)}", city: "${esc(d.city)}", state: "${esc(d.state)}", shelter: "${esc(d.shelter)}", sourceLink: "${esc(d.sourceLink)}", igLink: "${esc(d.igLink)}", photo: "${esc(d.photo)}", tempNotes: "${esc(d.tempNotes)}", medNotes: "${esc(d.medNotes)}", detailPage: "dogs/${safeId}.html" }`;
    }).join(',\n');

    let html = fs.readFileSync('index.html', 'utf8');
    // robust marker-based replace
    const startMarker = 'const dogs = [ // DOGS_START';
    const endMarker = ']; // DOGS_END';
    const si = html.indexOf(startMarker);
    const ei = html.indexOf(endMarker);
    if (si === -1 || ei === -1) throw new Error('Could not find DOGS markers in index.html');
    html = html.slice(0, si) + startMarker + '\n' + dogsJs + '\n' + endMarker + html.slice(ei + endMarker.length);
    fs.writeFileSync('index.html', html, 'utf8');

    console.log(`\n✅ Done — ${dogs.length} dogs written to site.`);
  } catch (e) {
    console.error('❌ Error:', e);
    process.exit(1);
  }
}

main();
