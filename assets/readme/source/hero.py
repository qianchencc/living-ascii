"""Hero: the project name cut out of the living ASCII field.

Usage: hero.py <ascii-frames-dir> <out.webp> [frame-index-for-a-still.png]
Frames must come from an export at width=1200, fps=10.
Inside the letters the ASCII runs at full strength; outside it is dimmed on the
left (behind the title) and fades back to full strength on the right.
Needs only Pillow.
"""
import sys, glob, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

SRC, OUT = sys.argv[1], sys.argv[2]
ONLY = int(sys.argv[3]) if len(sys.argv) > 3 else None
W, H, Y0 = 1200, 500, int(os.environ.get('HERO_Y', 460))
TITLE_FONT = ('/System/Library/Fonts/Avenir Next.ttc', 8)  # Heavy
MONO_FONT = ('/System/Library/Fonts/Menlo.ttc', 0)
CREAM = (238, 236, 214)

def font(spec, size):
    return ImageFont.truetype(spec[0], size, index=spec[1])

# title mask
mask = Image.new('L', (W, H), 0)
d = ImageDraw.Draw(mask)
big = font(TITLE_FONT, 188)
d.text((50, 22), 'living', font=big, fill=255)
d.text((50, 206), 'ascii', font=big, fill=255)
halo = mask.filter(ImageFilter.MaxFilter(13)).filter(ImageFilter.GaussianBlur(6))

# brightness outside the letters: dim behind the title, full on the right
def ramp(x):
    r = min(1.0, max(0.0, (x - 560) / 360))
    return r * r * (3 - 2 * r)
R = [ramp(x) for x in range(W)]
hp, mp = halo.load(), mask.load()
gain = Image.new('L', (W, H))
gp = gain.load()
for y in range(H):
    for x in range(W):
        outside = (0.17 + 0.83 * R[x]) * (1 - 0.55 * hp[x, y] / 255 * (1 - R[x]))
        m = mp[x, y] / 255
        gp[x, y] = round(255 * (m + (1 - m) * outside))
gain = gain.convert('RGB')

# static text layer
text = Image.new('RGBA', (W, H), (0, 0, 0, 0))
ImageDraw.Draw(text).text((58, 440), 'image  →  strands  →  ascii', font=font(MONO_FONT, 22), fill=CREAM + (235,))

def compose(f):
    a = Image.open(f).convert('RGB').crop((0, Y0, W, Y0 + H))
    im = ImageChops.multiply(a, gain).convert('RGBA')
    im.alpha_composite(text)
    return im.convert('RGB')

frames = sorted(glob.glob(os.path.join(SRC, 'f_*.png')))
if ONLY is not None:
    compose(frames[ONLY]).save(OUT)
else:
    # 960 px wide is what GitHub shows anyway; q42 keeps the glyphs and the file near 5 MB
    out = [compose(f).resize((960, 400), Image.LANCZOS) for f in frames]
    out[0].save(OUT, 'WEBP', save_all=True, append_images=out[1:], duration=100, loop=0,
                quality=42, method=6, minimize_size=True, allow_mixed=True)
print(len(frames), 'frames ->', OUT)
