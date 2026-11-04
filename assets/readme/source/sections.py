"""Section headers: a number, a title, and a small field of stroke glyphs
turning in a wave, the same thing the ASCII layer draws. Each section shows
the wave at a later moment, so reading down the page plays it forward.
Writes assets/readme/<lang>/section-*.svg."""
import math, os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..')
BG, FG, MUTED, GRASS, DEEP = '#0c1009', '#eef0dc', '#93a07a', '#c4dd78', '#3b5120'
SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"

SECTIONS = {
    'what': ('01', {'en': ('What it does', 'A still image in, a seamless loop out'),
                    'zh': ('它做了什么', '一张静态图进去，一段无缝循环出来')}),
    'how': ('02', {'en': ('How it works', 'Strands sway like a school of fish; glyphs follow'),
                   'zh': ('怎么做到的', '草叶像鱼群一样摆动，字符跟着草叶转')}),
    'start': ('03', {'en': ('Get started', 'Run it yourself, or hand it to Claude Code'),
                     'zh': ('开始用', '自己跑，或者直接交给 Claude Code')}),
}

def mix(a, b, t):
    pa = [int(a[i:i + 2], 16) for i in (1, 3, 5)]
    pb = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return '#' + ''.join(f'{round(x + (y - x) * t):02x}' for x, y in zip(pa, pb))

def strokes(phase, x0=812, y0=28, cols=15, rows=4, cw=22, ch=24):
    out = []
    for r in range(rows):
        for c in range(cols):
            u = c / cols
            ang = 0.95 + 0.75 * math.sin(2 * math.pi * (1.1 * u + 0.18 * r) - phase)
            lum = 0.5 + 0.5 * math.sin(2 * math.pi * (0.8 * u - 0.12 * r) - phase + 1.3)
            fade = min(1.0, (c + 1) / 5)
            cx, cy = x0 + c * cw + cw / 2, y0 + r * ch + ch / 2
            dx, dy = 8.5 * math.cos(ang), -8.5 * math.sin(ang)
            out.append(f'<line x1="{cx - dx:.1f}" y1="{cy - dy:.1f}" x2="{cx + dx:.1f}" y2="{cy + dy:.1f}" '
                       f'stroke="{mix(DEEP, GRASS, lum)}" opacity="{fade:.2f}"/>')
    return '\n    '.join(out)

def svg(num, title, sub, phase, lang):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="148" viewBox="0 0 1200 148" role="img" aria-labelledby="t d">
  <title id="t">{num} {title}</title>
  <desc id="d">{sub}</desc>
  <rect width="1200" height="148" rx="22" fill="{BG}"/>
  <text x="56" y="80" font-family="{MONO}" font-size="26" font-weight="600" fill="{GRASS}">{num}</text>
  <text x="112" y="82" font-family="{SANS}" font-size="44" font-weight="700" fill="{FG}">{title}</text>
  <text x="114" y="118" font-family="{SANS}" font-size="21" fill="{MUTED}">{sub}</text>
  <g stroke-width="3.4" stroke-linecap="round">
    {strokes(phase)}
  </g>
</svg>
'''

for k, (key, (num, langs)) in enumerate(SECTIONS.items()):
    for lang, (title, sub) in langs.items():
        os.makedirs(os.path.join(OUT, lang), exist_ok=True)
        with open(os.path.join(OUT, lang, f'section-{key}.svg'), 'w') as f:
            f.write(svg(num, title, sub, 1.1 * k, lang))
print('sections written')
