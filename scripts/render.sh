#!/usr/bin/env bash
set -euo pipefail

mkdir -p output

if [ -f voice.wav ]; then
  AUDIO=voice.wav
else
  AUDIO=voice.mp3
fi

DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$AUDIO")
DURATION=$(printf '%.3f' "$DURATION")

python3 - <<'PY'
from pathlib import Path
text = Path('script.txt').read_text(encoding='utf-8')
words = text.split()
lines=[]
line=''
for w in words:
    if len(line) + len(w) + 1 > 28:
        lines.append(line)
        line=w
    else:
        line=(line+' '+w).strip()
if line: lines.append(line)
Path('caption.txt').write_text('\n'.join(lines), encoding='utf-8')
PY

ffmpeg -y \
  -f lavfi -i "color=c=0x111827:s=1080x1920:r=30" \
  -i "$AUDIO" \
  -t "$DURATION" \
  -vf "drawtext=fontfile=/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf:textfile=caption.txt:fontcolor=white:fontsize=54:line_spacing=18:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.55:boxborderw=35" \
  -c:v libx264 -preset veryfast -crf 28 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -movflags +faststart \
  output/output.mp4

ls -lh output/output.mp4
