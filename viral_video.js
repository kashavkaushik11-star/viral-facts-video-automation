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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    if (r.ok) {
      const data = await r.json();
      return data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('')?.trim() || '';
    }
    if (![429, 500, 502, 503, 504].includes(r.status) || attempt === 4) {
      throw new Error(`Gemini error ${r.status}: ${await r.text()}`);
    }
    await new Promise(resolve => setTimeout(resolve, attempt * 5000));
  }
}

async function generateImage(prompt, outPath) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prompt: prompt.slice(0, 2000) })
  });
  if (!r.ok) throw new Error(`Cloudflare image error ${r.status}: ${await r.text()}`);
  const contentType = r.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await r.json();
    if (data.result?.image) {
      fs.writeFileSync(outPath, Buffer.from(data.result.image, 'base64'));
      return;
    }
    throw new Error(`Cloudflare returned JSON without image: ${JSON.stringify(data).slice(0, 1000)}`);
  }
  fs.writeFileSync(outPath, Buffer.from(await r.arrayBuffer()));
}

function pythonVideo(imagePath, prompt, outPath) {
  const py = `
import sys, time, shutil
from gradio_client import Client, handle_file
image_path, prompt, out_path = sys.argv[1], sys.argv[2], sys.argv[3]

last_error = None
for attempt in range(1, 3):
    try:
        print(f"ZeroGPU Wan2.2 video attempt {attempt}/2")
        client = Client("zerogpu-aoti/wan2-2-fp8da-aoti-faster")
        result = client.predict(
            handle_file(image_path),
            prompt[:1200],
            4,
            "",
            2.0,
            1.0,
            1.0,
            42,
            False,
            api_name="/generate_video"
        )
        video_path = result[0] if isinstance(result, (list, tuple)) else result
        if isinstance(video_path, dict):
            video_path = video_path.get("path") or video_path.get("url")
        if not video_path:
            raise RuntimeError(f"ZeroGPU returned no video: {result}")
        shutil.copyfile(video_path, out_path)
        print(out_path)
        break
    except Exception as e:
        last_error = e
        print(f"ZeroGPU Wan2.2 attempt {attempt} failed: {type(e).__name__}: {e}")
        if attempt < 2:
            time.sleep(6)
else:
    raise last_error
`;
  fs.writeFileSync('/tmp/make_video.py', py);
  execFileSync('python', ['/tmp/make_video.py', imagePath, prompt, outPath], { stdio: 'inherit' });
}

(async () => {
  const outDir = path.join(process.cwd(), 'output');
  fs.mkdirSync(outDir, { recursive: true });

  const fact = await askGemini(`Create ONE highly shareable, surprising but factually responsible psychology/human-behaviour fact for a Hindi/Hinglish Facebook Reel. 45-70 words. Start with a strong hook. Do not invent statistics or medical claims. End with a natural question that invites opinions, not engagement bait. Return only the final caption.`);

  const visual = await askGemini(`Turn this short Hindi/Hinglish psychology fact into ONE concise image-to-video prompt for a 2-second cinematic clip. Return ONLY the prompt, no heading, no markdown, no bullets. 40-80 words. Describe one realistic scene, one clear human/object action, subtle camera movement, lighting, depth and mood. No text, letters, numbers, logos or captions in the scene. Keep it visually understandable and safe. Fact: ${fact}`);

  const imagePrompt = `Photorealistic cinematic vertical social-media scene. ${visual}. Natural realistic people and environment, dramatic but believable lighting, shallow depth of field, premium documentary-film look, strong composition, no text, no letters, no numbers, no logos, no watermark, no captions, no borders, no collage.`;

  const imagePath = path.join(outDir, 'viral_fact.png');
  const videoPath = path.join(outDir, 'viral_fact.mp4');
  fs.writeFileSync(path.join(outDir, 'caption.txt'), fact + '\n\n#Psychology #MindFacts #DidYouKnow #Facts #Viral #Reels');

  console.log('Generating image...');
  await generateImage(imagePrompt, imagePath);
  console.log('Generating video with Wan 2.2 Fast on free Hugging Face ZeroGPU...');
  pythonVideo(imagePath, visual, videoPath);
  console.log('DONE:', videoPath);
})();
