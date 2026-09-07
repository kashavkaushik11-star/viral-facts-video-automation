const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;

if (!GEMINI_API_KEY || !CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID) {
  throw new Error('Missing required secrets: GEMINI_API_KEY, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID');
}

async function askGemini(prompt) {
  const models = ['gemini-2.5-flash-lite', 'gemini-3-flash-preview'];
  let lastError = '';

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 300 }
        })
      });
      if (r.ok) {
        const data = await r.json();
        const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('')?.trim() || '';
        if (text) return text;
      }
      const errorText = await r.text();
      lastError = `${model} ${r.status}: ${errorText}`;
      if (![429, 500, 502, 503, 504].includes(r.status)) break;
      let waitMs = Math.min(15000, attempt * 5000);
      const retryMatch = errorText.match(/retryDelay[^\d]*(\d+)s/i);
      if (retryMatch) waitMs = Math.min(15000, Number(retryMatch[1]) * 1000);
      console.log(`Gemini ${model} attempt ${attempt} returned ${r.status}; waiting ${Math.ceil(waitMs / 1000)}s...`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }
  throw new Error(`Gemini unavailable after model fallback: ${lastError}`);
}

async function generateImage(prompt, outPath) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: prompt.slice(0, 2000) })
  });
  if (!r.ok) throw new Error(`Cloudflare image error ${r.status}: ${await r.text()}`);
  const contentType = r.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await r.json();
    if (data.result?.image) { fs.writeFileSync(outPath, Buffer.from(data.result.image, 'base64')); return; }
    throw new Error(`Cloudflare returned JSON without image: ${JSON.stringify(data).slice(0, 1000)}`);
  }
  fs.writeFileSync(outPath, Buffer.from(await r.arrayBuffer()));
}

function pythonVideo(imagePath, prompt, outPath) {
  const py = `
import sys, shutil
from gradio_client import Client, handle_file
image_path, prompt, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
client = Client("zerogpu-aoti/wan2-2-fp8da-aoti-faster")
result = client.predict(handle_file(image_path), prompt[:1200], 4, "", 4.0, 1.0, 1.0, 42, True, api_name="/generate_video")
video_path = result[0] if isinstance(result, (list, tuple)) else result
if isinstance(video_path, dict): video_path = video_path.get("path") or video_path.get("url")
if not video_path: raise RuntimeError(f"ZeroGPU returned no video: {result}")
shutil.copyfile(video_path, out_path)
print(out_path)
`;
  fs.writeFileSync('/tmp/make_video.py', py);
  execFileSync('python', ['/tmp/make_video.py', imagePath, prompt, outPath], { stdio: 'inherit' });
}

function generateHindiVoice(text, outPath) {
  const py = `
import sys, asyncio
import edge_tts
text = sys.argv[1]
out_path = sys.argv[2]
async def main():
    communicate = edge_tts.Communicate(text, "hi-IN-SwaraNeural", rate="-5%", pitch="+0Hz", volume="+0%")
    await communicate.save(out_path)
asyncio.run(main())
`;
  fs.writeFileSync('/tmp/make_tts.py', py);
  execFileSync('python', ['/tmp/make_tts.py', text, outPath], { stdio: 'inherit' });
}

function probeDuration(filePath) {
  const value = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath], { encoding: 'utf8' }).trim();
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Could not read duration for ${filePath}`);
  return duration;
}

function srtTime(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), milli = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(milli).padStart(3, '0')}`;
}

function wrapHindi(text, maxChars = 30) {
  const words = text.trim().split(/\s+/), lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) { lines.push(line); line = word; } else line = candidate;
  }
  if (line) lines.push(line);
  return lines.slice(0, 2).join('\n');
}

function createSrt(text, duration, outPath) {
  const pieces = (text.match(/[^।?!]+[।?!]?/g) || [text]).map(s => s.trim()).filter(Boolean);
  const totalChars = pieces.reduce((sum, s) => sum + Math.max(1, s.length), 0);
  let cursor = 0;
  const blocks = [];
  pieces.forEach((piece, index) => {
    const pieceDuration = duration * (Math.max(1, piece.length) / totalChars);
    const start = cursor, end = index === pieces.length - 1 ? duration : Math.min(duration, cursor + pieceDuration);
    blocks.push(`${index + 1}\n${srtTime(start)} --> ${srtTime(end)}\n${wrapHindi(piece)}\n`);
    cursor = end;
  });
  fs.writeFileSync(outPath, blocks.join('\n'), 'utf8');
}

function runFfmpeg(args) { execFileSync('ffmpeg', ['-y', ...args], { stdio: 'inherit' }); }

function buildReel(imagePath, aiVideoPath, audioPath, srtPath, finalPath) {
  const audioDuration = probeDuration(audioPath);
  const aiDuration = Math.min(4.0, Math.max(0.8, audioDuration));
  const stillDuration = Math.max(0.8, audioDuration - aiDuration + 0.2);
  const aiVertical = '/tmp/ai_vertical.mp4', stillVideo = '/tmp/still_zoom.mp4', visualVideo = '/tmp/visual_reel.mp4';
  console.log(`Voice duration: ${audioDuration.toFixed(2)}s`);
  runFfmpeg(['-i', aiVideoPath, '-t', aiDuration.toFixed(2), '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,format=yuv420p', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', aiVertical]);
  runFfmpeg(['-loop', '1', '-i', imagePath, '-t', stillDuration.toFixed(2), '-vf', "scale=1920:1920,crop=1080:1920,zoompan=z='min(zoom+0.0015,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30,format=yuv420p", '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', stillVideo]);
  runFfmpeg(['-i', aiVertical, '-i', stillVideo, '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', visualVideo]);
  const subtitleFilter = `subtitles=${srtPath}:force_style='FontName=Noto Sans Devanagari,FontSize=52,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,Outline=3,Shadow=1,Alignment=2,MarginV=170,WrapStyle=2'`;
  runFfmpeg(['-i', visualVideo, '-i', audioPath, '-vf', subtitleFilter, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', finalPath]);
}

(async () => {
  const outDir = path.join(process.cwd(), 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const fact = await askGemini(`Create ONE highly shareable, surprising but factually responsible psychology/human-behaviour fact for a Hindi Facebook Reel. Write 50-70 words in natural spoken Hindi using Devanagari script. Start with a strong spoken hook. Do not invent statistics, medical claims or fake research. Explain the fact simply and end with one natural question. Return ONLY the voice-over script, no heading, no hashtags, no markdown.`);
  const visual = await askGemini(`Turn this Hindi psychology fact into ONE concise image-to-video prompt. Return ONLY the prompt, no heading or markdown. 40-70 words. Describe one photorealistic cinematic scene, one clear action, subtle camera movement, realistic lighting, depth and mood. Keep the main subject centered for vertical 9:16 cropping. No text, letters, numbers, logos or captions in the scene. Fact: ${fact}`);
  const imagePrompt = `Photorealistic cinematic social-media scene designed for a vertical 9:16 crop. Main subject centered and clearly visible. ${visual}. Natural realistic people and environment, believable dramatic lighting, shallow depth of field, premium documentary-film look, strong composition, no text, no letters, no numbers, no logos, no watermark, no captions, no borders, no collage.`;
  const imagePath = path.join(outDir, 'viral_fact.png'), aiVideoPath = path.join(outDir, 'ai_motion.mp4'), audioPath = path.join(outDir, 'hindi_voice.mp3'), srtPath = path.join(outDir, 'captions.srt'), finalPath = path.join(outDir, 'viral_fact_reel.mp4');
  fs.writeFileSync(path.join(outDir, 'caption.txt'), fact + '\n\n#Psychology #MindFacts #DidYouKnow #Facts #Viral #Reels', 'utf8');
  fs.writeFileSync(path.join(outDir, 'visual_prompt.txt'), visual, 'utf8');
  console.log('Generating Hindi voice...');
  generateHindiVoice(fact, audioPath);
  const audioDuration = probeDuration(audioPath);
  createSrt(fact, audioDuration, srtPath);
  console.log('Generating image...');
  await generateImage(imagePrompt, imagePath);
  console.log('Generating 4-second motion with Wan 2.2 Fast ZeroGPU...');
  pythonVideo(imagePath, visual, aiVideoPath);
  console.log('Assembling vertical reel with Hindi voice + captions...');
  buildReel(imagePath, aiVideoPath, audioPath, srtPath, finalPath);
  console.log('DONE:', finalPath);
})();
