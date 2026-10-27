# -*- coding: utf-8 -*-
"""
作品工作室的缩略图生成器。

把 作品原图/红糖/ 下的原图统一压成 360px 缩略图，供工作室界面快速浏览。
原图动辄 2~4MB，130 张直接在浏览器里渲染会卡。

缩略图按「原文件名的 md5 前 10 位」命名，与 studio.js 的 id 一致，
已存在且比原图新的会跳过，所以重复调用很快。

用法：
    python scripts/studio-thumbs.py            # 补全缺失的缩略图
    python scripts/studio-thumbs.py --force    # 全部重建
"""

import os
import sys
import hashlib

try:
    from PIL import Image
except ImportError:
    print('NEED_PIL')
    sys.exit(2)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, '作品原图', '红糖')
THUMB_DIR = os.path.join(ROOT, 'output', '_studio', 'thumbs')

EXTS = ('.jpg', '.jpeg', '.png', '.webp', '.bmp')
THUMB_WIDTH = 360
THUMB_QUALITY = 72


def image_id(filename):
    return hashlib.md5(filename.encode('utf-8')).hexdigest()[:10]


def main():
    force = '--force' in sys.argv

    if not os.path.isdir(SRC_DIR):
        print('源目录不存在：' + SRC_DIR)
        return 1

    os.makedirs(THUMB_DIR, exist_ok=True)

    names = sorted(
        n for n in os.listdir(SRC_DIR)
        if os.path.isfile(os.path.join(SRC_DIR, n)) and n.lower().endswith(EXTS)
    )

    made = skipped = failed = 0
    for name in names:
        src = os.path.join(SRC_DIR, name)
        dst = os.path.join(THUMB_DIR, image_id(name) + '.jpg')

        if not force and os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
            skipped += 1
            continue

        try:
            with Image.open(src) as im:
                im = im.convert('RGB')
                w, h = im.size
                if w > THUMB_WIDTH:
                    im = im.resize((THUMB_WIDTH, round(h * THUMB_WIDTH / w)), Image.LANCZOS)
                im.save(dst, 'JPEG', quality=THUMB_QUALITY, optimize=True)
            made += 1
        except Exception as e:
            failed += 1
            print('  失败 %s：%s' % (name, e))

    # 清掉源图已删除的缩略图
    alive = {image_id(n) + '.jpg' for n in names}
    removed = 0
    for f in os.listdir(THUMB_DIR):
        if f not in alive:
            try:
                os.remove(os.path.join(THUMB_DIR, f))
                removed += 1
            except OSError:
                pass

    print('缩略图：新建 %d，跳过 %d，失败 %d，清理 %d' % (made, skipped, failed, removed))
    return 0


if __name__ == '__main__':
    sys.exit(main())
