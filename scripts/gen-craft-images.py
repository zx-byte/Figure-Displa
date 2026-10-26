# -*- coding: utf-8 -*-
"""
生成工序过程图（占位素材）。

真实使用时替换成自己拍的制作过程照片即可，文件名保持 craft-1..5.jpg。
这里用线框风格表达五个阶段：建模 / 翻模 / 打磨 / 上色 / 组装。
"""

import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'miniprogram', 'images', 'craft')

W, H = 600, 420
FONT_B = 'C:/Windows/Fonts/msyhbd.ttc'
FONT_R = 'C:/Windows/Fonts/msyh.ttc'

BG = (24, 24, 32)
LINE = (232, 232, 242)
DIM = (120, 120, 140)
BRAND = (255, 92, 57)


def base(idx, title, subtitle):
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img, 'RGBA')

    # 左侧序号条
    d.rectangle([0, 0, 8, H], fill=BRAND)

    f_idx = ImageFont.truetype(FONT_B, 68)
    f_title = ImageFont.truetype(FONT_B, 30)
    f_sub = ImageFont.truetype(FONT_R, 20)

    d.text((40, 34), f'{idx:02d}', font=f_idx, fill=(255, 255, 255, 40))
    d.text((40, 118), title, font=f_title, fill=LINE)
    d.text((40, 162), subtitle, font=f_sub, fill=DIM)

    return img, d


def draw_stats(d, right_x, items):
    """右侧标注几个规格点"""
    f = ImageFont.truetype(FONT_R, 17)
    y = 226
    for k, v in items:
        d.text((right_x, y), k, font=f, fill=DIM)
        d.text((right_x + 96, y), v, font=f, fill=LINE)
        y += 30


def craft_1():
    """三维建模：线框网格"""
    img, d = base(1, '三维建模', '确定比例与姿态，输出可打印网格')
    cx, cy = 430, 210

    # 网格球 + 网格柱
    for r in (58, 46, 34):
        d.ellipse([cx - r, cy - 96 - r // 2, cx + r, cy - 96 + r // 2], outline=(*LINE, 90), width=2)
    for i in range(-3, 4):
        x = cx + i * 18
        d.line([x, cy - 96 - 50, x, cy - 96 + 50], fill=(*DIM, 70), width=1)

    d.polygon([(cx - 34, cy), (cx + 34, cy), (cx + 52, cy + 118), (cx - 52, cy + 118)],
              outline=(*LINE, 110), width=2)
    for i in range(1, 5):
        y = cy + i * 24
        d.line([cx - 34 - i * 4, y, cx + 34 + i * 4, y], fill=(*DIM, 55), width=1)

    draw_stats(d, 40, [('面数', '12.8 万'), ('软件', 'Blender')])
    return img


def craft_2():
    """翻模注型：模具轮廓"""
    img, d = base(2, '翻模注型', '硅胶模具分片，树脂真空灌注')
    cx, cy = 430, 205

    # 左右两片模具
    d.polygon([(cx - 96, cy - 96), (cx - 12, cy - 96), (cx - 12, cy + 118), (cx - 96, cy + 118)],
              outline=(*LINE, 110), width=3)
    d.polygon([(cx + 12, cy - 96), (cx + 96, cy - 96), (cx + 96, cy + 118), (cx + 12, cy + 118)],
              outline=(*LINE, 110), width=3)

    # 内部空腔
    d.polygon([(cx - 74, cy - 70), (cx - 30, cy - 70), (cx - 30, cy + 96), (cx - 74, cy + 96)],
              outline=(*BRAND, 120), width=2)
    d.polygon([(cx + 30, cy - 70), (cx + 74, cy - 70), (cx + 74, cy + 96), (cx + 30, cy + 96)],
              outline=(*BRAND, 120), width=2)

    # 注胶口
    d.line([cx, cy - 118, cx, cy - 96], fill=BRAND, width=4)

    draw_stats(d, 40, [('模具', '4 片'), ('材料', '食品级硅胶')])
    return img


def craft_3():
    """手工打磨：砂纸纹理"""
    img, d = base(3, '手工打磨', '逐级砂纸去合模线，处理表面瑕疵')
    cx, cy = 430, 205

    # 人形轮廓
    d.ellipse([cx - 30, cy - 92, cx + 30, cy - 32], outline=(*LINE, 120), width=3)
    d.polygon([(cx - 40, cy - 22), (cx + 40, cy - 22), (cx + 58, cy + 116), (cx - 58, cy + 116)],
              outline=(*LINE, 120), width=3)

    # 打磨区域高亮
    d.arc([cx - 30, cy - 92, cx + 30, cy - 32], start=200, end=340, fill=BRAND, width=5)
    d.line([cx - 58, cy + 60, cx - 20, cy + 30], fill=(*BRAND, 190), width=4)
    d.line([cx + 20, cy + 30, cx + 58, cy + 60], fill=(*BRAND, 190), width=4)

    # 砂纸纹理短线
    for i in range(14):
        x = 320 + (i % 7) * 12
        y = 330 + (i // 7) * 14
        d.line([x, y, x + 8, y - 5], fill=(*DIM, 90), width=1)

    draw_stats(d, 40, [('目数', '240→2000'), ('耗时', '6 小时')])
    return img


def craft_4():
    """逐层上色：色块叠加"""
    img, d = base(4, '逐层上色', '底漆、面色、阴影、渍洗，逐层喷涂与手涂')
    cx, cy = 430, 205

    d.ellipse([cx - 30, cy - 92, cx + 30, cy - 32], fill=(*LINE, 30), outline=(*LINE, 110), width=2)
    d.polygon([(cx - 40, cy - 22), (cx + 40, cy - 22), (cx + 58, cy + 116), (cx - 58, cy + 116)],
              fill=(*LINE, 26), outline=(*LINE, 110), width=2)

    # 渐层色块，体现上色过程
    layers = [
        (cy - 80, cy - 40, 90),
        (cy - 30, cy + 20, 140),
        (cy + 26, cy + 80, 190),
        (cy + 86, cy + 120, 230),
    ]
    for y0, y1, a in layers:
        d.rectangle([cx - 24, y0, cx + 24, y1], fill=(*BRAND, a // 3))

    # 色板
    palette = [(255, 92, 57), (201, 162, 39), (108, 92, 231), (232, 232, 242)]
    for i, c in enumerate(palette):
        d.ellipse([300 + i * 30, 372, 324 + i * 30, 396], fill=c)

    draw_stats(d, 40, [('层数', '7 层'), ('耗时', '12 小时')])
    return img


def craft_5():
    """组装质检：成品"""
    img, d = base(5, '组装质检', '装配底座与配件，逐项检查后编号封盒')
    cx, cy = 462, 190

    # 成品剪影，实心
    d.ellipse([cx - 32, cy - 94, cx + 32, cy - 30], fill=LINE)
    d.polygon([(cx - 42, cy - 20), (cx + 42, cy - 20), (cx + 60, cy + 96), (cx - 60, cy + 96)], fill=LINE)
    d.ellipse([cx - 74, cy + 96, cx + 74, cy + 122], fill=(*LINE, 220))

    # 质检勾
    d.line([cx + 82, cy - 84, cx + 94, cy - 70], fill=BRAND, width=5)
    d.line([cx + 94, cy - 70, cx + 116, cy - 104], fill=BRAND, width=5)

    draw_stats(d, 40, [('检查项', '18 项'), ('编号', 'No.001-030')])
    return img


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    makers = [craft_1, craft_2, craft_3, craft_4, craft_5]
    for i, fn in enumerate(makers, start=1):
        img = fn()
        p = os.path.join(OUT_DIR, f'craft-{i}.jpg')
        img.save(p, 'JPEG', quality=84, optimize=True)
        print(f'craft-{i}.jpg  {os.path.getsize(p):6d} bytes')

    print(f'\n共 {len(makers)} 张 → {OUT_DIR}')


if __name__ == '__main__':
    main()
