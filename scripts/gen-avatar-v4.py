# -*- coding: utf-8 -*-
"""
「拾光手办」头像方案 v4。

v1-v3 的教训：圆头 + 梯形身 + 台座的剪影，无论怎么配色都像通用 avatar icon。
通用用户图标的特征是「完美对称 + 无头发 + 无姿态」，只要不打破这三点，改色无用。

这一版两个方向：
  A 字形路线（主推）——“拾”字做主体，靠字体本身承担辨识度，小尺寸下最稳
  B 剪影路线（验证）——给剪影加发梢与呆毛，打破「光头 + 对称圆」的图标感
"""

import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'docs', 'brand')

SIZE = 144
SCALE = 4
CANVAS = SIZE * SCALE

INK = (20, 20, 26, 255)
BRAND = (255, 92, 57, 255)
BRAND_DEEP = (232, 69, 31, 255)
WHITE = (255, 255, 255, 255)

FONT_BOLD = 'C:/Windows/Fonts/msyhbd.ttc'


def s(v):
    return int(round(v * SCALE))


def draw_figure(d, body, base, with_hair=True):
    """
    手办剪影。with_hair 为真时加发梢与呆毛，
    打破「光头 + 对称」的通用图标感。
    """
    if with_hair:
        # 呆毛：头顶一小撮，二次元手办的标志
        d.polygon([(s(69), s(26)), (s(73), s(13)), (s(79), s(25))], fill=body)
        # 左右发梢：向外下方挑出，形成不对称的头部轮廓
        d.polygon([(s(54), s(38)), (s(42), s(60)), (s(56), s(54))], fill=body)
        d.polygon([(s(90), s(38)), (s(102), s(58)), (s(88), s(53))], fill=body)

    d.ellipse([s(40), s(96), s(104), s(114)], fill=base)
    d.polygon([(s(64), s(68)), (s(80), s(68)), (s(85), s(78)),
               (s(88), s(103)), (s(56), s(103)), (s(59), s(78))], fill=body)
    d.rectangle([s(68), s(58), s(76), s(72)], fill=body)
    d.ellipse([s(51), s(23), s(93), s(65)], fill=body)


# ---------------- A 系列：字形 ----------------
def _word_base():
    img = Image.new('RGBA', (CANVAS, CANVAS), INK)
    d = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT_BOLD, s(88))
    d.text((s(72), s(68)), '拾', font=font, fill=WHITE, anchor='mm')
    return img, d


def word_plain():
    """纯字，最干净"""
    return _word_base()[0]


def word_underline():
    """字 + 底部橙色短线，稳重，像正式品牌标识"""
    img, d = _word_base()
    d.rectangle([s(46), s(122), s(98), s(127)], fill=BRAND)
    return img


def word_frame():
    """字 + 橙色细圆环，呼应「展示格 / 取景框」"""
    img, d = _word_base()
    d.ellipse([s(9), s(9), s(135), s(135)], outline=BRAND, width=s(3))
    return img


# ---------------- B 系列：改进剪影 ----------------
def figure_dark():
    """墨黑底 + 白剪影（带头发），橙色台座"""
    img = Image.new('RGBA', (CANVAS, CANVAS), INK)
    d = ImageDraw.Draw(img)
    draw_figure(d, WHITE, BRAND)
    return img


def figure_brand():
    """品牌橙底 + 白剪影（带头发），深橙台座"""
    img = Image.new('RGBA', (CANVAS, CANVAS), BRAND)
    d = ImageDraw.Draw(img)
    draw_figure(d, WHITE, BRAND_DEEP)
    return img


def save(img, name):
    out = img.resize((SIZE, SIZE), Image.LANCZOS)
    path = os.path.join(OUT_DIR, name)
    out.save(path, 'PNG', optimize=True)
    return path


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    makers = [
        ('avatar-v4-a1-word.png', word_plain, '纯字：墨黑 + 白色「拾」'),
        ('avatar-v4-a2-underline.png', word_underline, '字 + 橙色底划'),
        ('avatar-v4-a3-frame.png', word_frame, '字 + 橙色圆环'),
        ('avatar-v4-b1-figure.png', figure_dark, '剪影（加发梢）+ 墨底'),
        ('avatar-v4-b2-figure.png', figure_brand, '剪影（加发梢）+ 橙底'),
    ]

    paths = []
    for name, fn, desc in makers:
        p = save(fn(), name)
        paths.append((p, desc))
        print(f'{name:30s} {os.path.getsize(p):6d} bytes  {desc}')

    gap, cell, small = 24, 150, 40
    cols = len(paths)
    W = cols * (cell + gap) + gap
    H = gap + cell + 20 + small + gap + 8

    canvas = Image.new('RGB', (W, H), (245, 245, 247))

    for i, (p, _) in enumerate(paths):
        icon = Image.open(p).convert('RGBA')
        x = gap + i * (cell + gap)

        big = icon.resize((cell, cell), Image.LANCZOS)
        mask = Image.new('L', (cell, cell), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, cell - 1, cell - 1], fill=255)
        canvas.paste(big, (x, gap), mask)

        tiny = icon.resize((small, small), Image.LANCZOS)
        tmask = Image.new('L', (small, small), 0)
        ImageDraw.Draw(tmask).ellipse([0, 0, small - 1, small - 1], fill=255)
        canvas.paste(tiny, (x + (cell - small) // 2, gap + cell + 20), tmask)

    canvas.save(os.path.join(OUT_DIR, 'avatar-v4-compare.png'), 'PNG')
    print('\n对照图 → docs/brand/avatar-v4-compare.png')


if __name__ == '__main__':
    main()
