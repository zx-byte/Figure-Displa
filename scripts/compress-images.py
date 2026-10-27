# -*- coding: utf-8 -*-
"""
作品图批量压缩。

小程序主包只有 2MB，手机直出的照片一张就 3-5MB，不压缩根本放不进去。
这个脚本把原图统一压到适合手机显示的尺寸和体积，并报告总占用。

用法：
    python scripts/compress-images.py                    # 默认读「作品原图/」目录
    python scripts/compress-images.py D:\\我的作品        # 指定源目录
    python scripts/compress-images.py D:\\作品 --width 640 --quality 70
    python scripts/compress-images.py D:\\作品 --rename    # 重命名为 work-01.jpg

参数：
    --width    最大宽度，默认 750（手机屏逻辑宽度 375 的 2 倍，够清晰）
    --quality  JPEG 质量，默认 75
    --out      输出目录，默认 miniprogram/images/works
    --budget   图片总预算（KB），默认 1500，超出会告警
    --rename   统一重命名为 work-01.jpg 形式，方便写进代码
    --only     清单文件路径，每行一个文件名，只压清单里的图（挑图进主包时用）
"""

import argparse
import os
import sys

from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_SRC = os.path.join(ROOT, '作品原图')
DEFAULT_OUT = os.path.join(ROOT, 'miniprogram', 'images', 'works')

EXTS = ('.jpg', '.jpeg', '.png', '.webp', '.bmp')


def human(nbytes):
    if nbytes >= 1024 * 1024:
        return f'{nbytes / 1024 / 1024:.2f} MB'
    return f'{nbytes / 1024:.0f} KB'


def pad(text, width, align='left'):
    """
    按终端显示宽度补齐
    中文等全角字符在终端占 2 列，用 len() 算宽度会导致表格错位
    """
    text = str(text)
    w = sum(2 if ord(c) > 127 else 1 for c in text)
    space = max(0, width - w)
    if align == 'right':
        return ' ' * space + text
    if align == 'center':
        left = space // 2
        return ' ' * left + text + ' ' * (space - left)
    return text + ' ' * space


def collect(src, only=None):
    """收集源目录下的所有图片（不含子目录）

    only 给定时只处理清单里列出的文件名，顺序按清单顺序。
    挑图进主包的场景靠这个，避免为了"只敲几张"而复制一整个临时目录。
    """
    if not os.path.isdir(src):
        return []
    if only:
        files = []
        for name in only:
            full = os.path.join(src, name)
            if os.path.isfile(full):
                files.append(full)
        return files

    files = []
    for name in sorted(os.listdir(src)):
        if name.lower().endswith(EXTS):
            full = os.path.join(src, name)
            if os.path.isfile(full):
                files.append(full)
    return files


def compress(path, out_path, max_width, quality):
    """
    压缩单张图
    返回 (原宽, 原高, 原大小, 新宽, 新高, 新大小)
    """
    orig_size = os.path.getsize(path)

    img = Image.open(path)
    # 按 EXIF 旋转摆正，否则竖拍的照片会躺倒
    img = ImageOps.exif_transpose(img)

    ow, oh = img.size

    # 有透明通道的合成到白底，否则转 JPEG 会变黑
    if img.mode in ('RGBA', 'LA', 'P'):
        img = img.convert('RGBA')
        bg = Image.new('RGB', img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[-1])
        img = bg
    else:
        img = img.convert('RGB')

    # 只缩小不放大
    if ow > max_width:
        ratio = max_width / ow
        nw = max_width
        nh = max(1, int(oh * ratio))
        img = img.resize((nw, nh), Image.LANCZOS)
    else:
        nw, nh = ow, oh

    # 保存时去掉 EXIF，能省几 KB
    img.save(out_path, 'JPEG', quality=quality, optimize=True, progressive=True)

    return ow, oh, orig_size, nw, nh, os.path.getsize(out_path)


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument('src', nargs='?', default=DEFAULT_SRC, help='源图目录')
    ap.add_argument('--width', type=int, default=750, help='最大宽度')
    ap.add_argument('--quality', type=int, default=75, help='JPEG 质量')
    ap.add_argument('--out', default=DEFAULT_OUT, help='输出目录')
    ap.add_argument('--budget', type=int, default=1500, help='图片总预算 KB')
    ap.add_argument('--rename', action='store_true', help='统一重命名')
    ap.add_argument('--only', default=None, help='清单文件，每行一个文件名，只压这些')
    args = ap.parse_args()

    src = os.path.abspath(args.src)
    out = os.path.abspath(args.out)

    only = None
    if args.only:
        with open(args.only, encoding='utf-8') as f:
            only = [line.strip() for line in f if line.strip()]

    files = collect(src, only)
    if not files:
        print(f'✗ 在 {src} 下没有找到图片')
        print('')
        print('请把作品原图放进这个目录后重试，支持格式：')
        print('  ' + '  '.join(e.lstrip('.') for e in EXTS))
        print('')
        print('也可以直接指定源目录：')
        print('  python scripts/compress-images.py D:\\我的作品')
        sys.exit(1)

    os.makedirs(out, exist_ok=True)

    print('=' * 78)
    print(' 作品图批量压缩')
    print('=' * 78)
    print(f' 源目录 : {src}')
    print(f' 输出   : {out}')
    print(f' 规格   : 最大宽 {args.width}px，质量 {args.quality}')
    print('=' * 78)
    print('')

    col = dict(name=26, dim=12, size=10, ratio=8)
    header = (
        pad('文件名', col['name'])
        + pad('原尺寸', col['dim'])
        + pad('原大小', col['size'], 'right')
        + '  '
        + pad('新尺寸', col['dim'])
        + pad('新大小', col['size'], 'right')
        + pad('压缩', col['ratio'], 'right')
    )
    print(header)
    print('-' * 78)

    total_orig = 0
    total_new = 0
    table = []

    for i, path in enumerate(files, start=1):
        name = os.path.basename(path)
        if args.rename:
            out_name = f'work-{i:02d}.jpg'
        else:
            out_name = os.path.splitext(name)[0] + '.jpg'

        out_path = os.path.join(out, out_name)

        try:
            ow, oh, osz, nw, nh, nsz = compress(path, out_path, args.width, args.quality)
        except Exception as e:
            print(f'{pad(name, col["name"])}处理失败：{e}')
            continue

        total_orig += osz
        total_new += nsz
        ratio = (1 - nsz / osz) * 100 if osz else 0

        display = name if sum(2 if ord(c) > 127 else 1 for c in name) <= 24 else name[:10] + '…'
        print(
            pad(display, col['name'])
            + pad(f'{ow}x{oh}', col['dim'])
            + pad(human(osz), col['size'], 'right')
            + '  '
            + pad(f'{nw}x{nh}', col['dim'])
            + pad(human(nsz), col['size'], 'right')
            + pad(f'{ratio:.0f}%', col['ratio'], 'right')
        )
        table.append((out_name, nw, nh, nsz))

    print('-' * 78)
    print(
        f'合计 {len(table)} 张：原 {human(total_orig)} → {human(total_new)}'
        f'（节省 {(1 - total_new / total_orig) * 100:.1f}%）'
    )
    print('')

    budget_bytes = args.budget * 1024
    used_pct = total_new / budget_bytes * 100
    print(f'图片总预算 {args.budget} KB，已用 {human(total_new)}（{used_pct:.0f}%）')
    if total_new <= budget_bytes:
        print(f'✓ 余量 {human(budget_bytes - total_new)}')
    else:
        print(f'✗ 超出 {human(total_new - budget_bytes)}')
        print('')
        print('超出后的选择：')
        print('  1. 降低质量或宽度重跑：--width 640 --quality 70')
        print('  2. 减少每件作品的图片数量（1-2 张主图就够）')
        print('  3. 开通云开发把图片放到云存储（容量不再受限）')

    print('')
    print('=' * 78)
    print(' 输出清单（可直接写进 config/mock.js 的 images 数组）')
    print('=' * 78)
    for name, w, h, size in table:
        print(f"  '/images/works/{name}',   // {w}x{h}  {human(size)}")
    print('')
    print('提示：图片已按 EXIF 摆正、去掉了元数据。若原图是竖拍，方向会自动修正。')


if __name__ == '__main__':
    main()
