# -*- coding: utf-8 -*-
"""
「拾光手办」头像方案 v3。

v1/v2 的问题是：圆头 + 梯形身的剪影本质上是通用 avatar icon，抽象到没有设计语言。
这一版换成四个构图方向，靠「构图」而不是「造型细节」拉开差距：

  1 追光 —— 深色底 + 底部暖光 + 逆光剪影（呼应「拾光」，有氛围）
  2 分色 —— 上橙下黑 + 白色剪影横跨分割线（现代 logo 手法，小尺寸最清晰）
  3 字形 —— 墨黑底 + 白色「拾」字 + 橙色点缀（中文品牌最常见也最稳的做法）
  4 负形 —— 橙色底 + 白色圆 + 挖空的手办（负空间，最简洁）
"""

import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'docs', 'brand')

SIZE = 144
SCALE = 4
CANVAS = SIZE * SCALE

INK = (20, 20, 26, 255)
INK_DEEP = (14, 14, 18, 255)
BRAND = (255, 92, 57, 255)
BRAND_DEEP = (232, 69, 31, 255)
BRAND_LIGHT = (255, 140, 92, 255)
WHITE = (255, 255, 255, 255)

FONT_BOLD = 'C:/Windows/Fonts/msyhbd.ttc'   # 微软雅黑 Bold


def s(v):
    return int(round(v * SCALE))


def figure_polygon():
    """手办身体：颈部收窄 → 肩部外扩 → 向下张开"""
    return [
        (s(64), s(68)), (s(80), s(68)), (s(85), s(78)),
        (s(88), s(103)), (s(56), s(103)), (s(59), s(78)),
    ]


def draw_figure(d, body, base):
    """大头 + 收肩短身 + 椭圆台座"""
    d.ellipse([s(40), s(96), s(104), s(114)], fill=base)
    d.polygon(figure_polygon(), fill=body)
    d.rectangle([s(68), s(58), s(76), s(72)], fill=body)
    d.ellipse([s(51), s(23), s(93), s(65)], fill=body)


# ---------------- 方案 1：追光 ----------------
def make_glow():
    img = Image.new('RGBA', (CANVAS, CANVAS), INK_DEEP)

    # 底部向上的暖色光晕，用 numpy 算径向衰减，比多层圆叠加更平滑
    yy, xx = np.ogrid[:CANVAS, :CANVAS]
    cx, cy = s(72), s(126)
    radius = s(112)
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / radius
    dist = np.clip(dist, 0, 1)
    alpha = ((1 - dist) ** 2.4 * 230).astype(np.uint8)

    glow = Image.new('RGBA', (CANVAS, CANVAS), BRAND[:3] + (0,))
    glow.putalpha(Image.fromarray(alpha))
    img = Image.alpha_composite(img, glow)

    d = ImageDraw.Draw(img)
    draw_figure(d, WHITE, (255, 255, 255, 235))
    return img


# ---------------- 方案 2：分色 ----------------
def make_split():
    img = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    mid = s(74)
    d.rectangle([0, 0, CANVAS, mid], fill=BRAND)
    d.rectangle([0, mid, CANVAS, CANVAS], fill=INK)

    draw_figure(d, WHITE, WHITE)
    return img


# ---------------- 方案 3：字形 ----------------
def make_wordmark():
    img = Image.new('RGBA', (CANVAS, CANVAS), INK)
    d = ImageDraw.Draw(img)

    font = ImageFont.truetype(FONT_BOLD, s(84))
    # 「拾」字本身结构左右分明，居中后右侧略空，向右微调 1px 视觉更平衡
    d.text((s(73), s(70)), '拾', font=font, fill=WHITE, anchor='mm')

    # 右下角一个橙色圆点，既是装饰也是「光」的落点
    d.ellipse([s(100), s(100), s(118), s(118)], fill=BRAND)
    return img


# ---------------- 方案 4：负形 ----------------
def make_negative():
    img = Image.new('RGBA', (CANVAS, CANVAS), BRAND)
    d = ImageDraw.Draw(img)

    # 白色大圆
    d.ellipse([s(16), s(16), s(128), s(128)], fill=WHITE)

    # 圆内挖出手办，露出底色的橙
    mask = Image.new('L', (CANVAS, CANVAS), 0)
    md = ImageDraw.Draw(mask)
    draw_figure(md, 255, 255)

    cut = Image.new('RGBA', (CANVAS, CANVAS), BRAND)
    img.paste(cut, (0, 0), mask)
    return img


def save(img, name):
    out = img.resize((SIZE, SIZE), Image.LANCZOS)
    path = os.path.join(OUT_DIR, name)
    out.save(path, 'PNG', optimize=True)
    return path


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    makers = [
        ('avatar-v3-1-glow.png', make_glow, '追光：深底 + 暖光 + 逆光剪影'),
        ('avatar-v3-2-split.png', make_split, '分色：上橙下黑 + 白剪影'),
        ('avatar-v3-3-word.png', make_wordmark, '字形：墨黑 + 拾字 + 橙点'),
        ('avatar-v3-4-negative.png', make_negative, '负形：橙底 + 白圆挖空'),
    ]

    paths = []
    for name, fn, desc in makers:
        p = save(fn(), name)
        paths.append((p, desc))
        print(f'{name:28s} {os.path.getsize(p):6d} bytes  {desc}')

    # 对照图：两排，上排放大 + 圆形裁切，下排 40px 列表实际观感
    gap, cell, small = 26, 160, 40
    cols = len(paths)
    W = cols * (cell + gap) + gap
    H = gap + cell + 22 + small + gap + 10

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
        canvas.paste(tiny, (x + (cell - small) // 2, gap + cell + 22), tmask)

    canvas.save(os.path.join(OUT_DIR, 'avatar-v3-compare.png'), 'PNG')
    print('\n对照图 → docs/brand/avatar-v3-compare.png')
    print('（上排放大、下排 40px 列表实际观感）')


if __name__ == '__main__':
    main()
