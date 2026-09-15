const fs = require('fs');

const PAGE_ID = process.env.FACEBOOK_PAGE_ID;
// This secret now contains the n8n-bot System User token. We exchange it
// for a Page access token before publishing to the Page.
const SYSTEM_USER_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const VIDEO_PATH = process.env.FACEBOOK_VIDEO_PATH || 'output/viral_fact_reel.mp4';
const CAPTION_PATH = process.env.FACEBOOK_CAPTION_PATH || 'output/caption.txt';
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v25.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

async function getPageAccessToken() {
  const url = new URL(`${GRAPH_BASE}/${PAGE_ID}`);
  url.searchParams.set('fields', 'id,name,access_token');
  url.searchParams.set('access_token', SYSTEM_USER_TOKEN);

  const response = await fetch(url);
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!response.ok || data.error) {
    console.error('Facebook Page token lookup failed:', JSON.stringify(data, null, 2));
    throw new Error(`Could not get a Page access token (HTTP ${response.status}).`);
  }

  if (!data.access_token) {
    throw new Error('Facebook returned no Page access token. Check that the n8n-bot System User has Full access to the Page and the required Page permissions.');
  }

  console.log(`Resolved Page access token for ${data.name || PAGE_ID}.`);
  return data.access_token;
}

async function main() {
  if (!PAGE_ID || !SYSTEM_USER_TOKEN) {
    throw new Error('Missing FACEBOOK_PAGE_ID or FACEBOOK_PAGE_ACCESS_TOKEN GitHub secret.');
  }
  if (!fs.existsSync(VIDEO_PATH)) throw new Error(`Video not found: ${VIDEO_PATH}`);

  const caption = fs.existsSync(CAPTION_PATH)
    ? fs.readFileSync(CAPTION_PATH, 'utf8').trim()
    : '';

  console.log(`Publishing ${VIDEO_PATH} to Facebook Page ${PAGE_ID}...`);

  const pageAccessToken = await getPageAccessToken();

  const form = new FormData();
  form.append('source', new Blob([fs.readFileSync(VIDEO_PATH)], { type: 'video/mp4' }), 'viral_fact_reel.mp4');
  form.append('description', caption);
  form.append('access_token', pageAccessToken);

  const response = await fetch(`${GRAPH_BASE}/${PAGE_ID}/videos`, {
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
