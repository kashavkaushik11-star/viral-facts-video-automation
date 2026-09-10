const fs = require('fs');

const PAGE_ID = process.env.FACEBOOK_PAGE_ID;
const PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const VIDEO_PATH = process.env.FACEBOOK_VIDEO_PATH || 'output/viral_fact_reel.mp4';
const CAPTION_PATH = process.env.FACEBOOK_CAPTION_PATH || 'output/caption.txt';

async function main() {
  if (!PAGE_ID || !PAGE_ACCESS_TOKEN) {
    throw new Error('Missing FACEBOOK_PAGE_ID or FACEBOOK_PAGE_ACCESS_TOKEN GitHub secret.');
  }
  if (!fs.existsSync(VIDEO_PATH)) throw new Error(`Video not found: ${VIDEO_PATH}`);

  const caption = fs.existsSync(CAPTION_PATH)
    ? fs.readFileSync(CAPTION_PATH, 'utf8').trim()
    : '';

  console.log(`Publishing ${VIDEO_PATH} to Facebook Page ${PAGE_ID}...`);

  const form = new FormData();
  form.append('source', new Blob([fs.readFileSync(VIDEO_PATH)], { type: 'video/mp4' }), 'viral_fact_reel.mp4');
  form.append('description', caption);
  form.append('access_token', PAGE_ACCESS_TOKEN);

  const response = await fetch(`https://graph.facebook.com/v24.0/${PAGE_ID}/videos`, {
    method: 'POST',
    body: form,
  });

  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!response.ok || data.error) {
    console.error(JSON.stringify(data, null, 2));
    throw new Error(`Facebook publish failed with HTTP ${response.status}.`);
  }

  console.log(`Facebook publish successful. Video ID: ${data.id || 'unknown'}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
