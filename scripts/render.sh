#!/usr/bin/env bash
set -euo pipefail

# Create a simple 9:16 social video from the Hindi voice track.
# The narration is rendered as large Hindi subtitles over a dark background.

mkdir -p output

DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 voice.mp3)
DURATION=$(printf '%.3f' "$DURATION")

# Escape text for FFmpeg drawtext.
python3 - <<'PY'
from pathlib import Path
text = Path('script.txt').read_text(encoding='utf-8')
# drawtext textfile handles UTF-8 directly; normalize line length into readable blocks.
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
  -i voice.mp3 \
  -t "$DURATION" \
  -vf "drawtext=fontfile=/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf:textfile=caption.txt:fontcolor=white:fontsize=54:line_spacing=18:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.55:boxborderw=35" \
  -c:v libx264 -preset veryfast -crf 28 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -movflags +faststart \
  output.mp4

ls -lh output.mp4
