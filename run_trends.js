const fs = require('fs');
const path = require('path');
const { getGoogleTrends } = require('./trend_selector');

function trendFallback(topic) {
  return `FACT:\nक्या आपने कभी नोटिस किया है कि जब ${topic} जैसी कोई चीज़ अचानक हर जगह दिखाई देने लगे, तो कुछ समय बाद वह हमें और भी ज्यादा नजर आने लगती है? ऐसा इसलिए हो सकता है क्योंकि हमारा दिमाग उस चीज़ पर ध्यान देना शुरू कर देता है और उससे जुड़ी जानकारी को जल्दी पहचानने लगता है। इसी वजह से कोई ट्रेंड एक बार ध्यान में आने के बाद और ज्यादा prominent लग सकता है। आपके साथ ऐसा कभी हुआ है?\nCAPTION:\n${topic} trend notice hone ke baad dimaag usi se judi cheezein aur jaldi notice kar sakta hai.\nVISUAL:\nA photorealistic cinematic scene of one young Indian adult scrolling on a smartphone, then becoming curious as the same general topic keeps appearing in everyday surroundings without any readable text. Natural realistic indoor lighting, shallow depth of field, centered subject, subtle camera movement, premium documentary-film look, no text, no letters, no numbers, no logos, no watermark.`;
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
    ? `\n\nMANDATORY GOOGLE TRENDS MODE (INDIA): Use this selected trend as the topic: "${selectedTrend}". Mention the exact trend title naturally in the FACT or CAPTION, but write the complete voiceover in natural Hindi Devanagari. Never copy the trend's original script if it is not Devanagari/English. Connect it to a real psychology/human-behaviour effect without inventing claims. Return exactly FACT/CAPTION/VISUAL.`
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
