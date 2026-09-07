from pathlib import Path
import re
import subprocess

p = Path('viral_video.js')
s = p.read_text()
start = s.index('function createSrt(')
end = s.index('\nfunction runFfmpeg', start)
new_fn = '''function createSrt(text, duration, outPath) {
  const pieces = (text.match(/[^।?!]+[।?!]?/g) || [text]).map(s => s.trim()).filter(Boolean);
  const totalChars = pieces.reduce((sum, s) => sum + Math.max(1, s.length), 0);
  let cursor = 0;
  const blocks = [];
  let index = 0;
  pieces.forEach((piece) => {
    const pieceDuration = duration * (Math.max(1, piece.length) / totalChars);
    const start = cursor;
    const end = cursor + pieceDuration;
    const chars = Array.from(piece);
    const typeTime = Math.min(pieceDuration * 0.72, Math.max(0.8, chars.length * 0.045));
    const step = typeTime / Math.max(1, chars.length);
    for (let i = 1; i <= chars.length; i++) {
      const cueStart = start + (i - 1) * step;
      const cueEnd = i === chars.length ? end : start + i * step;
      const visible = chars.slice(0, i).join('');
      index++;
      blocks.push(`${index}\\n${srtTime(cueStart)} --> ${srtTime(cueEnd)}\\n${wrapCaption(visible)}\\n`);
    }
    cursor = end;
  });
  fs.writeFileSync(outPath, blocks.join('\\n'), 'utf8');
}
'''
s = s[:start] + new_fn + s[end:]
s = re.sub(r'FontName=DejaVu Sans,FontSize=\d+', 'FontName=DejaVu Sans,FontSize=10', s)
p.write_text(s)
subprocess.run(['git', 'config', 'user.name', 'github-actions[bot]'], check=True)
subprocess.run(['git', 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'], check=True)
subprocess.run(['git', 'add', 'viral_video.js'], check=True)
if subprocess.run(['git', 'diff', '--cached', '--quiet']).returncode != 0:
    subprocess.run(['git', 'commit', '-m', 'Use 10px typewriter captions'], check=True)
    subprocess.run(['git', 'push'], check=True)
