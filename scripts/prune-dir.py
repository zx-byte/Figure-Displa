# -*- coding: utf-8 -*-
"""
按清单裁剪目录内容：只保留清单里的文件，其余删掉。

作品工作室用它对齐 miniprogram/images/works/ 这类产物目录。
之所以不放在 node 侧做——Node 的 unlink 在当前环境下会偶发 EBUSY，
Python 的 os.remove 稳定得多。

用法：
    python scripts/prune-dir.py <目录> <清单文件>

清单文件每行一个文件名。以 . 开头的文件（.gitkeep 等）始终保留。
输出 `REMOVED <n> FAILED <m>`，供调用方解析。
"""

import os
import sys


def main():
    if len(sys.argv) < 3:
        print('用法: python scripts/prune-dir.py <目录> <清单文件>')
        return 2

    target = sys.argv[1]
    listfile = sys.argv[2]

    if not os.path.isdir(target):
        print('REMOVED 0 FAILED 0')
        return 0

    try:
        with open(listfile, encoding='utf-8') as f:
            keep = {line.strip() for line in f if line.strip()}
    except OSError as e:
        print('清单读取失败：%s' % e)
        return 1

    removed = failed = 0
    for name in os.listdir(target):
        if name in keep or name.startswith('.'):
            continue
        full = os.path.join(target, name)
        if not os.path.isfile(full):
            continue
        try:
            os.remove(full)
            removed += 1
        except OSError:
            failed += 1

    print('REMOVED %d FAILED %d' % (removed, failed))
    return 0


if __name__ == '__main__':
    sys.exit(main())
