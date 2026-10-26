# -*- coding: utf-8 -*-
"""
生成小程序头像候选方案（第二版）。

设计要点：
- 手办的可识别特征是「大头 + 小身 + 台座」，三者缺一就像通用用户图标；
- 微信头像在列表里只有约 40px，必须用大色块，避免细线条；
- 头像会被裁成圆形，主体控制在中心直径约 112px 的安全圆内。
"""

import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'docs', 'brand')

SIZE = 144
SCALE = 4
CANVAS = SIZE * SCALE

INK = (26, 26, 36, 255)          # #1A1A24
BRAND = (255, 92, 57, 255)       # #FF5C39
BRAND_DEEP = (232, 69, 31, 255)  # #E8451F
BRAND_LIGHT = (255, 138, 91, 255)
WHITE = (255, 255, 255, 255)


def s(v):
    return int(round(v * SCALE))


def linear_gradient(size, c1, c2, diagonal=True):
    img = Image.new('RGB', (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = ((x + y) / (2 * (size - 1))) if diagonal else (y / (size - 1))
            px[x, y] = (
                int(c1[0] + (c2[0] - c1[0]) * t),
                int(c1[1] + (c2[1] - c1[1]) * t),
                int(c1[2] + (c2[2] - c1[2]) * t),
            )
    return img.convert('RGBA')


def draw_figure(d, body_color, base_color, head_color=None):
    """
    绘制 Q 版手办剪影：大头 + 带肩的身体 + 椭圆台座
    坐标基于 144x144 空间
    """
    head_color = head_color or body_color

    # 台座（先画，让身体压在它上面）
    d.ellipse([s(40), s(96), s(104), s(114)], fill=base_color)

    # 身体：颈部收窄 → 肩部外扩 → 向下张开，避免整体轮廓像钥匙孔
    d.polygon([
        (s(64), s(68)),
        (s(80), s(68)),
        (s(85), s(78)),
        (s(88), s(103)),
        (s(56), s(103)),
        (s(59), s(78)),
    ], fill=body_color)

    # 颈部
    d.rectangle([s(68), s(58), s(76), s(72)], fill=body_color)

    # 头：刻意放大，形成 Q 版比例
    d.ellipse([s(51), s(23), s(93), s(65)], fill=head_color)


def make_a():
    """方案 A：墨黑底 + 白色手办 + 橙色台座（对比最强，列表里最清晰）"""
    img = Image.new('RGBA', (CANVAS, CANVAS), INK)
    d = ImageDraw.Draw(img)
    draw_figure(d, WHITE, BRAND)
    return img


def make_b():
    """方案 B：品牌橙渐变底 + 白色手办 + 深橙台座（品牌感最强）"""
    img = linear_gradient(CANVAS, BRAND_LIGHT, BRAND)
    d = ImageDraw.Draw(img)
    draw_figure(d, WHITE, BRAND_DEEP)
    return img


def make_c():
    """方案 C：白底 + 墨黑手办 + 橙色台座（最克制，适合浅色界面）"""
    img = Image.new('RGBA', (CANVAS, CANVAS), WHITE)
    d = ImageDraw.Draw(img)
    draw_figure(d, INK, BRAND)
    return img


def save(img, name):
    out = img.resize((SIZE, SIZE), Image.LANCZOS)
    path = os.path.join(OUT_DIR, name)
    out.save(path, 'PNG', optimize=True)
    return path


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    makers = [
        ('avatar-a.png', make_a, '墨黑底 + 橙台座'),
        ('avatar-b.png', make_b, '橙渐变底'),
        ('avatar-c.png', make_c, '白底 + 墨黑'),
    ]

    paths = []
    for name, fn, desc in makers:
        p = save(fn(), name)
        paths.append((p, desc))
        print(f'{name:16s} {os.path.getsize(p):6d} bytes  {desc}')

    # 对照图：三个方案分别按圆形裁切展示，另附 40px 小尺寸模拟列表内效果
    gap, cell = 30, 170
    small = 40
    W = len(paths) * (cell + gap) + gap
    H = cell + gap * 2 + small + 40
    canvas = Image.new('RGB', (W, H), (245, 245, 247))
    draw = ImageDraw.Draw(canvas)

    for i, (p, _) in enumerate(paths):
        icon = Image.open(p).convert('RGBA')
        big = icon.resize((cell, cell), Image.LANCZOS)

        mask = Image.new('L', (cell, cell), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, cell - 1, cell - 1], fill=255)
        x = gap + i * (cell + gap)
        canvas.paste(big, (x, gap), mask)

        # 小尺寸模拟（列表内实际观感）
        tiny = icon.resize((small, small), Image.LANCZOS)
        tmask = Image.new('L', (small, small), 0)
        ImageDraw.Draw(tmask).ellipse([0, 0, small - 1, small - 1], fill=255)
        canvas.paste(tiny, (x + (cell - small) // 2, gap + cell + 24), tmask)

    canvas.save(os.path.join(OUT_DIR, 'avatar-compare.png'), 'PNG')
    print('\n对照图 → docs/brand/avatar-compare.png')
    print('（上排为放大效果，下排为列表内 40px 实际观感）')


if __name__ == '__main__':
    main()
