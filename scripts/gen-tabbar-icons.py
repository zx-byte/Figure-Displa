# -*- coding: utf-8 -*-
"""
生成 tabBar 图标。

输出 8 个 PNG：4 个 tab × 2 种状态（普通 / 选中），统一 81x81。
坐标系按 81x81 设计，绘制时整体放大 SCALE 倍后再降采样，保证边缘平滑。
"""

import os
from PIL import Image, ImageDraw

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       'miniprogram', 'images', 'tabbar')

SIZE = 81            # 最终尺寸
SCALE = 4            # 超采样倍数
CANVAS = SIZE * SCALE
STROKE = 4 * SCALE   # 线宽（最终 4px）

COLOR_NORMAL = (138, 138, 158, 255)   # #8A8A9E
COLOR_ACTIVE = (255, 92, 57, 255)     # #FF5C39


def s(v):
    """把 81 空间坐标换算到超采样画布"""
    return v * SCALE


def pt(x, y):
    return (s(x), s(y))


def new_canvas():
    img = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def save(img, name):
    img = img.resize((SIZE, SIZE), Image.LANCZOS)
    path = os.path.join(OUT_DIR, name)
    img.save(path, 'PNG', optimize=True)
    return path


def draw_home(color):
    """首页：屋顶折线 + 墙体 + 门"""
    img, d = new_canvas()

    # 屋顶
    d.line([pt(40.5, 14), pt(13, 38), pt(68, 38), pt(40.5, 14)],
           fill=color, width=STROKE, joint='curve')
    # 左右墙
    d.line([pt(19.5, 36), pt(19.5, 66)], fill=color, width=STROKE)
    d.line([pt(61.5, 36), pt(61.5, 66)], fill=color, width=STROKE)
    # 地线
    d.line([pt(19.5, 66), pt(61.5, 66)], fill=color, width=STROKE)
    # 门
    d.line([pt(34, 66), pt(34, 51), pt(47, 51), pt(47, 66)],
           fill=color, width=STROKE, joint='curve')

    return img


def draw_category(color):
    """分类：2x2 圆角方块，右上角实心以形成区分"""
    img, d = new_canvas()

    box, gap, start, radius = 21, 6, 15, 5
    positions = [
        (start, start),
        (start + box + gap, start),
        (start, start + box + gap),
        (start + box + gap, start + box + gap)
    ]

    for i, (x, y) in enumerate(positions):
        rect = [s(x), s(y), s(x + box), s(y + box)]
        r = s(radius)
        if i == 1:
            d.rounded_rectangle(rect, radius=r, fill=color)
        else:
            d.rounded_rectangle(rect, radius=r, outline=color, width=STROKE)

    return img


def draw_cart(color):
    """购物车：购物袋 + 提手弧"""
    img, d = new_canvas()

    # 袋身梯形
    d.line([pt(18, 34), pt(63, 34), pt(59, 67), pt(22, 67), pt(18, 34)],
           fill=color, width=STROKE, joint='curve')

    # 提手
    r = 11.5
    cx, cy = 40.5, 34
    d.arc([s(cx - r), s(cy - r), s(cx + r), s(cy + r)],
          start=180, end=360, fill=color, width=STROKE)

    return img


def draw_user(color):
    """我的：圆头 + 肩部弧"""
    img, d = new_canvas()

    head_r = 10.5
    hx, hy = 40.5, 26
    d.ellipse([s(hx - head_r), s(hy - head_r), s(hx + head_r), s(hy + head_r)],
              outline=color, width=STROKE)

    body_r = 19
    bx, by = 40.5, 71
    d.arc([s(bx - body_r), s(by - body_r), s(bx + body_r), s(by + body_r)],
          start=180, end=360, fill=color, width=STROKE)

    # 肩部两端下探一点，避免半圆悬空
    d.line([pt(bx - body_r, by), pt(bx - body_r, by + 3)], fill=color, width=STROKE)
    d.line([pt(bx + body_r, by), pt(bx + body_r, by + 3)], fill=color, width=STROKE)

    return img


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    icons = {
        'home': draw_home,
        'category': draw_category,
        'cart': draw_cart,
        'user': draw_user
    }

    generated = []
    for name, fn in icons.items():
        p1 = save(fn(COLOR_NORMAL), f'{name}.png')
        p2 = save(fn(COLOR_ACTIVE), f'{name}-active.png')
        generated.extend([p1, p2])

    for p in generated:
        size = os.path.getsize(p)
        flag = '  <-- 疑似空图' if size < 300 else ''
        print(f'{os.path.basename(p):22s} {size:6d} bytes{flag}')

    print(f'\n共生成 {len(generated)} 个图标 → {OUT_DIR}')


if __name__ == '__main__':
    main()
