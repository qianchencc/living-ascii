"""Wallpaper preview: one frame of the desktop loop and one of the phone loop,
side by side on a dark panel. No text: sizes and links live in the README.
Usage: wallpapers.py <desktop-frame.png> <phone-frame.png> <out.webp>
Needs only Pillow."""
import sys
from PIL import Image, ImageDraw

DESK, PHONE, OUT = sys.argv[1:4]
W, H, PAD_Y, GAP = 1200, 560, 60, 56
BG = (12, 16, 9)
SS = 4  # supersample the rounded masks so their edges stay smooth

def rounded(im, radius):
    big = Image.new('L', (im.width * SS, im.height * SS), 0)
    ImageDraw.Draw(big).rounded_rectangle((0, 0, big.width - 1, big.height - 1), radius * SS, fill=255)
    out = im.convert('RGBA')
    out.putalpha(big.resize(im.size, Image.LANCZOS))
    return out

def fit(path, h):
    im = Image.open(path).convert('RGB')
    return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)

ih = H - 2 * PAD_Y
desk, phone = fit(DESK, ih), fit(PHONE, ih)
x0 = (W - desk.width - GAP - phone.width) // 2

canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
canvas.paste(rounded(Image.new('RGB', (W, H), BG), 22), (0, 0))
canvas.alpha_composite(rounded(desk, 10), (x0, PAD_Y))
canvas.alpha_composite(rounded(phone, 30), (x0 + desk.width + GAP, PAD_Y))
canvas.save(OUT, 'WEBP', quality=88, method=6)
print(OUT, canvas.size)
