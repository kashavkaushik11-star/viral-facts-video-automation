const fs = require('fs');

const PHONE = process.env.WHATSAPP_PHONE;
const API_KEY = process.env.WHATSAPP_API_KEY;
const TREND_PATH = process.env.TREND_PATH || 'output/selected_trend.txt';
const VIDEO_ID = process.env.FACEBOOK_VIDEO_ID || '';

async function main() {
  if (!PHONE || !API_KEY) {
    throw new Error('Missing WHATSAPP_PHONE or WHATSAPP_API_KEY GitHub secret.');
  }

  const trend = fs.existsSync(TREND_PATH)
    ? fs.readFileSync(TREND_PATH, 'utf8').trim()
    : 'Google Trend explainer';

  const message = [
    '✅ *Video Posted Successfully*',
    '',
    `🔥 Trend: ${trend}`,
    '📘 Page: Bhakti Palm Art',
    '🤖 Google Trends Explainer Automation',
    VIDEO_ID ? `🆔 Facebook Video ID: ${VIDEO_ID}` : ''
  ].filter(Boolean).join('\n');

  const url = new URL('https://api.callmebot.com/whatsapp.php');
  url.searchParams.set('phone', PHONE);
  url.searchParams.set('text', message);
  url.searchParams.set('apikey', API_KEY);

  const response = await fetch(url);
  const text = await response.text();

  if (!response.ok || !/^OK/i.test(text.trim())) {
    console.error('WhatsApp notification failed:', text);
    throw new Error(`WhatsApp notification failed with HTTP ${response.status}.`);
  }

  console.log('WhatsApp notification sent successfully.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
