# -*- coding: utf-8 -*-
"""
生成演示用商品图。

云开发环境未就绪时，mock 数据里的商品需要一个占位图，否则页面全是灰块，
看不出真实版式。这里生成 6 张 600x600 的抽象商品图，构图模仿产品摄影：
渐变背景 + 居中主体 + 底部投影。

这些图仅用于本地预览，正式商品的图片由商家在后台自行上传。
"""

import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'miniprogram', 'images', 'demo')

SIZE = 600


def gradient(size, c1, c2, angle='diag'):
    """线性渐变背景"""
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    if angle == 'diag':
        t = (x + y) / (2 * (size - 1))
    elif angle == 'vertical':
        t = y / (size - 1)
    else:
        t = x / (size - 1)

    img = np.zeros((size, size, 3), dtype=np.float32)
    for i in range(3):
        img[:, :, i] = c1[i] + (c2[i] - c1[i]) * t
    return Image.fromarray(img.astype(np.uint8), 'RGB').convert('RGBA')


def radial_mask(size, cx, cy, rx, ry, softness=0.55):
    """椭圆径向遮罩，用于柔和的投影与光斑"""
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    d = np.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2)
    a = np.clip((1 - d) / softness, 0, 1) * 255
    return Image.fromarray(a.astype(np.uint8), 'L')


def build_figure(size, body_color):
    """抽象手办主体：圆头 + 梯形身 + 台座，用半透明色块堆叠"""
    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    cx = size // 2
    head_r = int(size * 0.11)
    head_cy = int(size * 0.34)

    # 台座
    d.ellipse([cx - int(size * 0.17), int(size * 0.72),
               cx + int(size * 0.17), int(size * 0.79)], fill=body_color)

    # 身体
    d.polygon([
        (cx - int(size * 0.075), int(size * 0.46)),
        (cx + int(size * 0.075), int(size * 0.46)),
        (cx + int(size * 0.105), int(size * 0.73)),
        (cx - int(size * 0.105), int(size * 0.73)),
    ], fill=body_color)

    # 颈部
    d.rectangle([cx - int(size * 0.022), int(size * 0.40),
                 cx + int(size * 0.022), int(size * 0.47)], fill=body_color)

    # 头
    d.ellipse([cx - head_r, head_cy - head_r, cx + head_r, head_cy + head_r], fill=body_color)

    return layer


def make_card(name, c1, c2, body_rgba, glow_rgba):
    """
    构图顺序：渐变底 → 主体后方的柔和逆光 → 地面投影 → 白色主体。
    逆光放在主体之前，这样它衬托轮廓而不会盖住主体。
    """
    base = gradient(SIZE, c1, c2)

    # 主体后方的柔光，营造「展台打光」的层次
    glow = Image.new('RGBA', (SIZE, SIZE), glow_rgba[:3] + (0,))
    glow.putalpha(radial_mask(SIZE, SIZE * 0.5, SIZE * 0.42, SIZE * 0.34, SIZE * 0.36, softness=0.9))
    base = Image.alpha_composite(base, glow)

    # 地面投影
    shadow = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.ellipse([SIZE * 0.29, SIZE * 0.735, SIZE * 0.71, SIZE * 0.80], fill=(0, 0, 0, 90))
    shadow = shadow.filter(ImageFilter.GaussianBlur(SIZE * 0.03))
    base = Image.alpha_composite(base, shadow)

    # 主体
    base = Image.alpha_composite(base, build_figure(SIZE, body_rgba))

    path = os.path.join(OUT_DIR, name)
    base.convert('RGB').save(path, 'JPEG', quality=88, optimize=True)
    return path


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    # 深色背景衬托白色主体，接近手办棚拍的处理方式
    cards = [
        ('demo-1.jpg', (43, 35, 64), (107, 58, 143), (255, 255, 255, 236), (255, 255, 255, 42)),
        ('demo-2.jpg', (26, 42, 74), (58, 90, 138), (255, 255, 255, 236), (255, 255, 255, 42)),
        ('demo-3.jpg', (26, 58, 50), (42, 106, 85), (255, 255, 255, 236), (255, 255, 255, 42)),
        ('demo-4.jpg', (58, 42, 26), (122, 74, 42), (255, 255, 255, 236), (255, 255, 255, 42)),
        ('demo-5.jpg', (58, 26, 42), (122, 42, 74), (255, 255, 255, 236), (255, 255, 255, 42)),
        ('demo-6.jpg', (34, 34, 46), (68, 68, 90), (255, 255, 255, 236), (255, 255, 255, 42)),
    ]

    for name, c1, c2, body, glow in cards:
        p = make_card(name, c1, c2, body, glow)
        print(f'{name:14s} {os.path.getsize(p):7d} bytes')

    print(f'\n共 {len(cards)} 张 → {OUT_DIR}')


if __name__ == '__main__':
    main()
