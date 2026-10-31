#!/usr/bin/env python3
"""Regenerates all PNG/ICO icons and screenshots (requires Pillow): python3 tools/make_icons.py"""
import os
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SS = 4  # supersampling for smooth edges

def icon(size, maskable=False, opaque=False):
    S = size * SS
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable or opaque:
        d.rectangle([0, 0, S, S], fill='#0f172a')
    else:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * .22), fill='#0f172a')
    k = (0.62 if maskable else 0.78) * S / 64          # shield scale (maskable keeps the 80% safe zone)
    ox = oy = S * (1 - (0.62 if maskable else 0.78)) / 2
    P = lambda x, y: (ox + (x - 8) * k * 64 / 48 * 48 / 64 * 1.0 if False else ox + (x - 12) * k * 64 / 40, oy + (y - 8) * k * 64 / 48)
    shield = [(32, 8), (52, 15), (52, 31), (46, 43), (32, 56), (18, 43), (12, 31), (12, 15)]
    pts = [(ox + (x - 12) / 40 * (S - 2 * ox), oy + (y - 8) / 48 * (S - 2 * oy)) for x, y in shield]
    d.polygon(pts, fill='#f59e0b')
    def q(x, y): return (ox + (x - 12) / 40 * (S - 2 * ox), oy + (y - 8) / 48 * (S - 2 * oy))
    w = int(S * (0.075 if not maskable else 0.06))
    chk = [q(22, 32), q(29, 39), q(43, 24)]
    d.line(chk, fill='#0b0f19', width=w, joint='curve')
    for (x, y) in chk: d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill='#0b0f19')
    return img.resize((size, size), Image.LANCZOS)

def font(sz):
    for f in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'):
        if os.path.exists(f): return ImageFont.truetype(f, sz)
    return ImageFont.load_default()

def shot(w, h, name):
    img = Image.new('RGB', (w, h), '#0b0f19'); d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w, int(h * .09)], fill='#0f172a')
    d.text((24, int(h * .02)), 'SafeSCADA HSE Audit', fill='#e8edf7', font=font(int(h * .04)))
    cols = 2 if w < 700 else 4
    cw = (w - 24 * (cols + 1)) // cols
    labels = [('Compliance index', '94%', '#34d399'), ('Open CAPA', '3', '#fbbf24'), ('High-risk permits', '2', '#e8edf7'), ('Days without LTI', '412', '#34d399')]
    for i, (l, v, c) in enumerate(labels):
        x = 24 + (i % cols) * (cw + 24); y = int(h * .14) + (i // cols) * int(h * .22)
        d.rounded_rectangle([x, y, x + cw, y + int(h * .19)], radius=14, fill='#0f172a', outline='#2a3550')
        d.text((x + 16, y + 14), l, fill='#a3b0c8', font=font(int(h * .028)))
        d.text((x + 16, y + int(h * .07)), v, fill=c, font=font(int(h * .065)))
    d.rounded_rectangle([24, int(h * .62), w - 24, int(h * .62) + int(h * .12)], radius=14, fill='#f59e0b')
    d.text((44, int(h * .62) + int(h * .035)), 'New audit', fill='#0b0f19', font=font(int(h * .045)))
    img.save(os.path.join(ROOT, 'screenshots', name))

os.makedirs(os.path.join(ROOT, 'icons'), exist_ok=True)
os.makedirs(os.path.join(ROOT, 'screenshots'), exist_ok=True)
for s in (72, 96, 128, 144, 152, 192, 384, 512):
    icon(s).save(os.path.join(ROOT, 'icons', f'icon-{s}.png'))
for s in (192, 512):
    icon(s, maskable=True).save(os.path.join(ROOT, 'icons', f'icon-maskable-{s}.png'))
icon(180, opaque=True).convert('RGB').save(os.path.join(ROOT, 'apple-touch-icon.png'))
icon(256).save(os.path.join(ROOT, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
shot(1280, 720, 'wide.png'); shot(540, 960, 'narrow.png')
print('icons + screenshots generated')
