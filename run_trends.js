const fs = require('fs');
const path = require('path');
const { getGoogleTrends } = require('./trend_selector');

async function main() {
  let trends;
  try {
    trends = await getGoogleTrends();
    fs.mkdirSync(path.join(process.cwd(), 'output'), { recursive: true });
    fs.writeFileSync(path.join(process.cwd(), 'output', 'google_trends.json'), JSON.stringify(trends, null, 2), 'utf8');
    console.log(`Google Trends: fetched ${trends.candidates.length} India candidates.`);
  } catch (error) {
    console.warn(`Google Trends unavailable: ${error.message}. Continuing with normal fact generation.`);
    trends = { candidates: [] };
  }

  const trendContext = trends.candidates.length
    ? `\n\nCURRENT GOOGLE TRENDS (INDIA) — use these only as topical inspiration. Do not invent facts about a trend. Pick ONE suitable trend and create a psychology/human-behaviour fact that naturally connects to it. If none is suitable, ignore the trends and create a strong evergreen fact.\n${trends.candidates.map((item, i) => `${i + 1}. ${item.title} (${item.traffic || 'traffic n/a'})`).join('\n')}`
    : '';

  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    if (typeof url === 'string' && url.includes('generativelanguage.googleapis.com') && options.body) {
      try {
        const body = JSON.parse(options.body);
        const part = body.contents?.[0]?.parts?.[0];
        if (part?.text) {
          part.text += trendContext;
          options.body = JSON.stringify(body);
        }
      } catch (_) {
        // Leave the original request untouched if its body is not JSON.
      }
    }
    return originalFetch(url, options);
  };

  require('./viral_video.js');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
