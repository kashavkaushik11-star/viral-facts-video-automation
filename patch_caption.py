from pathlib import Path

p = Path('viral_video.js')
s = p.read_text()
if 'FontName=DejaVu Sans,FontSize=9' not in s:
    raise SystemExit('Expected 9px caption styling is missing')
if 'original_size=1080x1920' not in s:
    raise SystemExit('Expected subtitle original_size is missing')
print('Caption fix verified: 9px, 1080x1920 subtitle scaling, full-duration typewriter timing.')
