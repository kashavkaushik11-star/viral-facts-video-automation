const fs = require('fs');
const path = require('path');
const { getGoogleTrends } = require('./trend_selector');

function trendFallback(topic) {
  return `FACT:\nKya aapne notice kiya hai ki jab koi topic, jaise ${topic}, achanak har jagah dikhne lagta hai, to humein lagta hai ki woh aur bhi zyada jagah nazar aa raha hai? Dimaag jis cheez par dhyan dena shuru karta hai, usi se judi cheezein humein zyada easily notice hoti hain. Isi wajah se koi trend ek baar notice hone ke baad aur bhi popular lag sakta hai. Aapne aisa kabhi feel kiya hai?\nCAPTION:\n${topic} trend notice karne ke baad dimaag usi se judi cheezein aur jaldi notice kar sakta hai.\nVISUAL:\nA photorealistic cinematic scene of a person scrolling on a smartphone and repeatedly noticing the same trending topic represented only by a generic phone screen glow with no readable text. The person looks increasingly curious as similar topic cues appear around them in everyday life. Slow camera push-in, realistic indoor lighting, shallow depth of field, centered subject, documentary-film mood, no readable text, logos or captions.`;
}

function makeResponse(text, status = 200) {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text }] } }]
  }), { status, headers: { 'Content-Type': 'application/json' } });
}

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

  const selectedTrend = trends.candidates?.[0]?.title?.trim() || '';
  if (selectedTrend) {
    fs.writeFileSync(path.join(process.cwd(), 'output', 'selected_trend.txt'), selectedTrend + '\n', 'utf8');
    console.log(`Google Trends selected topic: ${selectedTrend}`);
  }

  const trendContext = selectedTrend
    ? `\n\nMANDATORY GOOGLE TRENDS MODE (INDIA): The selected trend is exactly: "${selectedTrend}". You MUST create the video around this exact trend. The FACT or CAPTION must explicitly contain the exact trend title "${selectedTrend}". Connect it to a real psychology/human-behaviour effect without inventing claims about the trend itself. Do not ignore the trend and do not substitute an evergreen topic. Return exactly FACT/CAPTION/VISUAL as requested.`
    : '';

  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    if (typeof url === 'string' && url.includes('generativelanguage.googleapis.com') && options.body) {
      let body;
      try {
        body = JSON.parse(options.body);
        const part = body.contents?.[0]?.parts?.[0];
        if (part?.text) {
          part.text += trendContext;
          options.body = JSON.stringify(body);
        }
      } catch (_) {
        return originalFetch(url, options);
      }

      const response = await originalFetch(url, options);
      let raw = '';
      try { raw = await response.text(); } catch (_) {}

      if (!selectedTrend) {
        return new Response(raw, { status: response.status, headers: { 'Content-Type': response.headers.get('content-type') || 'application/json' } });
      }

      if (!response.ok) {
        console.warn(`Gemini returned ${response.status}; using deterministic Google Trends fallback.`);
        return makeResponse(trendFallback(selectedTrend));
      }

      try {
        const data = JSON.parse(raw);
        const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('')?.trim() || '';
        const upper = text.toLowerCase();
        const exactMention = upper.includes(selectedTrend.toLowerCase());
        const hasSections = /FACT:\s*[\s\S]*CAPTION:\s*[\s\S]*VISUAL:/i.test(text);
        if (!exactMention || !hasSections) {
          console.warn('Gemini ignored the selected trend; replacing response with trend-locked fallback.');
          return makeResponse(trendFallback(selectedTrend));
        }
        return makeResponse(text);
      } catch (_) {
        console.warn('Gemini response was not usable; using deterministic Google Trends fallback.');
        return makeResponse(trendFallback(selectedTrend));
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
