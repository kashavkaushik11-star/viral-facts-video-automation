from pathlib import Path
import re

p = Path('viral_video.js')
s = p.read_text(encoding='utf-8')

new_python_fn = r'''function pythonVideo(imagePath, prompt, outPath) {
  // Wan 2.2 Fast ZeroGPU can occasionally fail or time out. Try it twice,
  // then fall back to a real animated still-image clip so the daily pipeline
  // never stops just because the external video model is temporarily busy.
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

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(`Wan 2.2 attempt ${attempt}/2...`);
      execFileSync('python', ['/tmp/make_video.py', imagePath, prompt, outPath], {
        stdio: 'inherit',
        timeout: 180000,
      });
      if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) return;
    } catch (error) {
      console.log(`Wan 2.2 attempt ${attempt} failed; ${attempt === 2 ? 'using fallback motion.' : 'retrying once.'}`);
    }
  }

  // Reliable fallback: animate the generated image with a slow cinematic zoom.
  // This is preferable to failing the whole workflow and prevents a hard loop.
  console.log('Wan 2.2 unavailable. Creating 4-second animated still fallback.');
  runFfmpeg([
    '-loop', '1',
    '-i', imagePath,
    '-vf', "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.0012,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=120:s=1080x1920:fps=30,format=yuv420p",
    '-t', '4',
    '-an',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outPath
  ]);
}
'''

new_scene_fn = r'''function buildTenSecondClip(aiVideoPath, outPath) {
  // Wan returns a short clip. Build 10s without restarting at frame 0:
  // 4s forward + 4s reverse + 2s forward.
  const filter = [
    '[0:v]trim=start=0:end=4,setpts=PTS-STARTPTS,split=3[fwd][revsrc][tail]',
    '[revsrc]reverse[rev]',
    '[tail]trim=start=0:end=2,setpts=PTS-STARTPTS[tail2]',
    '[fwd][rev][tail2]concat=n=3:v=1:a=0,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,format=yuv420p[outv]'
  ].join(';');

  runFfmpeg([
    '-i', aiVideoPath,
    '-filter_complex', filter,
    '-map', '[outv]',
    '-t', String(SCENE_DURATION),
    '-an',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-movflags', '+faststart',
    outPath
  ]);
}
'''

py_pattern = r'function pythonVideo\(imagePath, prompt, outPath\) \{.*?\n\}'
s2, n1 = re.subn(py_pattern, new_python_fn.rstrip(), s, count=1, flags=re.S)
if n1 != 1:
    raise SystemExit(f'pythonVideo replacement failed: {n1}')

scene_pattern = r'function buildTenSecondClip\(aiVideoPath, outPath\) \{.*?\n\}'
s3, n2 = re.subn(scene_pattern, new_scene_fn.rstrip(), s2, count=1, flags=re.S)
if n2 != 1:
    raise SystemExit(f'buildTenSecondClip replacement failed: {n2}')

p.write_text(s3, encoding='utf-8')
print('Patched Wan generation with retry/fallback and restored non-looping 10s scene motion.')
