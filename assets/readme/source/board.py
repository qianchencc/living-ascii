"""Three-panel board: the same patch as the still photo, as strands, and as
stroke glyphs. Usage: board.py <image> <flow-frame.png> <ascii-frame.png> <out-dir>
Frames must come from an export at width=1200. Writes <out-dir>/<lang>/pipeline.webp.
Needs only Pillow."""
import sys, os
from PIL import Image, ImageDraw, ImageFont

IMG, FLOW, ASCII, OUT = sys.argv[1:5]
W, H = 1200, 612
PW, PH, ZOOM = 336, 448, 1.5
X0, Y0 = int(os.environ.get('BOARD_X', 80)), int(os.environ.get('BOARD_Y', 900))  # patch, frame px
BG, FG, MUTED, GRASS = (12, 16, 9), (238, 240, 220), (172, 184, 148), (196, 221, 120)
SANS = ('/System/Library/Fonts/Avenir Next.ttc', 2)      # Demi Bold
SANS_BODY = ('/System/Library/Fonts/Avenir Next.ttc', 5)  # Medium
CJK = ('/System/Library/Fonts/Hiragino Sans GB.ttc', 2)   # W6
CJK_BODY = ('/System/Library/Fonts/Hiragino Sans GB.ttc', 0)  # W3
MONO = ('/System/Library/Fonts/Menlo.ttc', 1)

COPY = {
    'en': [('the still', 'a photo that never moves'),
           ('160k strands', 'sway like a school of fish'),
           ('stroke glyphs', 'each follows the strand beneath')],
    'zh': [('原图', '一张不会动的照片'),
           ('16 万根草叶', '像鱼群一样摆动'),
           ('ASCII 笔画', '每个字符顺着草叶转')],
}

def font(spec, size):
    return ImageFont.truetype(spec[0], size, index=spec[1])

def patch(path, scale):
    im = Image.open(path).convert('RGB')
    s = im.width / 1200  # frame px -> this image's px
    w, h = PW / ZOOM, PH / ZOOM
    box = tuple(round(v * s) for v in (X0, Y0, X0 + w, Y0 + h))
    return im.crop(box).resize((PW, PH), Image.NEAREST if scale == 'nearest' else Image.LANCZOS)

panels = [patch(IMG, 'smooth'), patch(FLOW, 'smooth'), patch(ASCII, 'smooth')]

# loupe: a few cells of the ASCII frame at 4x, so the stroke glyphs are readable
LX, LY, LS, LZ = X0 + 149, Y0 + 5, 40, 4  # frame px
loupe = Image.open(ASCII).convert('RGB').crop((LX, LY, LX + LS, LY + LS)).resize((LS * LZ,) * 2, Image.NEAREST)

def rounded(im, r):
    m = Image.new('L', im.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, im.width - 1, im.height - 1], r, fill=255)
    out = im.convert('RGBA'); out.putalpha(m); return out

for lang, copy in COPY.items():
    board = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(board)
    d.rounded_rectangle([0, 0, W - 1, H - 1], 22, fill=BG + (255,))
    label_font = font(CJK if lang == 'zh' else SANS, 24)
    body_font = font(CJK_BODY if lang == 'zh' else SANS_BODY, 23)
    for i, (p, (label, body)) in enumerate(zip(panels, copy)):
        x = 48 + i * (PW + 48)
        d.text((x, 34), f'0{i + 1}', font=font(MONO, 20), fill=GRASS)
        d.text((x + 38, 30), label, font=label_font, fill=FG)
        board.alpha_composite(rounded(p, 12), (x, 78))
        if i == 2:  # mark the sampled spot and show it magnified
            sx, sy = x + (LX - X0) * ZOOM, 78 + (LY - Y0) * ZOOM
            d.rectangle([sx, sy, sx + LS * ZOOM, sy + LS * ZOOM], outline=FG, width=2)
            lx, ly = x + PW - LS * LZ - 14, 78 + PH - LS * LZ - 14
            d.line([(sx + LS * ZOOM, sy + LS * ZOOM), (lx, ly)], fill=FG, width=2)
            d.rounded_rectangle([lx - 3, ly - 3, lx + LS * LZ + 2, ly + LS * LZ + 2], 8, fill=FG)
            board.alpha_composite(rounded(loupe, 6), (lx, ly))
        d.text((x, 544), body, font=body_font, fill=MUTED)
        if i < 2:  # chevron between panels
            cx, cy = x + PW + 24, 78 + PH // 2
            d.line([(cx - 6, cy - 12), (cx + 6, cy), (cx - 6, cy + 12)], fill=MUTED, width=3, joint='curve')
    os.makedirs(os.path.join(OUT, lang), exist_ok=True)
    board.save(os.path.join(OUT, lang, 'pipeline.webp'), quality=88, method=6)
print('boards written')
