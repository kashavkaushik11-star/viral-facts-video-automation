from pathlib import Path
import re

p = Path('viral_video.js')
s = p.read_text(encoding='utf-8')

new_fn = r'''function buildTenSecondClip(aiVideoPath, outPath) {
  // Wan 2.2 Fast currently returns a short motion clip. Do NOT hard-loop it
  // from the beginning every few seconds. Build a 10s ping-pong motion:
  // 4s forward + 4s reverse + 2s forward, then encode the result.
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

pattern = r'function buildTenSecondClip\(aiVideoPath, outPath\) \{.*?\n\}'
s2, n = re.subn(pattern, new_fn.rstrip(), s, count=1, flags=re.S)
if n != 1:
    raise SystemExit(f'buildTenSecondClip replacement failed: {n}')
p.write_text(s2, encoding='utf-8')
print('Patched 10s scenes to ping-pong motion instead of hard looping the short Wan clip.')
