// Google Trends selector for India. No API key required.
const TRENDS_URL = 'https://trends.google.com/trending/rss?geo=IN';

function decodeXml(value) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

async function getGoogleTrends() {
  const response = await fetch(TRENDS_URL, { headers: { 'User-Agent': 'viral-facts-video-automation/1.0' } });
  if (!response.ok) throw new Error(`Google Trends RSS ${response.status}`);
  const xml = await response.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(match => {
    const block = match[1];
    const title = block.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
    const traffic = block.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/i)?.[1];
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1];
    return { title: title ? decodeXml(title) : '', traffic: traffic ? decodeXml(traffic) : '', pubDate: pubDate ? decodeXml(pubDate) : '' };
  }).filter(item => item.title);
  if (!items.length) throw new Error('Google Trends RSS returned no trends');

  const blocked = /\b(vs|scorecard|standings|match|fixture|live score)\b/i;
  const candidates = items.filter(item => !blocked.test(item.title)).slice(0, 20);
  return { source: TRENDS_URL, fetchedAt: new Date().toISOString(), candidates: candidates.length ? candidates : items.slice(0, 20) };
}

module.exports = { getGoogleTrends };
