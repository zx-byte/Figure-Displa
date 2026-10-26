# -*- coding: utf-8 -*-
"""
「拾光手办」头像 · 最终方案。

结论依据前四轮试错：
- 剪影路线（圆头 + 梯形身 + 台座）无论配色、加发梢、加光晕，都脱离不了通用图标观感；
- 字形路线在 40px 下最稳，因为中文用户对字形本身就有辨识能力，不依赖图形简化。

本版只做三件事：视觉居中修正、字重与留白配比、一处克制的橙色点缀。
中文字体按 em box 居时会偏上（下方留了基线空间），anchor='mm' 拿到的是字体度量中线，
不是视觉中线，所以这里手动下移 3px。
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
WHITE = (255, 255, 255, 255)

FONT_BOLD = 'C:/Windows/Fonts/msyhbd.ttc'

TEXT = '拾'
FONT_SIZE = 86      # 字高占画布约 60%，四周留出圆形裁切安全区
BASELINE_Y = 70     # 视觉中线（字体度量中线 67 下移 3）


def s(v):
    return int(round(v * SCALE))


def base():
    img = Image.new('RGBA', (CANVAS, CANVAS), INK)
    d = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT_BOLD, s(FONT_SIZE))
    d.text((s(72), s(BASELINE_Y)), TEXT, font=font, fill=WHITE, anchor='mm')
    return img, d


def make_plain():
    """主推：纯字。信息最少，40px 下最清楚，也不容易被误认成别的图标"""
    return base()[0]


def make_line():
    """字 + 底部橙色短横，像正式品牌署名的下划强调"""
    img, d = base()
    d.rectangle([s(52), s(119), s(92), s(124)], fill=BRAND)
    return img


def make_dot():
    """字 + 右下橙色小方块，「格」的意象，比圆点更贴合「一拾一格」"""
    img, d = base()
    d.rectangle([s(100), s(96), s(116), s(112)], fill=BRAND)
    return img


def save(img, name):
    out = img.resize((SIZE, SIZE), Image.LANCZOS)
    path = os.path.join(OUT_DIR, name)
    out.save(path, 'PNG', optimize=True)
    return path


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    makers = [
        ('avatar-final-a.png', make_plain, '纯字（推荐）'),
        ('avatar-final-b.png', make_line, '字 + 橙色底划'),
        ('avatar-final-c.png', make_dot, '字 + 橙色方块'),
    ]

    paths = []
    for name, fn, desc in makers:
        p = save(fn(), name)
        paths.append((p, desc))
        print(f'{name:24s} {os.path.getsize(p):6d} bytes  {desc}')

    # 对照：大图 + 40px + 24px（会话列表里更小的一档）
    gap, cell = 26, 156
    sizes = [(40, 30), (24, 74)]
    W = len(paths) * (cell + gap) + gap
    H = gap + cell + 84
    canvas = Image.new('RGB', (W, H), (245, 245, 247))

    for i, (p, _) in enumerate(paths):
        icon = Image.open(p).convert('RGBA')
        x = gap + i * (cell + gap)

        big = icon.resize((cell, cell), Image.LANCZOS)
        mask = Image.new('L', (cell, cell), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, cell - 1, cell - 1], fill=255)
        canvas.paste(big, (x, gap), mask)

        for px, offset in sizes:
            tiny = icon.resize((px, px), Image.LANCZOS)
            tm = Image.new('L', (px, px), 0)
            ImageDraw.Draw(tm).ellipse([0, 0, px - 1, px - 1], fill=255)
            canvas.paste(tiny, (x + (cell - px) // 2, gap + cell + offset - 20), tm)

    canvas.save(os.path.join(OUT_DIR, 'avatar-final-compare.png'), 'PNG')
    print('\n对照图 → docs/brand/avatar-final-compare.png')
    print('（大图 / 40px / 24px 三档实际观感）')


if __name__ == '__main__':
    main()
