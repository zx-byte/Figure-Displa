# -*- coding: utf-8 -*-
"""
生成 360° 环绕帧序列（第三版）。

前两版的问题：造型太抽象（像雪人或奖杯），旋转线索弱，转到背面就"看不出转了"。

这一版换了旋转线索的设计——用**双马尾**代替呆毛：
- 正面：两个马尾分列左右两侧
- 侧面：两个马尾都滑到中间，被头部挡住
- 背面：两个马尾交换左右位置

位置变化比轮廓宽度变化明显得多，用户一眼能看出"转过去了"。

遮挡关系按深度排序：drawn 在前的马尾会盖住头，在后的被头盖住。
"""

import math
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'miniprogram', 'images', 'panorama')

FRAMES = 24
SIZE = 500
SS = 3
CANVAS = SIZE * SS

WHITE = (255, 255, 255, 255)
SHADE = (198, 198, 214, 255)
DARKER = (156, 156, 176, 255)
BODYC = (226, 226, 238, 255)
SKIRTC = (176, 176, 196, 255)
BASEC = (212, 212, 228, 255)
EYE = (26, 26, 36, 255)

# 几何尺寸（画布比例，y 轴向上）
HEAD_R = 0.090
HEAD_Y = 0.215

TAIL_R = 0.044
TAIL_X = 0.104
TAIL_Y = 0.190

BODY_W, BODY_D = 0.078, 0.048
BODY_TOP, BODY_BOTTOM = 0.130, 0.020

SKIRT_TOP_W, SKIRT_BOTTOM_W = 0.082, 0.150
SKIRT_D_W, SKIRT_D = 0.052, 0.115
SKIRT_TOP, SKIRT_BOTTOM = 0.028, -0.088

BASE_W, BASE_D, BASE_H = 0.128, 0.112, 0.026
BASE_Y = -0.108

EYE_X, EYE_Y, EYE_Z = 0.034, 0.232, 0.070
EYE_R = 0.0115


def bg_layer(size):
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    cx, cy = size / 2.0, size * 0.42
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / (size * 0.80)
    dist = np.clip(dist, 0, 1)
    t = (1 - dist) ** 1.8

    inner = np.array([62, 56, 80], dtype=np.float32)
    outer = np.array([13, 13, 17], dtype=np.float32)
    rgb = outer[None, None, :] + (inner - outer)[None, None, :] * t[:, :, None]
    return Image.fromarray(rgb.astype(np.uint8), 'RGB').convert('RGBA')


def render(theta_deg):
    img = bg_layer(CANVAS)
    layer = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))

    th = math.radians(theta_deg)
    ct, st = math.cos(th), math.sin(th)

    cx, cy = CANVAS / 2, CANVAS / 2
    L = CANVAS * 1.08

    def sx(x, z):
        return cx + (x * ct + z * st) * L

    def sy(y):
        return cy - y * L

    def w_at(w, dep):
        return 2 * math.sqrt((w * ct) ** 2 + (dep * st) ** 2) * L

    # --- 地面投影 ---
    sh_w = w_at(BASE_W * 1.2, BASE_D * 1.2)
    sh = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    sd.ellipse([cx - sh_w / 2, sy(BASE_Y) - sh_w * 0.06,
                cx + sh_w / 2, sy(BASE_Y) + sh_w * 0.06], fill=(0, 0, 0, 115))
    sh = sh.filter(ImageFilter.GaussianBlur(CANVAS * 0.013))
    layer = Image.alpha_composite(layer, sh)

    d = ImageDraw.Draw(layer)

    # --- 底座 ---
    base_w = w_at(BASE_W, BASE_D)
    base_h = BASE_H * L
    d.ellipse([cx - base_w / 2, sy(BASE_Y) + base_h * 0.1, cx + base_w / 2, sy(BASE_Y) + base_h * 1.4],
              fill=BASEC)
    d.ellipse([cx - base_w / 2, sy(BASE_Y) - base_h * 0.8, cx + base_w / 2, sy(BASE_Y) + base_h * 0.45],
              fill=(240, 240, 248, 255))

    # --- 裙子：梯形 ---
    skirt_top_w = w_at(SKIRT_TOP_W, SKIRT_D_W)
    skirt_bottom_w = w_at(SKIRT_BOTTOM_W, SKIRT_D)
    d.polygon([
        (cx - skirt_top_w / 2, sy(SKIRT_TOP)),
        (cx + skirt_top_w / 2, sy(SKIRT_TOP)),
        (cx + skirt_bottom_w / 2, sy(SKIRT_BOTTOM)),
        (cx - skirt_bottom_w / 2, sy(SKIRT_BOTTOM)),
    ], fill=SKIRTC)

    # --- 身体：柱 ---
    body_w = w_at(BODY_W, BODY_D)
    d.rounded_rectangle([cx - body_w / 2, sy(BODY_TOP), cx + body_w / 2, sy(BODY_BOTTOM)],
                        radius=body_w * 0.3, fill=BODYC)

    # --- 双马尾与头按深度排序：先画远侧的，再画头，最后画近侧的 ---
    parts = [(0.0, 'head')]
    for side in (-1, 1):
        x = side * TAIL_X
        depth = -x * st
        parts.append((depth, 'tail', side))
    parts.sort(key=lambda p: p[0])

    hr = HEAD_R * L
    tr = TAIL_R * L

    for part in parts:
        if part[1] == 'head':
            d.ellipse([cx - hr, sy(HEAD_Y) - hr, cx + hr, sy(HEAD_Y) + hr], fill=WHITE)

            # 眼睛：贴在前半球，背面不可见
            for ex in (-EYE_X, EYE_X):
                zr = -ex * st + EYE_Z * ct
                if zr <= 0.005:
                    continue
                exs = sx(ex, EYE_Z)
                if abs(exs - cx) > hr * 0.9:
                    continue
                r = EYE_R * L * (0.6 + 0.4 * min(1.0, zr / EYE_Z))
                d.ellipse([exs - r, sy(EYE_Y) - r, exs + r, sy(EYE_Y) + r], fill=EYE)

            # 高光
            hl = hr * 0.17
            d.ellipse([cx - hr * 0.45 - hl, sy(HEAD_Y) - hr * 0.45 - hl,
                       cx - hr * 0.45 + hl, sy(HEAD_Y) - hr * 0.45 + hl],
                      fill=(255, 255, 255, 75))
        else:
            side = part[2]
            tail_screen = sx(side * TAIL_X, 0)
            tail_depth = -side * TAIL_X * st
            color = SHADE if tail_depth > 0 else DARKER
            d.ellipse([tail_screen - tr, sy(TAIL_Y) - tr,
                       tail_screen + tr, sy(TAIL_Y) + tr], fill=color)

    img = Image.alpha_composite(img, layer)
    return img.resize((SIZE, SIZE), Image.LANCZOS)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    total = 0
    for i in range(FRAMES):
        frame = render(360.0 * i / FRAMES)
        p = os.path.join(OUT_DIR, f'p-{i:02d}.jpg')
        frame.convert('RGB').save(p, 'JPEG', quality=82, optimize=True)
        total += os.path.getsize(p)

    print(f'生成 {FRAMES} 帧，总体积 {total / 1024:.0f} KB，平均 {total / FRAMES / 1024:.1f} KB/帧')

    thumb = 118
    canvas = Image.new('RGB', (8 * (thumb + 6) + 6, 3 * (thumb + 6) + 6), (245, 245, 247))
    for i in range(FRAMES):
        im = Image.open(os.path.join(OUT_DIR, f'p-{i:02d}.jpg')).resize((thumb, thumb), Image.LANCZOS)
        canvas.paste(im, (6 + (i % 8) * (thumb + 6), 6 + (i // 8) * (thumb + 6)))
    canvas.save(os.path.join(ROOT, 'docs', 'panorama-frames.png'), 'PNG')
    print('检查图 → docs/panorama-frames.png')


if __name__ == '__main__':
    main()
